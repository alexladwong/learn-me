/**
 * Minimal class-name joiner.
 *
 * Deliberately not `clsx` + `tailwind-merge`: this project's components compose
 * a fixed set of variants rather than accepting arbitrary conflicting utility
 * overrides, so a 40-line helper does the job with no dependency. If components
 * start taking free-form `className` overrides that must beat a variant class,
 * swap this for `tailwind-merge`.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function cx(...values: ClassValue[]): string {
  const out: string[] = [];

  for (const value of values) {
    if (!value) continue;

    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      continue;
    }

    if (Array.isArray(value)) {
      const nested = cx(...value);
      if (nested) out.push(nested);
      continue;
    }

    for (const [key, enabled] of Object.entries(value)) {
      if (enabled) out.push(key);
    }
  }

  return out.join(" ");
}
