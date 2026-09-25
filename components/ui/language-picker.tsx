"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/icon";
import type { Language } from "@/lib/types";

/**
 * A searchable language picker, built as a real ARIA combobox.
 *
 * This replaces a native `<select>`. The native control was not merely plain to
 * look at: it rendered as a full-width OS-drawn popup that ignored the product's
 * entire visual system, so the second step of onboarding looked like a different
 * application from the first. On a list of fourteen languages it was also
 * unscannable, because a native select cannot be searched or show two names per
 * row.
 *
 * What it does:
 *   - filters on both the English and the native name, so "Español" and "Spanish"
 *     both find Spanish, and Arabic can be found by typing either "arabic" or
 *     "العربية";
 *   - full keyboard control (arrows, Home/End, Enter, Escape, Tab);
 *   - `role="combobox"` with `aria-activedescendant`, so a screen reader
 *     announces the highlighted option rather than going silent;
 *   - renders each name with its own `dir`, so an RTL language name is displayed
 *     right-to-left inside an LTR page.
 *
 * The popup is rendered in normal flow (not portalled) but is absolutely
 * positioned, and the list is capped and scrollable so a long catalogue cannot
 * push the page around or run off the bottom of a phone screen.
 */

export function LanguagePicker({
  value,
  onChange,
  languages,
  label,
  hint,
  placeholder = "Search languages",
  id,
  name,
}: {
  value: string;
  onChange: (code: string) => void;
  languages: Language[];
  label: string;
  hint?: string;
  placeholder?: string;
  id?: string;
  /** Form field name. Without it the value would not reach the submission. */
  name?: string;
}) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listId = `${baseId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = languages.find((language) => language.code === value) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return languages;
    return languages.filter(
      (language) =>
        language.name_en.toLowerCase().includes(needle) ||
        language.name_native.toLowerCase().includes(needle) ||
        language.code.toLowerCase().startsWith(needle),
    );
  }, [languages, query]);

  // Keep the highlight inside the filtered range. Derived during render rather
  // than clamped in an effect: an effect would render one frame with the stale
  // index, and `aria-activedescendant` would briefly point at a row that no
  // longer exists.
  const safeIndex = matches.length === 0 ? 0 : Math.min(activeIndex, matches.length - 1);

  // Close when focus or a click leaves the control.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const commit = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (matches.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((previous) => {
        const next = previous + delta;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(Math.max(0, matches.length - 1));
      return;
    }

    if (event.key === "Enter") {
      if (open && matches[safeIndex]) {
        event.preventDefault();
        commit(matches[safeIndex].code);
      }
      return;
    }

    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
      return;
    }

    if (event.key === "Tab" && open) {
      // Tab accepts the highlighted option rather than losing the choice.
      if (matches[safeIndex]) commit(matches[safeIndex].code);
    }
  };

  const displayValue = open ? query : selected ? selected.name_en : "";

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      <label htmlFor={baseId} className="text-sm font-medium text-primary">
        {label}
      </label>
      {hint ? <p className="text-xs text-secondary">{hint}</p> : null}

      <div className="relative">
        <div
          className={cx(
            "flex min-h-[48px] items-center gap-2 rounded-[var(--radius)] border bg-surface-raised px-3.5",
            open ? "border-accent" : "border-line-strong",
          )}
        >
          <Icon name="globe" size={16} />
          <input
            ref={inputRef}
            id={baseId}
            // Deliberately NOT a named form field. This is a search box, so its
            // value is whatever the learner typed — including empty. Submitting
            // it sent the query text as the answer, so an untouched picker posted
            // "" and the server rejected it with "expected string to have >=2
            // characters". The choice goes in the hidden input below instead.
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && matches[safeIndex] ? `${baseId}-option-${matches[safeIndex].code}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-primary outline-none placeholder:text-muted"
            placeholder={placeholder}
            value={displayValue}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {selected && !open ? (
            <span
              className="shrink-0 truncate text-sm text-secondary"
              dir={selected.direction === "rtl" ? "rtl" : undefined}
            >
              {selected.name_native}
            </span>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? "Close the language list" : "Open the language list"}
            onClick={() => {
              setOpen((previous) => !previous);
              inputRef.current?.focus();
            }}
            className={cx("shrink-0 text-muted transition-transform", open && "rotate-180")}
          >
            <Icon name="chevronDown" size={16} />
          </button>
        </div>

        {/* The submitted value: the selected language code, not the query. */}
        {name ? <input type="hidden" name={name} value={value} /> : null}

        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-[var(--radius)] border border-line-strong bg-surface-raised py-1 shadow-[var(--shadow-raised)]"
          >
            {matches.length === 0 ? (
              <li className="px-3.5 py-3 text-sm text-muted">
                No language matches “{query}”.
              </li>
            ) : (
              matches.map((language, index) => {
                const isActive = index === safeIndex;
                const isSelected = language.code === value;
                return (
                  <li
                    key={language.code}
                    id={`${baseId}-option-${language.code}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      // Fires before the input's blur, so the choice is not lost.
                      event.preventDefault();
                      commit(language.code);
                    }}
                    className={cx(
                      "flex min-h-[44px] cursor-pointer items-center gap-3 px-3.5 py-2",
                      isActive ? "bg-accent-subtle" : "bg-transparent",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-primary">
                        {language.name_en}
                      </span>
                      <span
                        className="block truncate text-xs text-secondary"
                        dir={language.direction === "rtl" ? "rtl" : undefined}
                      >
                        {language.name_native}
                      </span>
                    </span>
                    {isSelected ? (
                      <span className="shrink-0 text-accent" aria-hidden="true">
                        <Icon name="check" size={15} />
                      </span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
