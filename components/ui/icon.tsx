import type { SVGProps } from "react";

/**
 * The product's icon set.
 *
 * Inline SVG rather than an icon package: the set is small, fixed, and needs to
 * inherit `currentColor` and stay crisp at the 20px used in the mobile nav.
 * Every icon is decorative by default (`aria-hidden`) — labels carry meaning,
 * so an icon is never the only signal.
 */
const paths = {
  home: "M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1H9.5v-5.5h5V21h3.25a1 1 0 0 0 1-1V9.75",
  learn: "M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.75 1.75 0 0 0-1.75-1.75H4Zm16 0A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.75 1.75 0 0 1 1.75-1.75H20Z",
  practice: "M12 3.5 14.6 8.9 20.5 9.7l-4.25 4.15 1 5.9L12 17.05 6.75 19.75l1-5.9L3.5 9.7l5.9-.8Z",
  speak: "M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2.2 5.3-5.3 2.2 2.2-5.3Z",
  flame: "M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.4.5-2.6 1.2-3.6.4 1 1.1 1.6 2 1.6 1.3 0 1.8-1.2 1.8-2.6 0-1.5-.6-3-.6-3s-.4-.7.6-1.4Z",
  cards: "M7.5 8.5h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm2-4h6a3.5 3.5 0 0 1 3.5 3.5M9 13h6M9 16h3.5",
  volume: "M11 5.5 6.75 9H4v6h2.75L11 18.5ZM15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10",
  // Muted speaker: the honest state when no voice exists for a language.
  volumeOff: "M11 5.5 6.75 9H4v6h2.75L11 18.5ZM16 9.5l5 5M21 9.5l-5 5",
  pause: "M9.5 5.5v13M14.5 5.5v13",
  // Slow playback. A tortoise, kept as a simple line drawing so it reads at 14px.
  turtle: "M4 13.5a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1H4ZM7 8.5l1.5-2M12 8.5V6M17 8.5 15.5 6.5M6.5 14.5v2M17.5 14.5v2",
  sparkle: "M12 3.5l1.7 4.3 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7ZM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z",
  chart: "M4 20h16M7 20V11M12 20V5M17 20v-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3.5 2",
  check: "M4.5 12.5 9.5 17.5 19.5 6.5",
  arrowRight: "M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5",
  arrowLeft: "M19.5 12h-15M11 5.5 4.5 12l6.5 6.5",
  // Disclosure marker for the combobox and any future expandable control.
  chevronDown: "M6.5 9.5 12 15l5.5-5.5",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  lock: "M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3c-2.5 2.5-3.5 5.8-3.5 9s1 6.5 3.5 9c2.5-2.5 3.5-5.8 3.5-9s-1-6.5-3.5-9Z",
  settings:
    "M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm7.5-3.25c0-.55-.06-1.09-.16-1.6l2-1.5-2-3.4-2.35.95a7.6 7.6 0 0 0-2.75-1.6L13.75 2.4h-3.5l-.49 2.45a7.6 7.6 0 0 0-2.75 1.6L4.66 5.5l-2 3.4 2 1.5a7.7 7.7 0 0 0 0 3.2l-2 1.5 2 3.4 2.35-.95a7.6 7.6 0 0 0 2.75 1.6l.49 2.45h3.5l.49-2.45a7.6 7.6 0 0 0 2.75-1.6l2.35.95 2-3.4-2-1.5c.1-.51.16-1.05.16-1.6Z",
  logout: "M15 8V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h7.5A1.5 1.5 0 0 0 15 18v-2M10 12h10M17 8.5 20.5 12 17 15.5",
  book: "M4.5 5.5A2 2 0 0 1 6.5 3.5H19v15H6.5a2 2 0 0 0-2 2Z",
  plus: "M12 5v14M5 12h14",
  inbox:
    "M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4M3.5 13.5 6.5 5h11l3 8.5v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z",
  // Offline: a cloud with its connection struck through. Used only alongside
  // text, never as the sole signal that work is waiting to sync.
  cloudOff:
    "M7 18.5h9.5a3.5 3.5 0 0 0 .6-6.95A5 5 0 0 0 8.2 9.4M7 18.5a3.5 3.5 0 0 1-.7-6.93M3.5 3.5l17 17",
} as const;

export type IconName = keyof typeof paths;

type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  /** Pixel size for both axes. Defaults to 20. */
  size?: number;
  /** Provide only when the icon carries meaning on its own. */
  title?: string;
};

export function Icon({ name, size = 20, title, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d={paths[name]} />
    </svg>
  );
}
