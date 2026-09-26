"use client";

import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * The learning pulse: one strip instead of six identical stat cards.
 *
 * Six equal boxes is the single clearest tell of an admin dashboard — nothing is
 * more important than anything else, so nothing reads as designed. This is one
 * horizontal band with hairline separators, where each measure keeps its own
 * weight and the empty state is a deliberate dash rather than a zero.
 *
 * The values are passed in from the server exactly as they are. Where a figure has
 * no evidence behind it yet, `value` is `null` and the strip shows an em dash: an
 * intentional, readable "not measured yet", never a fabricated 0.
 */

export type PulseItem = {
  label: string;
  value: string | number | null;
  icon: IconName;
  /** A short unit or qualifier, e.g. "days" or "cards". */
  hint?: string;
  /** 0..1, drawn as a hairline bar when a real trend exists. */
  trend?: number | null;
  /** How many days of activity to draw as small bars, if any. */
  spark?: number[];
};

export function LearningPulse({ items }: { items: PulseItem[] }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-line bg-surface-raised">
      <dl className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={cx(
              "flex flex-col gap-2 px-5 py-4",
              // Hairlines between cells on the narrow layout too, without drawing
              // a full border box around each one.
              index > 0 && "border-t border-line sm:border-t-0",
              index % 2 === 1 && "border-l border-line sm:border-l-0",
              index >= 2 && "sm:border-t sm:border-line lg:border-t-0",
            )}
          >
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Icon name={item.icon} size={13} />
              {item.label}
            </dt>
            <dd>
              <span
                className={cx(
                  "block text-xl font-semibold tabular-nums tracking-tight",
                  item.value === null ? "text-muted" : "text-primary",
                )}
              >
                {item.value === null ? "—" : item.value}
              </span>
              {item.hint ? (
                <span className="mt-0.5 block text-[11px] text-muted">{item.hint}</span>
              ) : null}

              {item.spark && item.spark.length > 0 ? (
                <span className="mt-2 flex items-end gap-0.5" aria-hidden="true">
                  {item.spark.map((value, sparkIndex) => (
                    <span
                      key={sparkIndex}
                      className="w-1 rounded-full bg-accent/40"
                      style={{ height: `${Math.max(3, Math.min(20, value * 20))}px` }}
                    />
                  ))}
                </span>
              ) : item.trend !== null && item.trend !== undefined ? (
                <span
                  aria-hidden="true"
                  className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-track"
                >
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(0, Math.min(1, item.trend)) * 100}%` }}
                  />
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A speech waveform, drawn as a static path.
 *
 * This is the today panel's one piece of visual language. It is deliberately a
 * *speech* shape rather than an abstract flourish: the product is about speaking,
 * and a bar pattern reads as audio without needing a legend. The bars are
 * decorative (`aria-hidden`) — the panel's real content is its text.
 */
export function SpeechWave({
  bars = 28,
  className,
  animate = false,
}: {
  bars?: number;
  className?: string;
  animate?: boolean;
}) {
  // A fixed, hand-tuned envelope: symmetric, with two peaks, so it looks like a
  // spoken phrase rather than noise. Deterministic, so server and client agree.
  const heights = Array.from({ length: bars }, (_, index) => {
    const position = index / (bars - 1);
    const envelope = Math.sin(position * Math.PI);
    const detail =
      0.45 +
      0.3 * Math.sin(position * Math.PI * 5) +
      0.25 * Math.sin(position * Math.PI * 11);
    return Math.max(0.12, Math.min(1, envelope * detail + 0.18));
  });

  return (
    <span
      aria-hidden="true"
      className={cx("flex items-center gap-[3px]", className)}
    >
      {heights.map((height, index) => (
        <span
          key={index}
          className={cx(
            "w-[3px] shrink-0 rounded-full bg-current",
            animate && "animate-[pulse_1.6s_ease-in-out_infinite]",
          )}
          style={{
            height: `${Math.round(height * 100)}%`,
            /*
             * Rounded to three decimals on purpose. React serialises an inline
             * style into the HTML as a string and parses it back on the client,
             * and that round trip keeps only about six significant digits: an
             * unrounded `0.8116446066323273` came back as `0.811645`, which React
             * reported as a hydration mismatch on every dashboard load. Rounding
             * here means both sides compute the identical literal.
             */
            opacity: Math.round((0.25 + height * 0.6) * 1000) / 1000,
            animationDelay: animate ? `${index * 40}ms` : undefined,
          }}
        />
      ))}
    </span>
  );
}
