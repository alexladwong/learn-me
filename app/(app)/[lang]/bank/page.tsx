import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { CapabilityNotice, EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/progress";
import { BankFilters, BankList, parseBankFilter } from "./bank-view";
import { loadLanguageContext } from "@/lib/db/context";
import { getBankCounts, listBankEntries } from "@/lib/db/bank";
import { getServerClient } from "@/lib/insforge/server-client";
import { requireProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your bank" };

/** One page of the bank. Keyset pagination, so cost stays flat as it grows. */
const PAGE_SIZE = 20;

/**
 * The learner's word and sentence bank.
 *
 * One list with two filters, because they are one collection: an item is a
 * word or a sentence by its `kind`, not by which screen saved it. Filtering,
 * search and pagination all run in the database, so this page stays fast
 * regardless of how large the bank becomes.
 */
export default async function BankPage({
  params,
  searchParams,
}: PageProps<"/[lang]/bank">) {
  const { lang } = await params;
  const query = await searchParams;
  await requireProfile();
  const { language } = await loadLanguageContext(lang);
  const client = await getServerClient();

  const filter = parseBankFilter(query);
  const [entries, counts] = await Promise.all([
    listBankEntries(client, language.code, {
      kind: filter.kind,
      search: filter.search,
      favoritesOnly: filter.favoritesOnly,
      limit: PAGE_SIZE,
    }),
    getBankCounts(client, language.code),
  ]);

  const hasMore = entries.length === PAGE_SIZE;
  const cursor = entries.at(-1)?.savedAt;
  const isFiltered =
    filter.kind !== "all" || filter.search.length > 0 || filter.favoritesOnly;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Your {language.name_en} bank
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Everything you have chosen to keep. Saving an item is what adds it to
          your review schedule.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Saved items" value={counts.total} />
        <StatTile label="Words" value={counts.words} />
        <StatTile label="Sentences" value={counts.sentences} />
        <StatTile label="Favourites" value={counts.favorites} />
      </div>

      {counts.total > 0 ? (
        <BankFilters
          languageCode={language.code}
          counts={counts}
          values={filter}
        />
      ) : null}

      {counts.total === 0 ? (
        <EmptyState
          icon={<Icon name="book" size={20} />}
          title="Your bank is empty"
          description="Finish a lesson and its sentences and words are added here automatically. Anything you save can be reviewed, favourited and filtered."
          tone="sunken"
          action={
            <ButtonLink href={`/${language.code}/path`} size="sm">
              Go to the learning path
            </ButtonLink>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Icon name="book" size={20} />}
          title="Nothing matches those filters"
          description="Try a different search, or clear the filters to see everything you have saved."
          tone="sunken"
          action={
            <ButtonLink href={`/${language.code}/bank`} variant="secondary" size="sm">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <>
          <BankList languageCode={language.code} entries={entries} />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Showing {entries.length}
              {isFiltered ? " matching" : ""} of {counts.total}
            </p>
            {hasMore && cursor ? (
              <ButtonLink
                href={`/${language.code}/bank?before=${encodeURIComponent(cursor)}${
                  filter.kind !== "all" ? `&kind=${filter.kind}` : ""
                }${filter.search ? `&q=${encodeURIComponent(filter.search)}` : ""}${
                  filter.favoritesOnly ? "&favorites=1" : ""
                }`}
                variant="secondary"
                size="sm"
              >
                Load older
              </ButtonLink>
            ) : null}
          </div>
        </>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-primary">How this connects</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-secondary">
          <li>
            <Link
              href={`/${language.code}/review`}
              className="font-medium text-accent hover:underline"
            >
              Review
            </Link>{" "}
            shows every saved item whose next review date has passed.
          </li>
          <li>
            Removing an item here also removes it from your review queue — the two
            are the same collection.
          </li>
          <li>
            Re-saving an item never resets its schedule, so nothing you have
            learned can be undone by accident.
          </li>
        </ul>
      </Card>

      <CapabilityNotice
        title="Where new items will come from"
        description="Besides lessons, you will be able to paste an article, a message or a transcript and choose which words to keep. That feature is not built yet, so no import button is shown."
      />
    </div>
  );
}
