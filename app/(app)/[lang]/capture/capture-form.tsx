"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/empty-state";
import { Field, FormError, TextArea, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { analyseContent, type CaptureFormState } from "./actions";
import { MAX_SOURCE_CHARS } from "@/lib/learning/extract";
import type { Language } from "@/lib/types";

const initialState: CaptureFormState = { error: null };

/**
 * The paste step.
 *
 * One field, because the point of the feature is that it costs nothing to use.
 * The character counter exists so the limit is visible *before* submitting,
 * rather than as a rejection afterwards.
 */
export function CaptureForm({
  language,
  nativeLanguage,
  enrichmentAvailable,
  enrichmentReason,
}: {
  language: Language;
  nativeLanguage: string;
  enrichmentAvailable: boolean;
  enrichmentReason: string | null;
}) {
  const [state, formAction] = useActionState(analyseContent, initialState);
  const [text, setText] = useState("");

  const remaining = MAX_SOURCE_CHARS - text.length;
  const tooLong = text.length > MAX_SOURCE_CHARS;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-primary">
          Learn from anything
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Paste {language.name_en} text — an article, a message, your own notes —
          and choose which words to keep. Nothing is added until you decide.
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="languageCode" value={language.code} />
        <input type="hidden" name="nativeLanguage" value={nativeLanguage} />

        <Card tone="raised">
          <FormError message={state.error} />

          {!enrichmentAvailable ? (
            <div className="mb-5 flex items-start gap-3 rounded-[var(--radius)] border border-line bg-surface-sunken px-4 py-3">
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-warning"
              />
              <div>
                <p className="text-sm font-medium text-primary">
                  Detection works; automatic translation does not
                </p>
                <p className="mt-0.5 text-sm text-secondary">
                  {enrichmentReason ??
                    "No AI provider is configured."}{" "}
                  You will still get the word list and its context, and you can type
                  each translation yourself when you keep a word.
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-4">
            <Field label="Title" htmlFor="title" hint="Optional. Used to find this text later.">
              <TextInput
                id="title"
                name="title"
                type="text"
                maxLength={120}
                placeholder="News article about the market"
              />
            </Field>

            <Field
              label={`${language.name_en} text`}
              htmlFor="text"
              required
              hint="At least a sentence or two. Longer text gives better suggestions."
            >
              <TextArea
                id="text"
                name="text"
                rows={12}
                required
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={`Pega aquí el texto en ${language.name_en}…`}
                className="font-normal"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p
              className={
                tooLong
                  ? "text-xs font-medium text-danger"
                  : "text-xs text-muted"
              }
            >
              {text.length.toLocaleString()} characters
              {tooLong
                ? ` — ${Math.abs(remaining).toLocaleString()} over the limit`
                : ` · ${remaining.toLocaleString()} remaining`}
            </p>
            <SubmitButton pendingLabel="Reading the text…" size="lg">
              Find words to learn
            </SubmitButton>
          </div>
        </Card>
      </form>

      <Card>
        <h2 className="text-sm font-semibold text-primary">What happens next</h2>
        <ol className="mt-3 flex flex-col gap-2.5 text-sm text-secondary">
          <li className="flex gap-2.5">
            <Badge tone="accent">1</Badge>
            The text is read and its words are counted. Function words like
            &ldquo;the&rdquo; and &ldquo;of&rdquo; are discarded.
          </li>
          <li className="flex gap-2.5">
            <Badge tone="accent">2</Badge>
            Words you have already saved appear as known, so they are not offered
            again.
          </li>
          <li className="flex gap-2.5">
            <Badge tone="accent">3</Badge>
            You see each remaining word in the sentence it came from, and choose
            which ones to keep.
          </li>
          <li className="flex gap-2.5">
            <Badge tone="accent">4</Badge>
            Kept words enter your bank and your review schedule.
          </li>
        </ol>
      </Card>

      <p className="text-sm text-muted">
        Your pasted text is private to you.{" "}
        <Link href={`/${language.code}`} className="font-medium text-accent hover:underline">
          Back to the dashboard
        </Link>
      </p>
    </div>
  );
}
