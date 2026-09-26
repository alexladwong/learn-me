"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Badge } from "@/components/ui/empty-state";
import { Field, FormError, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { updatePlanAction, type SettingsFormState } from "./actions";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "./sections";
import {
  CEFR_LEVELS,
  DAILY_MINUTES_OPTIONS,
  DAILY_MINUTES_LABELS,
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
 * Settings, as a workspace rather than one long form.
 *
 * The previous version stacked every control into two enormous cards on a single
 * scrolling page — profile fields, plan editing, language switching and account
 * links all competing at once. That reads as a database editor.
 *
 * This is a two-pane workspace: a section list on the left, one focused pane on
 * the right, chosen by `?section=`. The section lives in the URL so it is
 * shareable, survives a refresh, and works without JavaScript — the same
 * reasoning the bank filters use.
 *
 * Only the sections backed by real functionality are shown as interactive.
 * Notifications has no provider behind it, so it says so instead of offering
 * switches that would do nothing.
 */


export function SettingsWorkspace({
  language,
  learner,
  displayName,
  timezone,
  email,
  otherLanguages,
  activeSection,
}: {
  language: Language;
  learner: LearnerLanguage;
  displayName: string;
  timezone: string;
  email: string;
  otherLanguages: Array<Pick<Language, "code" | "name_en" | "flag_emoji">>;
  activeSection: SettingsSection;
}) {
  const [state, formAction] = useActionState(updatePlanAction, initialState);

  return (
    <div className="grid gap-6 lg:grid-cols-[216px_minmax(0,1fr)] lg:gap-10">
      {/* ---- Section navigation ------------------------------------------- */}
      <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
        <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {SETTINGS_SECTIONS.map((section) => {
            const active = section.key === activeSection;
            return (
              <li key={section.key} className="shrink-0 lg:shrink">
                <Link
                  href={`/${language.code}/settings?section=${section.key}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex min-h-[40px] items-center gap-2.5 whitespace-nowrap rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors " +
                    (active
                      ? "bg-accent-subtle text-accent"
                      : "text-secondary hover:bg-surface-hover hover:text-primary")
                  }
                >
                  <Icon name={section.icon as IconName} size={16} />
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ---- Pane ---------------------------------------------------------- */}
      <div className="min-w-0">
        {state.error ? (
          <div className="mb-4">
            <FormError message={state.error} />
          </div>
        ) : null}
        {state.saved && !state.error ? (
          <p
            role="status"
            className="mb-4 rounded-[var(--radius)] border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm font-medium text-success"
          >
            Saved.
          </p>
        ) : null}

        {activeSection === "profile" ? (
          <ProfilePane
            language={language}
            displayName={displayName}
            timezone={timezone}
            email={email}
            learner={learner}
            formAction={formAction}
          />
        ) : null}

        {activeSection === "plan" ? (
          <PlanPane
            language={language}
            learner={learner}
            formAction={formAction}
          />
        ) : null}

        {activeSection === "languages" ? (
          <LanguagesPane language={language} otherLanguages={otherLanguages} learner={learner} />
        ) : null}

        {activeSection === "audio" ? <AudioPane language={language} /> : null}

        {activeSection === "appearance" ? <AppearancePane /> : null}

        {activeSection === "notifications" ? <NotificationsPane /> : null}

        {activeSection === "account" ? <AccountPane email={email} /> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ panes --- */

/** A white panel with a heading and a quiet description. */
function Pane({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-xl)] border border-line bg-surface-raised p-5 sm:p-7">
      <h2 className="text-lg font-semibold tracking-tight text-primary">{title}</h2>
      {description ? (
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-secondary">
          {description}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ProfilePane({
  language,
  displayName,
  timezone,
  email,
  learner,
  formAction,
}: {
  language: Language;
  displayName: string;
  timezone: string;
  email: string;
  learner: LearnerLanguage;
  formAction: (formData: FormData) => void;
}) {
  return (
    <form action={formAction}>
      <input type="hidden" name="languageCode" value={language.code} />
      <section className="rounded-[var(--radius-xl)] border border-line bg-surface-raised p-5 sm:p-7">
        {/* Profile header: identity first, then the fields. */}
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold uppercase text-accent"
          >
            {displayName.slice(0, 2) || "LM"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-primary">
              {displayName || "Your name"}
            </p>
            <p className="truncate text-sm text-secondary">{email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">
                {language.flag_emoji ?? "🌐"} {language.name_en}
              </Badge>
              {learner.cefr_level ? <Badge tone="muted">{learner.cefr_level}</Badge> : null}
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
          <Field label="Display name" htmlFor="displayName" hint="Used for greetings.">
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
            hint="Keeps your daily reset and streak in your own day."
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

        <div className="mt-6 flex justify-end border-t border-line pt-5">
          <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
        </div>
      </section>
    </form>
  );
}

/**
 * The learning plan, presented as a programme rather than as fields.
 *
 * The default view is a summary — a level track, the daily target, the reasons —
 * because that is what a learner wants to check. The controls are behind "Edit
 * plan" so changing one thing does not mean scrolling a wall of settings.
 */
function PlanPane({
  language,
  learner,
  formAction,
}: {
  language: Language;
  learner: LearnerLanguage;
  formAction: (formData: FormData) => void;
}) {
  const levelIndex = (level: string | null) =>
    Math.max(0, CEFR_LEVELS.indexOf((level ?? "A1") as CefrLevel));

  const from = learner.cefr_level ?? "A1";
  const to = learner.cefr_goal ?? "B1";
  const minutesMeta = DAILY_MINUTES_LABELS[learner.daily_minutes];

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Summary ------------------------------------------------------- */}
      <section className="rounded-[var(--radius-xl)] border border-line bg-surface-raised p-5 sm:p-7">
        <h2 className="text-lg font-semibold tracking-tight text-primary">
          Your {language.name_en} plan
        </h2>

        {/* A level track: the one place a progress-like visual is genuinely
            meaningful, because it shows where you are and where you are going. */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>A1</span>
            <span>C1</span>
          </div>
          <div className="relative mt-2 h-1.5 rounded-full bg-surface-sunken">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent"
              style={{
                width: `${Math.max(4, (levelIndex(to) / (CEFR_LEVELS.length - 1)) * 100)}%`,
              }}
            />
            <span
              aria-hidden="true"
              className="absolute -top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-surface-raised bg-accent"
              style={{
                left: `${(levelIndex(from) / (CEFR_LEVELS.length - 1)) * 100}%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-secondary">
            <span className="font-medium text-primary">{from}</span> now · aiming for{" "}
            <span className="font-medium text-primary">{to}</span>
          </p>
        </div>

        <dl className="mt-7 grid gap-5 border-t border-line pt-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-muted">Daily target</dt>
            <dd className="mt-1 text-base font-semibold text-primary">
              {learner.daily_minutes} min
            </dd>
            {minutesMeta ? (
              <dd className="text-xs text-secondary">{minutesMeta.label}</dd>
            ) : null}
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Focus</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1.5">
              {learner.skill_priorities.length > 0 ? (
                learner.skill_priorities.map((skill) => (
                  <Badge key={skill} tone="accent">
                    {SKILL_LABELS[skill as keyof typeof SKILL_LABELS] ?? skill}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-secondary">Not set</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Why</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1.5">
              {learner.motivation.length > 0 ? (
                learner.motivation.map((motivation) => (
                  <Badge key={motivation} tone="muted">
                    {MOTIVATION_LABELS[motivation as keyof typeof MOTIVATION_LABELS] ??
                      motivation}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-secondary">Not set</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* ---- Editing ------------------------------------------------------- */}
      <form action={formAction}>
        <input type="hidden" name="languageCode" value={language.code} />
        <details className="group rounded-[var(--radius-xl)] border border-line bg-surface-raised">
          <summary className="flex min-h-[56px] cursor-pointer items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-primary sm:px-7">
            Edit plan
            <span
              aria-hidden="true"
              className="text-muted transition-transform group-open:rotate-180"
            >
              <Icon name="chevronDown" size={16} />
            </span>
          </summary>

          <div className="border-t border-line px-5 py-6 sm:px-7">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-primary">
                Daily study time
              </legend>
              <div className="flex flex-wrap gap-2">
                {DAILY_MINUTES_OPTIONS.map((minutes) => (
                  <label
                    key={minutes}
                    className="cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="dailyMinutes"
                      value={String(minutes)}
                      defaultChecked={minutes === learner.daily_minutes}
                      className="peer sr-only"
                    />
                    <span className="inline-flex min-h-[40px] items-center rounded-[var(--radius)] border border-line-strong px-3.5 text-sm font-medium text-secondary transition-colors peer-checked:border-accent peer-checked:bg-accent-subtle peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]">
                      {minutes} min
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-medium text-primary">Target level</legend>
              <div className="flex flex-wrap gap-2">
                {CEFR_LEVELS.map((level: CefrLevel) => (
                  <label key={level} className="cursor-pointer">
                    <input
                      type="radio"
                      name="goal"
                      value={level}
                      defaultChecked={level === (learner.cefr_goal ?? "A2")}
                      className="peer sr-only"
                    />
                    <span className="inline-flex min-h-[40px] items-center rounded-[var(--radius)] border border-line-strong px-3.5 text-sm font-medium text-secondary transition-colors peer-checked:border-accent peer-checked:bg-accent-subtle peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]">
                      {level}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-medium text-primary">
                Why you are learning it
              </legend>
              <div className="flex flex-wrap gap-2">
                {MOTIVATIONS.map((motivation) => (
                  <label key={motivation} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="motivation"
                      value={motivation}
                      defaultChecked={learner.motivation.includes(motivation)}
                      className="peer sr-only"
                    />
                    <span className="inline-flex min-h-[40px] items-center rounded-[var(--radius)] border border-line-strong px-3.5 text-sm font-medium text-secondary transition-colors peer-checked:border-accent peer-checked:bg-accent-subtle peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]">
                      {MOTIVATION_LABELS[motivation]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-medium text-primary">
                Skills that matter most
              </legend>
              <div className="flex flex-wrap gap-2">
                {SKILLS.map((skill) => (
                  <label key={skill} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="skills"
                      value={skill}
                      defaultChecked={learner.skill_priorities.includes(skill)}
                      className="peer sr-only"
                    />
                    <span className="inline-flex min-h-[40px] items-center rounded-[var(--radius)] border border-line-strong px-3.5 text-sm font-medium text-secondary transition-colors peer-checked:border-accent peer-checked:bg-accent-subtle peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]">
                      {SKILL_LABELS[skill]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-7 flex items-center justify-end gap-3 border-t border-line pt-5">
              <SubmitButton pendingLabel="Saving…">Save plan</SubmitButton>
            </div>
          </div>
        </details>
      </form>
    </div>
  );
}

function LanguagesPane({
  language,
  otherLanguages,
  learner,
}: {
  language: Language;
  otherLanguages: Array<Pick<Language, "code" | "name_en" | "flag_emoji">>;
  learner: LearnerLanguage;
}) {
  return (
    <Pane
      title="Languages"
      description="Each language keeps its own plan, level, streak and progress."
    >
      <ul className="flex flex-col gap-2.5">
        <li className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-accent bg-accent-subtle px-4 py-3">
          <span aria-hidden="true" className="text-lg">
            {language.flag_emoji ?? "🌐"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-primary">
              {language.name_native}
            </span>
            <span className="block text-xs text-secondary">{language.name_en}</span>
          </span>
          {learner.is_primary ? <Badge tone="accent">Primary</Badge> : null}
        </li>

        {otherLanguages.map((other) => (
          <li key={other.code}>
            <Link
              href={`/${other.code}/settings`}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line px-4 py-3 transition-colors hover:bg-surface-hover"
            >
              <span aria-hidden="true" className="text-lg">
                {other.flag_emoji ?? "🌐"}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-primary">
                {other.name_en}
              </span>
              <Icon name="arrowRight" size={15} />
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <ButtonLink href="/languages?add=1" variant="secondary" size="sm">
          <Icon name="plus" size={15} />
          Add a language
        </ButtonLink>
      </div>
    </Pane>
  );
}

/**
 * Audio settings.
 *
 * Every line here describes something the audio layer genuinely does. There is no
 * "preferred voice" selector because the provider is the operating system's
 * speech engine, whose voices cannot be chosen from a web page — offering the
 * control would be a fake setting, which this product does not ship.
 */
function AudioPane({ language }: { language: Language }) {
  return (
    <Pane
      title="Audio & pronunciation"
      description={`How ${language.name_en} audio works in this product.`}
    >
      <ul className="flex flex-col gap-4">
        <AudioRow
          icon="volume"
          title="Normal speed"
          body="Every word and sentence can be played at the speaker's natural rate, beside the text."
        />
        <AudioRow
          icon="turtle"
          title="Learner speed"
          body="The same clip at 0.7× — slow enough to hear the syllables, still recognisably the language rather than stretched into something else."
        />
        <AudioRow
          icon="globe"
          title="Voice source"
          body="Speech comes from your device's own language engine, so playback works offline and costs nothing. The voice therefore depends on your operating system, and quality varies between them."
        />
        <AudioRow
          icon="check"
          title="One clip at a time"
          body="Starting a new clip stops the previous one, and audio stops when you change screen."
        />
      </ul>

      <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface-sunken p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Pronunciation scoring
        </p>
        <p className="mt-1.5 text-sm text-secondary">
          Not available yet. Scoring needs a speech-analysis provider that is not
          connected, so speaking steps record that you practised rather than showing a
          number the product cannot measure.
        </p>
      </div>
    </Pane>
  );
}

function AudioRow({
  icon,
  title,
  body,
}: {
  icon: IconName;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-accent-subtle text-accent"
      >
        <Icon name={icon} size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-primary">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-secondary">{body}</span>
      </span>
    </li>
  );
}

function AppearancePane() {
  return (
    <Pane
      title="Appearance"
      description="Learn Me is designed light. Dark is available if you prefer it."
    >
      <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-line px-4 py-3.5">
        <div>
          <p className="text-sm font-medium text-primary">Theme</p>
          <p className="mt-0.5 text-xs text-secondary">
            Your choice is remembered on this device.
          </p>
        </div>
        <ThemeToggle />
      </div>
    </Pane>
  );
}

function NotificationsPane() {
  return (
    <Pane title="Notifications">
      <div className="rounded-[var(--radius-lg)] border border-line bg-surface-sunken p-5">
        <p className="text-sm font-medium text-primary">
          Reminders are not available yet
        </p>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-secondary">
          Learn Me has no email or push provider connected, so there is nothing to
          schedule and no switch worth showing. When reminders exist, they will appear
          here with the times you choose.
        </p>
      </div>
    </Pane>
  );
}

function AccountPane({ email }: { email: string }) {
  return (
    <Pane title="Account">
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">Email</dt>
          <dd className="min-w-0 truncate font-medium text-primary">{email}</dd>
        </div>
      </dl>
      <div className="mt-5 border-t border-line pt-5">
        <ButtonLink href="/settings" variant="secondary" size="sm">
          Manage account and plan
        </ButtonLink>
      </div>
    </Pane>
  );
}
