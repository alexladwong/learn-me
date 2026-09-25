"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import {
  ChoiceCard,
  ChipCheckbox,
  Field,
  FormError,
  TextInput,
} from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePlanAction, type SettingsFormState } from "./actions";
import {
  CEFR_LEVELS,
  DAILY_MINUTES_OPTIONS,
  MOTIVATION_LABELS,
  MOTIVATIONS,
  SKILL_LABELS,
  SKILLS,
  type CefrLevel,
  type Language,
  type LearnerLanguage,
} from "@/lib/types";

const initialState: SettingsFormState = { error: null, saved: false };

/**
 * Plan settings for one language.
 *
 * A client component because the save needs a pending state and an inline error;
 * the mutation itself is a Server Action, so authorization stays server-side.
 */
export function SettingsForm({
  language,
  learner,
  displayName,
  timezone,
  otherLanguages,
}: {
  language: Language;
  learner: LearnerLanguage;
  displayName: string;
  timezone: string;
  otherLanguages: Array<Pick<Language, "code" | "name_en" | "flag_emoji">>;
}) {
  const [state, formAction] = useActionState(updatePlanAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="languageCode" value={language.code} />

      <FormError message={state.error} />
      {state.saved && !state.error ? (
        <p
          role="status"
          className="rounded-[var(--radius)] border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm font-medium text-success"
        >
          Saved.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Your details"
          description="Used for greetings and to keep your daily reset in your own day."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Display name" htmlFor="displayName">
            <TextInput
              id="displayName"
              name="displayName"
              type="text"
              defaultValue={displayName}
              placeholder="Alex"
              autoComplete="given-name"
            />
          </Field>
          <Field
            label="Time zone"
            htmlFor="timezone"
            hint="For example Europe/London or Africa/Kampala."
          >
            <TextInput
              id="timezone"
              name="timezone"
              type="text"
              defaultValue={timezone}
              placeholder="Europe/London"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`Your ${language.name_en} plan`}
          description="Changing the daily time changes how much new material a session introduces."
        />

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-primary">Daily study time</legend>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {DAILY_MINUTES_OPTIONS.map((minutes) => (
              <ChoiceCard
                key={minutes}
                name="dailyMinutes"
                value={String(minutes)}
                title={`${minutes} minutes`}
                defaultChecked={minutes === learner.daily_minutes}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-1.5 text-sm font-medium text-primary">
            Target level
          </legend>
          <select
            name="goal"
            defaultValue={learner.cefr_goal ?? "A2"}
            className="h-11 w-full appearance-none rounded-[var(--radius)] border border-line-strong bg-surface-raised px-3.5 text-primary sm:max-w-xs"
          >
            {CEFR_LEVELS.map((level: CefrLevel) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-primary">
            Why you are learning it
          </legend>
          <div className="flex flex-wrap gap-2">
            {MOTIVATIONS.map((motivation) => (
              <ChipCheckbox
                key={motivation}
                name="motivation"
                value={motivation}
                label={MOTIVATION_LABELS[motivation]}
                defaultChecked={learner.motivation.includes(motivation)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-primary">
            Skills that matter most
          </legend>
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((skill) => (
              <ChipCheckbox
                key={skill}
                name="skills"
                value={skill}
                label={SKILL_LABELS[skill]}
                defaultChecked={learner.skill_priorities.includes(skill)}
              />
            ))}
          </div>
        </fieldset>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
          <ButtonLink href={`/${language.code}`} variant="ghost" size="sm">
            Cancel
          </ButtonLink>
          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        </div>
      </Card>

      <Card>
        <CardHeader title="Languages" description="Each language keeps its own plan and progress." />
        <ul className="mt-4 flex flex-wrap gap-2">
          <li>
            <Badge tone="accent">
              {language.flag_emoji ?? "🌐"} {language.name_en}
            </Badge>
          </li>
          {otherLanguages.map((other) => (
            <li key={other.code}>
              <Link href={`/${other.code}/settings`}>
                <Badge tone="neutral">
                  {other.flag_emoji ?? "🌐"} {other.name_en}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ButtonLink href="/languages?add=1" variant="secondary" size="sm">
            <Icon name="plus" size={16} />
            Add a language
          </ButtonLink>
          <p className="text-xs text-muted">
            {learner.is_primary
              ? "This is your primary language."
              : "Your primary language sets the default shell navigation."}
          </p>
        </div>
      </Card>
    </form>
  );
}
