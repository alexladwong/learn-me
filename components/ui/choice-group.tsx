"use client";

import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/icon";

/**
 * A single-select list of options, rendered as cards rather than a dropdown.
 *
 * Used where a native `<select>` would be the obvious choice but the wrong one:
 * the goal picker on the level step. A native select cannot show a description
 * per option, ignores the product's type and colour, and on desktop opens an
 * OS-drawn menu — which is exactly what made onboarding look like a different
 * application from one step to the next.
 *
 * Keyboard and screen-reader behaviour comes from real radio inputs rather than
 * from ARIA on buttons: arrow keys, grouping and the checked state are then
 * handled by the platform, which is both less code and more reliable.
 */
export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  columns = 1,
}: {
  name: string;
  legend: string;
  options: ReadonlyArray<{
    value: T;
    label: string;
    description?: string;
    /** Small secondary text, e.g. the CEFR code behind a plain-language label. */
    note?: string | null;
  }>;
  value: T;
  onChange: (value: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-primary">{legend}</legend>
      <div className={cx("grid gap-2.5", columns === 2 && "sm:grid-cols-2")}>
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const checked = value === option.value;
          return (
            <div key={option.value} className="relative">
              <input
                type="radio"
                id={id}
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cx(
                  "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[var(--radius)] border p-3.5 transition-colors",
                  checked
                    ? "border-accent bg-accent-subtle"
                    : "border-line-strong bg-surface-raised hover:bg-surface-hover",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                    checked ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                  )}
                >
                  {checked ? <Icon name="check" size={10} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-primary">{option.label}</span>
                    {option.note ? (
                      <span className="text-xs text-muted">{option.note}</span>
                    ) : null}
                  </span>
                  {option.description ? (
                    <span className="mt-0.5 block text-xs text-secondary">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
