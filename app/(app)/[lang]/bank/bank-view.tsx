"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { AudioButton } from "@/components/learning/audio-button";
import { cx } from "@/lib/cx";
import { removeItems, toggleFavorite } from "./actions";
import type { BankEntry } from "@/lib/db/bank";

/**
 * The bank's interactive shell.
 *
 * Filtering and search live in the URL rather than component state, so a
 * filtered view is shareable, survives a refresh, and works with the back
 * button. Only the inherently interactive parts are client-side.
 */

export function BankFilters({
  languageCode,
  counts,
  values,
}: {
  languageCode: string;
  counts: {
    total: number;
    words: number;
    sentences: number;
    favorites: number;
  };
  values: BankFilterValues;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(values.search);

  function push(next: Partial<BankFilterValues>) {
    const merged = { ...values, ...next };
    const params = new URLSearchParams();
    if (merged.kind !== "all") params.set("kind", merged.kind);
    if (merged.search.trim()) params.set("q", merged.search.trim());
    if (merged.favoritesOnly) params.set("favorites", "1");
    const query = params.toString();
    router.push(`/${languageCode}/bank${query ? `?${query}` : ""}`);
  }

  const tabs: Array<{
    key: BankFilterValues["kind"];
    label: string;
    count: number;
  }> = [
    { key: "all", label: "Everything", count: counts.total },
    { key: "word", label: "Words", count: counts.words },
    { key: "sentence", label: "Sentences", count: counts.sentences },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Filter your bank"
        className="flex flex-wrap gap-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={values.kind === tab.key}
            onClick={() => push({ kind: tab.key })}
            className={cx(
              "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
              values.kind === tab.key
                ? "border-accent bg-accent-subtle text-accent"
                : "border-line-strong bg-surface-raised text-secondary hover:bg-surface-hover"
            )}
          >
            {tab.label}
            <span className="tabular-nums opacity-70">{tab.count}</span>
          </button>
        ))}

        <button
          type="button"
          role="tab"
          aria-selected={values.favoritesOnly}
          onClick={() => push({ favoritesOnly: !values.favoritesOnly })}
          className={cx(
            "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
            values.favoritesOnly
              ? "border-accent bg-accent-subtle text-accent"
              : "border-line-strong bg-surface-raised text-secondary hover:bg-surface-hover"
          )}
        >
          <Icon name="practice" size={15} />
          Favourites
          <span className="tabular-nums opacity-70">{counts.favorites}</span>
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          push({ search });
        }}
        className="flex gap-2"
      >
        <label htmlFor="bank-search" className="sr-only">
          Search your bank
        </label>
        <input
          id="bank-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search your bank"
          className="h-11 min-w-0 flex-1 rounded-[var(--radius)] border border-line-strong bg-surface-raised px-3.5 text-sm text-primary placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {values.search ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch("");
              push({ search: "" });
            }}
          >
            Clear
          </Button>
        ) : null}
      </form>
    </div>
  );
}

export function BankList({
  languageCode,
  entries,
}: {
  languageCode: string;
  entries: BankEntry[];
}) {
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.savedItemId}>
          <BankEntryCard languageCode={languageCode} entry={entry} />
        </li>
      ))}
    </ul>
  );
}

function BankEntryCard({
  languageCode,
  entry,
}: {
  languageCode: string;
  entry: BankEntry;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [favorite, setFavorite] = useState(entry.isFavorite);
  const [error, setError] = useState<string | null>(null);

  function onToggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    startTransition(async () => {
      const result = await toggleFavorite({
        languageCode,
        savedItemId: entry.savedItemId,
        isFavorite: next,
      });
      if (!result.ok) {
        setFavorite(!next);
        setError(result.error);
      }
    });
  }

  function onRemove() {
    startTransition(async () => {
      const result = await removeItems({
        languageCode,
        itemIds: [entry.itemId],
      });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const status = describeStatus(entry);

  return (
    <article
      className={cx(
        "rounded-[var(--radius-lg)] border border-line bg-surface-raised p-3.5 transition-opacity sm:p-5",
        pending && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-target text-base font-semibold text-primary sm:text-lg">
            {entry.surface}
          </p>
          <p className="mt-0.5 text-sm text-secondary">
            {entry.translationNatural}
          </p>
          {entry.translationLiteral ? (
            <p className="mt-0.5 text-xs text-muted">
              Literally: {entry.translationLiteral}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            aria-label={
              favorite ? "Remove from favourites" : "Add to favourites"
            }
            className={cx(
              "flex size-11 items-center justify-center rounded-full transition-colors",
              favorite ? "text-accent" : "text-muted hover:bg-surface-hover"
            )}
          >
            <Icon name="practice" size={18} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove from your bank"
            className="flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-danger"
          >
            <Icon name="inbox" size={18} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="muted">{entry.kind}</Badge>
          {entry.partOfSpeech ? (
            <Badge tone="muted">{entry.partOfSpeech}</Badge>
          ) : null}
          <Badge tone={status.tone}>{status.label}</Badge>
          {entry.savedFrom.startsWith("mission:") ? (
            <Badge tone="neutral">from a lesson</Badge>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((previous) => !previous)}
          aria-expanded={expanded}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          {expanded ? "Hide details" : "Show details"}
          <Icon
            name="arrowRight"
            size={14}
            className={expanded ? "rotate-90" : ""}
          />
        </button>
      </div>

      {error ? (
        <p role="status" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-3 flex flex-col gap-4 border-t border-line pt-4">
          {/* Real audio: a stored file when one exists, otherwise the device's
              own voice for this language. */}
          <AudioButton
            text={entry.surface}
            languageCode={languageCode}
            normalUrl={entry.audioNormalUrl}
            slowUrl={entry.audioSlowUrl}
          />

          {entry.grammarNote ? (
            <div className="rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Why
              </p>
              <p className="mt-1 text-sm text-secondary">{entry.grammarNote}</p>
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Reviews</dt>
              <dd className="mt-0.5 tabular-nums text-primary">
                {entry.memory?.reps ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Strength</dt>
              <dd className="mt-0.5 tabular-nums text-primary">
                {entry.memory ? `${entry.memory.stability.toFixed(1)}d` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Difficulty</dt>
              <dd className="mt-0.5 tabular-nums text-primary">
                {entry.memory ? entry.memory.difficulty.toFixed(1) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Next review</dt>
              <dd className="mt-0.5 text-primary">
                {entry.memory ? formatWhen(entry.memory.dueAt) : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </article>
  );
}

/**
 * A one-line status built from the real memory state.
 *
 * Deliberately not a percentage: "mastered" as a number would need a definition
 * nobody has agreed on, whereas "reviewed 4 times, next in 12 days" is a fact.
 */
function describeStatus(entry: BankEntry): {
  label: string;
  tone: "neutral" | "accent" | "success" | "muted";
} {
  if (!entry.memory) return { label: "Not in review", tone: "muted" };

  switch (entry.memory.state) {
    case "new":
      return { label: "Queued — not seen yet", tone: "accent" };
    case "learning":
      return { label: "Learning", tone: "accent" };
    case "relearning":
      return { label: "Relearning", tone: "neutral" };
    case "suspended":
      return { label: "Paused", tone: "muted" };
    default:
      return entry.memory.stability >= 21
        ? { label: "Well established", tone: "success" }
        : { label: "In review", tone: "neutral" };
  }
}

function formatWhen(iso: string): string {
  const due = new Date(iso).getTime();
  if (!Number.isFinite(due)) return "—";

  const days = (due - Date.now()) / (24 * 60 * 60 * 1000);
  if (days <= 0) return "now";
  if (days < 1) return `${Math.max(1, Math.round(days * 24 * 60))} min`;
  if (days < 2) return "tomorrow";
  return `${Math.round(days)} days`;
}

/**
 * Filter parsing lives in `./filter.ts`, a plain module with no directive, so the
 * Server Component can import it as well. Re-exported here for the view's own use.
 */
import { parseBankFilter } from "./filter";
import type { BankFilterValues } from "./filter";

export { parseBankFilter };
