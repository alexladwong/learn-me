"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/lib/cx";
import { signOutAction } from "@/app/(auth)/actions";

/**
 * The account menu.
 *
 * ## Why this exists
 *
 * Sign out previously lived **only** in the desktop rail's footer. Below `lg` that
 * rail is `hidden`, so on a phone — and in the Capacitor shell, which is always a
 * phone — there was no way to sign out at all. The learner's only route was to
 * guess that Settings → Account had one, several screens deep.
 *
 * The avatar was already sitting in the top bar on every screen doing nothing but
 * showing two letters. It is now the trigger, which gives every size the same
 * answer: tap your face, tap Sign out.
 *
 * ## Behaviour
 *
 * Deliberately mirrors the language switcher rather than inventing a second set
 * of patterns: open on click, close on outside pointerdown, Escape closes and
 * returns focus, arrow keys move between items, `role="menu"` with
 * `menuitem`/`separator` children. Two controls that behave differently for no
 * reason is worse than either behaviour on its own.
 */
export function AccountMenu({
  name,
  email,
  lang,
  initials,
}: {
  name: string;
  email: string;
  lang: string;
  initials: string;
}) {
  const pathname = usePathname();
  /*
   * Open state is derived from the path it was opened on, so a navigation closes
   * the menu without an effect that would cause a second render pass.
   */
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const focusOnOpenRef = useRef(-1);

  const open = openedAtPath === pathname;
  const menuId = useId();
  const triggerId = useId();

  const links = [
    { href: `/${lang}/progress`, label: "Profile", icon: "profile" as const },
    { href: `/${lang}/settings`, label: "Settings", icon: "settings" as const },
    { href: "/languages", label: "Languages", icon: "globe" as const },
  ];
  // Three links, then a separator, then sign out.
  const itemCount = links.length + 1;

  const close = useCallback((returnFocus: boolean) => {
    setOpenedAtPath(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openAt = useCallback(
    (index: number, moveFocus: boolean) => {
      setActiveIndex(index);
      focusOnOpenRef.current = moveFocus ? index : -1;
      setOpenedAtPath(pathname);
    },
    [pathname],
  );

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenedAtPath(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = focusOnOpenRef.current;
    if (index >= 0) itemRefs.current[index]?.focus();
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openAt(0, true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (activeIndex + step + itemCount) % itemCount;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : itemCount - 1;
      setActiveIndex(next);
      itemRefs.current[next]?.focus();
    }
  }

  /**
   * Clear everything this device holds about the learner before the session is
   * revoked.
   *
   * The server action removes the cookies, which is what actually signs them
   * out — this only clears *client* residue: a pending native OAuth request id
   * (which would otherwise be left behind to be matched against a future deep
   * link) and any cached responses. Without this, a stale request id can outlive
   * the session that created it.
   */
  function clearClientState() {
    try {
      window.sessionStorage.removeItem("learnme:native-auth-request");
    } catch {
      // Storage disabled; nothing was stored.
    }
    if ("caches" in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
  }

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={(event) => {
          if (open) {
            close(false);
            return;
          }
          // `detail === 0` is a keyboard activation, which is the only case that
          // should move focus into the list.
          openAt(0, event.detail === 0);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account, ${name}`}
        title={`${name} — account`}
        className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold uppercase text-accent"
      >
        {initials}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface-raised py-1 shadow-[var(--shadow-float)]"
        >
          {/* Identity, not a control: a learner should be able to confirm which
              account they are in without signing out to find out. */}
          <div className="px-3 pb-2 pt-2.5">
            <p className="truncate text-sm font-medium text-primary">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>

          <div className="my-1 border-t border-line" role="separator" />

          {links.map((link, index) => (
            <Link
              key={link.href}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              href={link.href}
              role="menuitem"
              tabIndex={-1}
              onClick={() => close(false)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-primary transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
            >
              <Icon name={link.icon} size={16} />
              {link.label}
            </Link>
          ))}

          <div className="my-1 border-t border-line" role="separator" />

          {/*
            Sign out is last and behind a separator, which is what makes it
            unmistakable without making it alarming. It is a form, not a link: it
            mutates server state by revoking the session, and only a Server Action
            can clear the httpOnly cookies.
          */}
          <form
            action={signOutAction}
            onSubmit={clearClientState}
            className="contents"
          >
            <button
              ref={(element) => {
                itemRefs.current[links.length] = element;
              }}
              type="submit"
              role="menuitem"
              tabIndex={-1}
              disabled={submitting}
              onClick={() => setSubmitting(true)}
              className={cx(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium transition-colors",
                "text-primary hover:bg-surface-hover",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]",
                submitting && "opacity-60",
              )}
            >
              <Icon name="logout" size={16} />
              {submitting ? "Signing out…" : "Sign out"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
