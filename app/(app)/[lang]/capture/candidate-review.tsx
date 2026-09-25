"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge, EmptyState } from "@/components/ui/empty-state";
import { cx } from "@/lib/cx";
import {
  dismissSelected,
  enrichCandidates,
  keepSelected,
  type KeepResult,
} from "./actions";
import type { ContentCandidate } from "@/lib/db/content";

/**
 * The candidate review step.
 *
 * The learner controls exactly what enters their vocabulary — nothing is added
 * automatically. Each word is shown in the sentence it came from, because a word
 * without context is a dictionary entry, not something you can use.
 *
 * Translations arrive two ways: generated (when a provider is configured) or
 * typed by the learner. Both end up as the same thing, and a word is never saved
 * with an invented translation — the database function rejects an empty one.
 */

type SortMode = "ranked" | "alphabetical" | "frequent";

export function CandidateReview({
  languageCode,
  languageName,
  sourceId,
  candidates,
  enrichmentAvailable,
  enrichmentReason,
  nativeLanguage,
}: {
  languageCode: string;
  languageName: string;
  sourceId: string;
  candidates: ContentCandidate[];
  enrichmentAvailable: boolean;
  enrichmentReason: string | null;
  nativeLanguage: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [translations, setTranslations] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      candidates.flatMap((candidate) =>
        candidate.translation ? [[candidate.id, candidate.translation] as const] : [],
      ),
    ),
  );
  const [sort, setSort] = useState<SortMode>("ranked");
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<KeepResult, { ok: true }> | null>(null);

  const visible = useMemo(() => {
    const remaining = candidates.filter((candidate) => !dismissed.has(candidate.id));
    if (sort === "alphabetical") {
      return [...remaining].sort((a, b) => a.surfaceKey.localeCompare(b.surfaceKey));
    }
    if (sort === "frequent") {
      return [...remaining].sort(
        (a, b) => b.occurrences - a.occurrences || a.surfaceKey.localeCompare(b.surfaceKey),
      );
    }
    return remaining;
  }, [candidates, dismissed, sort]);

  const selectedList = visible.filter((candidate) => selected.has(candidate.id));
  const missingTranslations = selectedList.filter(
    (candidate) => !(translations[candidate.id] ?? "").trim(),
  );

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(visible.map((candidate) => candidate.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function onEnrich() {
    if (selected.size === 0) return;
    setError(null);
    setNotice(null);
    setBusyLabel("Translating…");

    startTransition(async () => {
      const response = await enrichCandidates({
        languageCode,
        sourceId,
        candidateIds: [...selected],
        nativeLanguage,
      });

      setBusyLabel(null);

      if (!response.ok) {
        setError(response.error);
        return;
      }

      // Merge the results in without clobbering anything the learner typed.
      setTranslations((previous) => {
        const next = { ...previous };
        for (const [candidateId, value] of Object.entries(response.translations)) {
          if ((next[candidateId] ?? "").trim()) continue;
          next[candidateId] = value.translation;
        }
        return next;
      });

      setNotice(
        response.translated === 0
          ? `No translation could be generated for ${response.unavailable} word${response.unavailable === 1 ? "" : "s"}. Type them yourself below.`
          : `${response.translated} translated${response.unavailable > 0 ? `, ${response.unavailable} still need your input` : ""}.`,
      );
    });
  }

  function onKeep() {
    if (selected.size === 0) return;
    setError(null);
    setNotice(null);
    setBusyLabel("Saving…");

    startTransition(async () => {
      const response = await keepSelected({
        languageCode,
        sourceId,
        items: selectedList.map((candidate) => ({
          candidateId: candidate.id,
          translation: (translations[candidate.id] ?? "").trim() || undefined,
        })),
      });

      setBusyLabel(null);

      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response);
    });
  }

  function onDismiss() {
    if (selected.size === 0) return;
    setError(null);
    setBusyLabel("Dismissing…");

    const ids = [...selected];

    startTransition(async () => {
      const response = await dismissSelected({
        languageCode,
        sourceId,
        candidateIds: ids,
      });
      setBusyLabel(null);

      if (!response.ok) {
        setError(response.error);
        return;
      }
      setDismissed((previous) => new Set([...previous, ...ids]));
      setSelected(new Set());
    });
  }

  if (result) {
    return (
      <Card tone="raised" className="mx-auto w-full max-w-lg">
        <p className="text-xs font-medium uppercase tracking-wide text-success">
          Added
        </p>
        <h1 className="mt-1.5 text-xl font-semibold text-primary">
          {result.kept + result.alreadyKept} word
          {result.kept + result.alreadyKept === 1 ? "" : "s"} added to your bank
        </h1>
        <p className="mt-2 text-sm text-secondary">
          They are queued for review and due now, so they will come up the next
          time you review {languageName}.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={result.queueHref} fullWidth>
            Review them now
          </ButtonLink>
          <ButtonLink
            href={`/${languageCode}/capture/${sourceId}`}
            variant="secondary"
            fullWidth
          >
            Keep choosing words
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            Analysis
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary">
            {visible.length} word{visible.length === 1 ? "" : "s"} to consider
          </h1>
          <p className="mt-1 text-sm text-secondary">
            Ranked by how often each appears. Nothing is added until you choose it.
          </p>
        </div>
        <ButtonLink
          href={`/${languageCode}/capture`}
          variant="ghost"
          size="sm"
        >
          <Icon name="arrowLeft" size={16} />
          New text
        </ButtonLink>
      </header>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Icon name="check" size={20} />}
          title="Nothing left to consider"
          description="You have decided about every word in this text. Paste something new, or review what you kept."
          tone="sunken"
          action={
            <ButtonLink href={`/${languageCode}/bank`} variant="secondary" size="sm">
              Open your bank
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={selectAll}>
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={selected.size === 0}
              >
                Clear
              </Button>

              <span className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block" />

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["ranked", "Ranked"],
                    ["frequent", "Most frequent"],
                    ["alphabetical", "A–Z"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    aria-pressed={sort === key}
                    className={cx(
                      "min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors",
                      sort === key
                        ? "border-accent bg-accent-subtle text-accent"
                        : "border-line-strong bg-surface-raised text-secondary hover:bg-surface-hover",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <span className="ml-auto text-xs tabular-nums text-muted">
                {selected.size} selected
              </span>
            </div>
          </Card>

          {enrichmentAvailable ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
              <p className="text-sm text-secondary">
                Need translations? Generate them for the selected words, or type
                your own below.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={onEnrich}
                disabled={selected.size === 0 || pending}
                className="ml-auto"
              >
                {pending && busyLabel === "Translating…"
                  ? "Translating…"
                  : "Translate selected"}
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-warning"
              />
              <div>
                <p className="text-sm font-medium text-primary">
                  Type the translations yourself
                </p>
                <p className="mt-0.5 text-sm text-secondary">
                  {enrichmentReason ?? "No AI provider is configured."} Each word
                  below has a field for the meaning — that is what will be saved.
                </p>
              </div>
            </div>
          )}

          {notice ? (
            <p role="status" className="text-sm font-medium text-secondary">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p role="status" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          <ul className="flex flex-col gap-2.5">
            {visible.map((candidate) => (
              <li key={candidate.id}>
                <CandidateRow
                  candidate={candidate}
                  selected={selected.has(candidate.id)}
                  translation={translations[candidate.id] ?? ""}
                  onToggle={() => toggle(candidate.id)}
                  onTranslationChange={(value) =>
                    setTranslations((previous) => ({ ...previous, [candidate.id]: value }))
                  }
                />
              </li>
            ))}
          </ul>

          {/* Sticky action bar: with 40 candidates the decision buttons must stay
              reachable without scrolling back to the top. */}
          <div className="sticky bottom-20 z-20 rounded-[var(--radius-lg)] border border-line bg-surface-raised p-3 shadow-[var(--shadow-raised)] lg:bottom-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-secondary">
                {selected.size === 0
                  ? "Select the words you want to keep."
                  : missingTranslations.length > 0
                    ? `${missingTranslations.length} of ${selected.size} need a translation before they can be saved.`
                    : `${selected.size} ready to add.`}
              </p>

              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  disabled={selected.size === 0 || pending}
                >
                  Dismiss
                </Button>
                <Button
                  onClick={onKeep}
                  disabled={
                    selected.size === 0 || pending || missingTranslations.length > 0
                  }
                >
                  {pending && busyLabel === "Saving…"
                    ? "Saving…"
                    : `Add ${selected.size || ""} to my bank`}
                </Button>
              </div>
            </div>
            {missingTranslations.length > 0 && selected.size > 0 ? (
              <p className="mt-2 text-xs text-muted">
                Missing:{" "}
                {missingTranslations
                  .slice(0, 5)
                  .map((candidate) => candidate.surface)
                  .join(", ")}
                {missingTranslations.length > 5
                  ? ` and ${missingTranslations.length - 5} more`
                  : ""}
              </p>
            ) : null}
          </div>
        </>
      )}

      <p className="text-sm text-muted">
        <Link href={`/${languageCode}/bank`} className="font-medium text-accent hover:underline">
          Open your bank
        </Link>{" "}
        to see everything you have kept.
      </p>
    </div>
  );
}

function CandidateRow({
  candidate,
  selected,
  translation,
  onToggle,
  onTranslationChange,
}: {
  candidate: ContentCandidate;
  selected: boolean;
  translation: string;
  onToggle: () => void;
  onTranslationChange: (value: string) => void;
}) {
  const inputId = `translation-${candidate.id}`;

  return (
    <div
      className={cx(
        "rounded-[var(--radius)] border bg-surface-raised p-4 transition-colors",
        selected ? "border-accent bg-accent-subtle" : "border-line",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={`candidate-${candidate.id}`}
          checked={selected}
          onChange={onToggle}
          className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
        />

        <div className="min-w-0 flex-1">
          <label
            htmlFor={`candidate-${candidate.id}`}
            className="flex cursor-pointer flex-wrap items-center gap-2"
          >
            <span className="text-target text-base font-semibold text-primary">
              {candidate.surface}
            </span>
            <Badge tone="muted">
              {candidate.occurrences}×
            </Badge>
            {candidate.kind === "phrase" ? <Badge tone="accent">phrase</Badge> : null}
            {candidate.enrichmentState === "enriched" && candidate.translationSource === "ai" ? (
              <Badge tone="success">translated</Badge>
            ) : candidate.enrichmentState === "unavailable" ? (
              <Badge tone="muted">needs a meaning</Badge>
            ) : null}
          </label>

          {candidate.contextSentence ? (
            <p className="mt-1.5 text-sm italic text-secondary">
              {candidate.contextSentence}
            </p>
          ) : null}

          <div className="mt-3">
            <label
              htmlFor={inputId}
              className="mb-1 block text-xs font-medium text-muted"
            >
              Meaning
            </label>
            <input
              id={inputId}
              value={translation}
              onChange={(event) => onTranslationChange(event.target.value)}
              placeholder="Type the translation"
              autoComplete="off"
              className="h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-raised px-3 text-sm text-primary placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
