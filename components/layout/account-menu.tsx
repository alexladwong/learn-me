"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const focusOnOpenRef = useRef(-1);
  const menuId = useId();
  const triggerId = useId();

  const open = openedAtPath === pathname;

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

  const panel = (
    <>
      {/* Backdrop, mobile only. `lg:hidden` keeps the desktop popover unobscured. */}
      <div
        aria-hidden="true"
        onClick={() => close(false)}
        className="fixed inset-0 z-40 bg-[oklch(24%_0.028_225/0.35)] lg:hidden"
      />

      <div
        id={menuId}
        role="menu"
        aria-labelledby={triggerId}
        className={[
          // Mobile: bottom sheet.
          "sheet-up fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden",
          "rounded-t-[1.5rem] border-t border-line bg-surface-raised",
          "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          // Desktop: compact popover, restoring the positional reset the sheet undoes.
          "lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-[calc(100%+0.5rem)] lg:z-50 lg:w-64",
          "lg:rounded-[var(--radius-xl)] lg:border lg:shadow-[var(--shadow-float)] lg:pb-1",
        ].join(" ")}
      >
        {/* Grab handle — the visual cue that this panel came from the bottom. */}
        <div aria-hidden="true" className="flex justify-center py-2.5 lg:hidden">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

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

        {/* Appearance moved out of the mobile header and in here. */}
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
      {open && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}
