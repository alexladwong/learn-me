"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/icon";
import { AudioButton } from "@/components/learning/audio-button";
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
 * The whole card is the control. The interactive surface is a transparent
 * overlay stretched across the card rather than a wrapper around its contents,
 * because the card also contains a speaker: a `<button>` nested inside a
 * `<button>` is invalid HTML, and one nested inside a link would navigate on
 * play. The overlay sits above the content and the speaker sits above the
 * overlay, so a click anywhere selects the language and a click on the speaker
 * only ever plays it.
 *
 * `layout` decides where the greeting sits. `stacked` gives it its own line under
 * the name, which is right in a narrow multi-column grid; `row` sets it beside the
 * name, which is right in a single-column list, where stacking turned two short
 * lines into a tall card and wrapped greetings like "Bonjour, comment ça va ?"
 * onto a second line for no reason. Which is correct is a property of the
 * container, so the caller decides rather than the card guessing.
 */
export function LanguageCard({
  language,
  selected = false,
  onSelect,
  href,
  quiet = false,
  layout = "stacked",
  meta,
}: {
  language: Language;
  selected?: boolean;
  onSelect?: (code: string) => void;
  href?: string;
  /** Muted treatment for languages that are not learnable yet. */
  quiet?: boolean;
  layout?: "stacked" | "row";
  /**
   * A row of already-built badges or figures, rendered inside the card.
   *
   * These belong inside rather than under the card: "Primary · A2 · 20 min a
   * day" is a property of this language, and floating it below the box made it
   * read as a caption for the whole section.
   */
  meta?: React.ReactNode;
}) {
  const greeting = language.greeting_native;
  const greetingEnglish = language.greeting_english;
  const rtl = language.direction === "rtl";
  const isRow = layout === "row";

  const content = (
    <div
      className={cx(
        "flex min-w-0 gap-3",
        isRow ? "flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-6" : "flex-col",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0">
          <p
            className="truncate text-lg font-semibold tracking-tight text-primary"
            dir={rtl ? "rtl" : undefined}
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
            className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
            aria-hidden="true"
          >
            <Icon name="check" size={14} />
          </span>
        ) : null}
      </div>

      {greeting ? (
        <div
          className={cx(
            "flex min-w-0 items-center gap-3",
            isRow ? "sm:mt-0" : "mt-3.5 border-t border-line pt-3.5",
            isRow && selected ? "sm:pr-9" : "",
          )}
        >
          <div className="min-w-0">
            <p className="text-target font-medium text-primary" dir={rtl ? "rtl" : undefined}>
              {greeting}
            </p>
            {greetingEnglish ? <p className="mt-0.5 text-xs text-muted">{greetingEnglish}</p> : null}
          </div>
          <span
            className="relative z-20 ml-auto shrink-0"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <AudioButton
              text={greeting}
              languageCode={language.code}
              compact
              showSlow={false}
              label={`Listen to the ${language.name_en} greeting`}
            />
          </span>
        </div>
      ) : null}
    </div>
  );

  const shell = cx(
    "relative flex w-full flex-col rounded-[var(--radius-xl)] border p-4 text-left transition-colors",
    quiet
      ? "border-line bg-surface-sunken"
      : selected
        ? "border-accent bg-accent-subtle"
        : "border-line bg-surface hover:border-accent hover:bg-surface-hover",
  );

  /** Covers the card, keeps the card a real control, and carries its own name. */
  const overlayClass =
    "absolute inset-0 rounded-[var(--radius-xl)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

  if (onSelect) {
    return (
      <div className={shell}>
        {content}
        {meta ? <div className="mt-3.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        <button
          type="button"
          onClick={() => onSelect(language.code)}
          aria-pressed={selected}
          aria-label={`Choose ${language.name_en}`}
          className={cx(overlayClass, "z-10 cursor-pointer")}
        />
      </div>
    );
  }

  if (href) {
    return (
      <div className={shell}>
        {content}
        {meta ? <div className="mt-3.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
        <Link
          href={href}
          aria-label={`${language.name_en}`}
          className={cx(overlayClass, "z-10")}
        />
      </div>
    );
  }

  return (
    <div className={shell}>
      {content}
      {meta ? <div className="mt-3.5 flex flex-wrap items-center gap-2">{meta}</div> : null}
    </div>
  );
}
