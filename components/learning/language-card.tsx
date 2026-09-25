"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/icon";
import type { Language } from "@/lib/types";

/**
 * A language, presented as something a person speaks rather than a catalogue row.
 *
 * Deliberate choices:
 *
 *   - **The native name is the headline.** "Español", "العربية", "日本語". A
 *     learner is choosing a language to live in, and that language's own name is
 *     the one they will meet first.
 *   - **The script is shown, not described.** The greeting renders in the target
 *     script with the correct `dir`, so Arabic appears right-to-left inside this
 *     left-to-right page. That is the single strongest signal that this is a real
 *     language and not a row in a table.
 *   - **No flag as identity.** A flag names a country: Spanish, Arabic and Swahili
 *     are each spoken across many, and a learner in Lagos choosing "English" is
 *     not choosing a flag. Where an emoji is shown it is small, secondary, and
 *     never the only marker.
 *
 * The whole card is the control — a large hit area, and one link or one button
 * rather than a card containing a smaller "select" affordance.
 */
export function LanguageCard({
  language,
  selected = false,
  onSelect,
  href,
  quiet = false,
}: {
  language: Language;
  selected?: boolean;
  onSelect?: (code: string) => void;
  href?: string;
  /** Muted treatment for languages that are not learnable yet. */
  quiet?: boolean;
}) {
  const greeting = language.greeting_native;
  const greetingEnglish = language.greeting_english;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="truncate text-lg font-semibold tracking-tight text-primary"
            dir={language.direction === "rtl" ? "rtl" : undefined}
          >
            {language.name_native}
          </p>
          <p className="mt-0.5 truncate text-sm text-secondary">
            {language.name_en}
            {language.flag_emoji ? (
              <span aria-hidden="true" className="ml-1.5 text-xs opacity-70">
                {language.flag_emoji}
              </span>
            ) : null}
          </p>
        </div>

        {selected ? (
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
            aria-hidden="true"
          >
            <Icon name="check" size={14} />
          </span>
        ) : null}
      </div>

      {greeting ? (
        <div className="mt-4 border-t border-line pt-3">
          <p
            className="text-target font-medium text-primary"
            dir={language.direction === "rtl" ? "rtl" : undefined}
          >
            {greeting}
          </p>
          {greetingEnglish ? (
            <p className="mt-1 text-xs text-muted">{greetingEnglish}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const shell = cx(
    "flex w-full flex-col rounded-[var(--radius-lg)] border p-4 text-left transition-colors",
    quiet
      ? "border-line bg-surface-sunken"
      : selected
        ? "border-accent bg-accent-subtle"
        : "border-line-strong bg-surface-raised hover:border-accent hover:bg-surface-hover",
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(language.code)}
        aria-pressed={selected}
        className={cx(shell, "min-h-[44px] cursor-pointer")}
      >
        {body}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className={cx(shell, "min-h-[44px]")}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
