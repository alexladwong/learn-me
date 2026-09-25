/**
 * Defensive parsing for database rows.
 *
 * The InsForge PostgREST client is not schema-typed, so `select()` returns
 * `any`. Rather than casting (`as Language`) — which is a lie that survives
 * until runtime — every read goes through these helpers.
 *
 * The failure mode this buys: a column renamed in a migration shows up as a
 * caught, logged error in one place instead of `undefined` rendering as an
 * empty card. It is deliberately strict about required fields and lenient about
 * optional ones.
 */

export class DataShapeError extends Error {
  constructor(
    message: string,
    readonly detail: { table: string; field?: string; got?: unknown },
  ) {
    super(message);
    this.name = "DataShapeError";
  }
}

export function dbError(table: string, error: unknown): DataShapeError {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);

  return new DataShapeError(`Query on "${table}" failed: ${message}`, { table });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  row: Record<string, unknown>,
  table: string,
  field: string,
): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new DataShapeError(`Expected "${table}.${field}" to be a string`, {
      table,
      field,
      got: value,
    });
  }
  return value;
}

function optionalString(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];
  return typeof value === "string" ? value : null;
}

function optionalNumber(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalBoolean(
  row: Record<string, unknown>,
  field: string,
  fallback = false,
): boolean {
  const value = row[field];
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Coerce a Postgres text[] (or a single string, which PostgREST returns for a
 * one-element array in some encodings) into a string array.
 */
function stringArray(row: Record<string, unknown>, field: string): string[] {
  const value = row[field];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return [value];
  return [];
}

function enumValue<T extends string>(
  row: Record<string, unknown>,
  table: string,
  field: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = row[field];
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  if (value === null || value === undefined) return fallback;
  throw new DataShapeError(
    `Expected "${table}.${field}" to be one of ${allowed.join(", ")}`,
    { table, field, got: value },
  );
}

function nullableEnum<T extends string>(
  row: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return null;
}

export const parsers = {
  isRecord,
  requireString,
  optionalString,
  optionalNumber,
  optionalBoolean,
  stringArray,
  enumValue,
  nullableEnum,
};
