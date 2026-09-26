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
    <>
      {/*
        On a phone: a label-and-number strip with **no boxes at all**.

        This replaced a 2×3 grid of bordered cells that consumed roughly a third
        of the screen to convey six numbers, most of which are empty on a new
        account. Removing the containers is the single biggest vertical saving on
        the mobile dashboard, and it also stops the page reading like an admin
        summary.
      */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Learning pulse
        </p>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-3">
          {items.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                <Icon name={item.icon} size={12} />
                {item.label}
              </dt>
              <dd
                className={cx(
                  "truncate text-base font-semibold tabular-nums",
                  item.value === null ? "text-muted" : "text-primary",
                )}
              >
                {item.value === null ? "—" : item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Desktop keeps the bordered band; there is room for it there. */}
      <div className="hidden rounded-[var(--radius-xl)] border border-line bg-surface-raised lg:block">
        <dl className="grid grid-cols-6 divide-x divide-line">
          {items.map((item) => (
            <PulseCell key={item.label} item={item} />
          ))}
        </dl>
      </div>
    </>
  );
}

/** The roomy cell used on desktop, where there is space for a label above the value. */
function PulseCell({ item }: { item: PulseItem }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-4">
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
      </dd>
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
