"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useSignOut } from "@/lib/auth/sign-out-client";

/**
 * The account menu.
 *
 * ## Two presentations, one DOM tree
 *
 * On a phone this is a **bottom sheet**: full width, anchored to the bottom,
 * sliding up, respecting the safe area, dismissable by tapping the backdrop. On
 * desktop it stays a compact popover under the avatar. Which one you get is
 * decided entirely by CSS breakpoints — no JavaScript media query, so there is
 * no server/client disagreement and no hydration mismatch.
 *
 * ## Why it is rendered through a portal
 *
 * The sheet is `position: fixed`, and the header it lives in has
 * `backdrop-blur-md`. A `backdrop-filter` makes an element the **containing
 * block for fixed descendants**, so a "fixed" sheet rendered inside the header
 * would be positioned against the header rather than the viewport — it would
 * appear under the avatar, clipped to a 56px strip. The portal escapes that.
 *
 * ## What is in it
 *
 * The theme control lives here on mobile because the top bar no longer carries
 * its own icon: the header keeps only the language switcher and the avatar, so
 * the top of the app has room to breathe. Sign out sits last behind a separator,
 * which is what makes it unmistakable without making it alarming.
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
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const { signOut, pending, error } = useSignOut();

  const rootRef = useRef<HTMLDivElement | null>(null);
  /** The portalled panel, which is NOT inside `rootRef` — see the handler below. */
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const focusOnOpenRef = useRef(-1);
  const menuId = useId();
  const triggerId = useId();

  const open = openedAtPath === pathname;
  /*
   * Which presentation to render.
   *
   * Resolved on the client only — the panel does not exist during SSR, because
   * `open` cannot be true until a learner interacts, so there is no server/client
   * disagreement to worry about.
   */
  const isDesktop = useIsDesktop();

  const links = [
    { href: `/${lang}/progress`, label: "Profile", icon: "profile" as const },
    { href: `/${lang}/settings`, label: "Settings", icon: "settings" as const },
    { href: "/languages", label: "Languages", icon: "globe" as const },
  ];

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

  // Outside click closes. On mobile the backdrop handles taps outside the sheet;
  // this covers the desktop popover.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      /*
       * Both the trigger wrapper AND the portalled panel count as "inside".
       *
       * The panel is rendered into `document.body` so that the header's
       * `backdrop-filter` cannot trap it, which means it is not a DOM descendant
       * of `rootRef`. Checking only `rootRef` therefore treated a tap on any item
       * — including Sign out — as an outside click, closing the sheet on
       * `pointerdown` before the `click` could land. The button never fired and
       * the learner simply could not sign out.
       *
       * This was invisible to the test suite because a synthetic `.click()` sends
       * no `pointerdown` at all.
       */
      const target = event.target as Node;
      const inside =
        rootRef.current?.contains(target) || panelRef.current?.contains(target);
      if (!inside) setOpenedAtPath(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = focusOnOpenRef.current;
    if (index >= 0) itemRefs.current[index]?.focus();
  }, [open]);

  // Links plus Sign out. The appearance row holds its own tabbable control, so it
  // is deliberately outside the roving focus order rather than fighting it.
  const itemCount = links.length + 1;

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
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

  const itemClass =
    "press flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[0.9375rem] text-primary hover:bg-surface-hover lg:min-h-0 lg:px-3 lg:py-2.5 lg:text-sm";

  /*
   * The items, shared by both presentations.
   *
   * Only one of the two wrappers below is ever mounted, so `menuId` and the menu
   * roles are never duplicated in the document.
   */
  const content = (
    <>
      <div className="px-4 pb-3 lg:px-3 lg:pb-2 lg:pt-2.5">
        <p className="truncate text-base font-semibold text-primary lg:text-sm lg:font-medium">
          {name}
        </p>
        <p className="truncate text-sm text-muted lg:text-xs">{email}</p>
      </div>

      <div className="border-t border-line" role="separator" />

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
          className={itemClass}
        >
          <Icon name={link.icon} size={18} />
          {link.label}
        </Link>
      ))}

      {/* Appearance lives in the header on desktop, so it is mobile-only here. */}
      <div className="press flex min-h-[48px] items-center gap-3 px-4 lg:hidden">
        <Icon name="sun" size={18} />
        <span className="flex-1 text-[0.9375rem] text-primary">Appearance</span>
        <ThemeToggle />
      </div>

      <div className="border-t border-line" role="separator" />

      {error ? (
        <p role="alert" className="px-4 py-2 text-xs font-medium text-danger lg:px-3">
          {error}
        </p>
      ) : null}

      <button
        ref={(element) => {
          itemRefs.current[links.length] = element;
        }}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-busy={pending}
        onClick={() => void signOut(() => close(false))}
        className={`${itemClass} font-medium`}
      >
        <Icon name="logout" size={18} />
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </>
  );

  /*
   * Desktop: a popover anchored to the trigger.
   *
   * This one is rendered **inline**, inside `rootRef`, which is `relative`. That
   * is what makes `absolute right-0 top-[calc(100%+0.5rem)]` mean "flush with the
   * avatar's right edge, just under it". Portalling it here would strip the
   * positioned ancestor and resolve those offsets against the initial containing
   * block — a viewport height down and the document's right edge, which is the
   * bottom-right corner of the window.
   */
  const desktopPanel = (
    <div
      ref={panelRef}
      id={menuId}
      role="menu"
      aria-labelledby={triggerId}
      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface-raised py-1 shadow-[var(--shadow-float)] xl:w-80"
    >
      {content}
    </div>
  );

  /*
   * Mobile: still a bottom sheet through a portal.
   *
   * It needs the portal because the header carries `backdrop-filter`, and a
   * backdrop-filter makes an element the containing block for `position: fixed`
   * descendants — without escaping, a "fixed" sheet would be trapped inside the
   * 48px header bar.
   */
  const mobilePanel = (
    <>
      <div
        aria-hidden="true"
        onClick={() => close(false)}
        className="fixed inset-0 z-40 bg-[oklch(24%_0.028_225/0.35)]"
      />
      <div
        ref={panelRef}
        id={menuId}
        role="menu"
        aria-labelledby={triggerId}
        className="sheet-up fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[1.5rem] border-t border-line bg-surface-raised pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div aria-hidden="true" className="flex justify-center py-2.5">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        {content}
      </div>
    </>
  );

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

      {/* Portalled out of the header, whose backdrop-filter would otherwise trap
          a fixed-position panel. */}
      {open
        ? isDesktop
          ? desktopPanel
          : typeof document !== "undefined"
            ? createPortal(mobilePanel, document.body)
            : null
        : null}
    </div>
  );
}

/**
 * `matchMedia` as an external store.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` for the same reason
 * the rail uses it: no setState during an effect, a defined server snapshot, and
 * no cascading render. The server snapshot is `false`, which is safe because the
 * account panel is only ever mounted after a client interaction.
 */
function useIsDesktop(): boolean {
  const query = "(min-width: 1024px)";
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
