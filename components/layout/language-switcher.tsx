"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/lib/cx";
import { languageFromPath } from "@/lib/routing/language-path";
import {
  planLanguageSwitch,
  switchFailureMessage,
} from "@/lib/routing/language-switch";
import { switchLanguageAction } from "@/app/(app)/language-actions";

export type SwitcherLanguage = {
  code: string;
  /** The English name, which is what the trigger reads. */
  name: string;
  /** The language's own name, shown second in the list. */
  nativeName: string;
  flag: string | null;
  /** The learner's level in this language, if they set one. */
  level: string | null;
  /** The persisted active language, used only for the initial guess. */
  isPrimary: boolean;
};

/**
 * The language switcher.
 *
 * This was a link to `/languages`, which meant choosing a language was a full
 * navigation through a picker page and back — the shell unmounted, the rail
 * rebuilt, and the learner lost the screen they were on. It is now a dropdown
 * that changes the language in place.
 *
 * Three decisions carry the behaviour:
 *
 *   1. **The URL decides the current language, not the database.** The pathname
 *      is what the learner is actually looking at, and using the stored primary
 *      would show the wrong language for as long as someone browses another one.
 *      The stored primary is only the fallback for paths with no language in them.
 *   2. **`router.push` with a rewritten pathname, never a document navigation.**
 *      `window.location` and a plain form post both reload the whole app: the
 *      shell flashes, the rail rebuilds, and in-flight audio dies. The path is
 *      rewritten so `/fr/settings` becomes `/es/settings` instead of dropping the
 *      learner on the dashboard — content ids that only exist in one language
 *      (`/fr/lesson/…`) do fall back, and `replaceLanguageInPath` decides which
 *      is which.
 *   3. **The server write happens alongside the navigation, not after it.** The
 *      URL is optimistic so the switch feels instant; the action persists the
 *      active language so a reload agrees with what the learner sees. If the
 *      write fails, both the label and the URL go back and a small error is
 *      shown, because a URL that disagrees with the stored language is exactly
 *      the state this is supposed to prevent.
 */
export function LanguageSwitcher({
  languages,
  className,
}: {
  languages: SwitcherLanguage[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // `useSearchParams`, never `window.location.search`: reading `window` during
  // render makes the server and client disagree on the first paint.
  const search = useSearchParams().toString();

  /*
   * "Open" is stored as the path it was opened on rather than a boolean, so a
   * route change closes the menu for free. An effect that called `setOpen(false)`
   * on `pathname` would be a second render pass for something the state itself
   * can express — and the menu is only ever open on the route it was opened from.
   */
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, startNavigation] = useTransition();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  /**
   * Which item to focus once the menu has actually mounted.
   *
   * `-1` means "do not move focus": a pointer opening the menu should not yank
   * the caret into it or paint a focus ring on the selected row, which reads as a
   * heavy border on a control the learner just tapped.
   */
  const focusOnOpenRef = useRef(-1);

  const open = openedAtPath === pathname;

  const menuId = useId();
  const triggerId = useId();

  const codes = useMemo(() => languages.map((language) => language.code), [languages]);
  const storedPrimary =
    languages.find((language) => language.isPrimary)?.code ?? languages[0]?.code ?? "";
  const urlCode = languageFromPath(pathname, codes, storedPrimary);
  const currentCode = optimistic ?? urlCode;
  const current =
    languages.find((language) => language.code === currentCode) ??
    languages.find((language) => language.code === storedPrimary) ??
    null;

  // The menu's items, in the order they are rendered: the languages, then the
  // "Add language" action. Keeping this in one array is what lets one set of
  // arrow-key handlers cover both without special cases.
  const itemCount = languages.length + 1;
  const selectedIndex = Math.max(
    0,
    languages.findIndex((language) => language.code === currentCode),
  );

  const close = useCallback((returnFocus: boolean) => {
    setOpenedAtPath(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openAt = useCallback(
    (index: number, moveFocus: boolean) => {
      setError(null);
      setActiveIndex(index);
      focusOnOpenRef.current = moveFocus ? index : -1;
      setOpenedAtPath(pathname);
    },
    [pathname],
  );

  // A pointer anywhere outside dismisses. `pointerdown` rather than `click`, so
  // the menu is gone before the underlying control reacts to the same gesture.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenedAtPath(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Opening moves focus into the list; the alternative is a menu a keyboard user
  // cannot reach without tabbing through the rest of the header. This touches the
  // DOM only — the index it focuses was decided by `openAt`, before the menu
  // existed.
  useEffect(() => {
    if (!open) return;
    const index = focusOnOpenRef.current;
    if (index >= 0) itemRefs.current[index]?.focus();
  }, [open]);

  async function choose(code: string) {
    const plan = planLanguageSwitch({
      pathname,
      search,
      currentCode,
      nextCode: code,
      knownCodes: codes,
    });

    if (!plan.changesLanguage) {
      close(true);
      return;
    }

    setError(null);
    setOptimistic(code);
    close(true);

    // Both start together: the navigation is what the learner perceives, the
    // action is what makes it durable. Awaiting the write first would put a
    // server round trip in front of every switch.
    startNavigation(() => router.push(plan.nextPath));

    /*
     * The write can fail in two different ways and both land in the same place:
     * the action returns `{ error }` for a rejected write, and the promise
     * rejects when the request never completed. `switchFailureMessage` decides
     * which happened; either way the label and the URL go back, because a URL
     * that disagrees with the stored language is exactly what this prevents.
     */
    let failure: string | null;
    try {
      failure = switchFailureMessage(await switchLanguageAction(code));
    } catch (thrown) {
      failure = switchFailureMessage(null, thrown);
    }

    if (failure) {
      setOptimistic(null);
      setError(failure);
      // Back to exactly where they were, including a content id the forward
      // path had to drop.
      startNavigation(() => router.replace(plan.originalHref));
      return;
    }

    setOptimistic(null);
  }

  /**
   * One key handler for the whole control, on the wrapper rather than the menu.
   *
   * With a pointer-opened menu, focus stays on the trigger — so the menu's own
   * `onKeyDown` would never see an arrow key. Listening on the wrapper catches
   * events from both the trigger and the items.
   */
  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openAt(selectedIndex, true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      // Let the browser move focus; the menu must not trap it.
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

  if (!current) return null;

  const busy = isNavigating || optimistic !== null;

  return (
    <div ref={rootRef} className={cx("relative", className)} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={(event) => {
          if (open) {
            close(false);
            return;
          }
          // `detail === 0` is a keyboard activation (Enter or Space). Only then
          // does focus move into the list.
          openAt(selectedIndex, event.detail === 0);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={`Learning ${current.name} — switch language`}
        /*
         * 44px on a phone, where this is a thumb target, and 36px from `sm` up,
         * where it lines up with the theme and settings controls beside it.
         */
        className="flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-[var(--radius)] border border-line bg-surface-raised px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-hover sm:min-h-[36px]"
      >
        <span aria-hidden="true" className="shrink-0 leading-none">
          {current.flag ?? "🌐"}
        </span>
        <span className="min-w-0 truncate font-medium text-primary">{current.name}</span>
        {current.level ? (
          <span className="hidden shrink-0 rounded-[var(--radius-sm)] bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted sm:inline">
            {current.level}
          </span>
        ) : null}
        {busy ? (
          <Spinner />
        ) : (
          <Icon
            name="chevronDown"
            size={14}
            className={cx(
              "shrink-0 text-muted transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className="absolute left-0 top-[calc(100%+0.4rem)] z-40 w-64 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface-raised py-1 shadow-[var(--shadow-float)]"
        >
          {languages.map((language, index) => {
            const selected = language.code === currentCode;
            return (
              <button
                key={language.code}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={-1}
                onClick={() => void choose(language.code)}
                className={cx(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]",
                  selected ? "bg-accent-subtle" : "hover:bg-surface-hover",
                )}
              >
                <span aria-hidden="true" className="shrink-0 text-base leading-none">
                  {language.flag ?? "🌐"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-primary">
                    {language.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {language.nativeName === language.name
                      ? language.level ?? "Not placed yet"
                      : language.nativeName}
                  </span>
                </span>
                {language.level ? (
                  <span className="shrink-0 rounded-[var(--radius-sm)] bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                    {language.level}
                  </span>
                ) : null}
                {selected ? (
                  <span className="shrink-0 text-accent" aria-hidden="true">
                    <Icon name="check" size={15} />
                  </span>
                ) : (
                  <span className="size-[15px] shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}

          <div className="my-1 border-t border-line" role="separator" />

          <Link
            ref={(element) => {
              itemRefs.current[languages.length] = element;
            }}
            href="/languages"
            role="menuitem"
            tabIndex={-1}
            onClick={() => close(false)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-medium text-primary transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
          >
            <span
              aria-hidden="true"
              className="flex size-4 shrink-0 items-center justify-center text-accent"
            >
              <Icon name="plus" size={16} />
            </span>
            Add language
          </Link>
        </div>
      ) : null}

      {/*
        Announced rather than only drawn: a failed switch has already put the
        label back, so without this a screen reader user would see the language
        revert with no explanation.
      */}
      <span aria-live="polite" className="sr-only">
        {error ?? ""}
      </span>

      {error ? (
        <p
          role="alert"
          className="absolute left-0 top-[calc(100%+0.4rem)] z-40 w-64 rounded-[var(--radius)] border border-line bg-surface-raised px-3 py-2 text-xs text-primary shadow-[var(--shadow-float)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A quiet indeterminate mark; the switch is usually faster than it can be read. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent"
    />
  );
}
