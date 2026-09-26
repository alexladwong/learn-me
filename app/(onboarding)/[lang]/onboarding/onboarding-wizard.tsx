"use client";

import { useActionState, useEffect } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/icon";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { LanguageCard } from "@/components/learning/language-card";
import { LanguagePicker } from "@/components/ui/language-picker";
import { OnboardingProgress } from "@/components/learning/onboarding-progress";
import { Field, FormError, TextInput } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  submitOnboarding,
  previousOnboardingStep,
  type OnboardingFormState,
} from "./actions";
import { useOnboardingAnswers } from "./use-onboarding-answers";
import {
  ONBOARDING_STEP_COUNT,
  STEP_TITLES,
  type OnboardingStep,
} from "@/lib/onboarding/steps";
import {
  DAILY_MINUTES_LABELS,
  DAILY_MINUTES_OPTIONS,
  MOTIVATION_LABELS,
  MOTIVATIONS,
  SKILL_DESCRIPTIONS,
  SKILL_LABELS,
  SKILLS,
  type Language,
  type Motivation,
  type Skill,
} from "@/lib/types";
import { GOAL_CHOICES, LEVEL_CHOICES } from "@/lib/onboarding/answers";

const initialState: OnboardingFormState = { error: null, step: 1 };

/**
 * The onboarding wizard.
 *
 * One `<form>` across all six steps: every answer stays in the DOM and is
 * submitted together on the last step, so nothing is lost moving back and forth.
 * The URL (`?step=`) decides which step is *visible*; the hidden `step` field
 * tells the Server Action what the submit meant.
 *
 * Two structural decisions are load-bearing:
 *
 *   1. **Answers live in `useOnboardingAnswers`, not `useState`.** Each step is a
 *      Server Action plus `redirect()`, which makes Next refetch the segment and
 *      remount this component — plain state was destroyed between steps, so the
 *      wizard submitted nothing but defaults. See `use-onboarding-answers.ts`.
 *   2. **Non-current steps stay mounted** (`hidden`, not unmounted), because
 *      unmounting would discard their inputs from the payload.
 *
 * The layout is a two-column composition on desktop — question and progress on
 * the left, the control on the right — rather than a single narrow column with a
 * lot of dead space beneath it.
 */
export function OnboardingWizard({
  language,
  languages,
  nativeLanguages,
  step,
  defaults,
}: {
  language: Language;
  /** Available languages only — an unavailable one has no guided path. */
  languages: Language[];
  /** Every language in the catalogue, for the "first language" step. */
  nativeLanguages: Language[];
  step: OnboardingStep;
  defaults: { displayName: string | null; nativeLanguage: string | null };
}) {
  const [state, formAction] = useActionState(submitOnboarding, initialState);
  const { answers, set, toggle } = useOnboardingAnswers(
    language.code,
    defaults.nativeLanguage,
  );

  // Detect the timezone from the browser instead of showing a hardcoded guess.
  // An unrelated default is worse than empty: it would set the learner's daily
  // reset and streak boundary to a city they have never been to. Only fills when
  // the learner has not chosen one, so a manual change is never overwritten.
  useEffect(() => {
    if (answers.timezone) return;
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) set("timezone", detected);
    } catch {
      // No Intl or no timezone: leaving it blank lets the learner type one.
    }
  }, [answers.timezone, set]);

  const isLast = step === ONBOARDING_STEP_COUNT;
  const meta = STEP_TITLES[step];

  return (
    /*
     * One pale mint panel holds the whole question, and the control sits on a
     * crisp white card inside it. That is the composition the rest of the product
     * uses — a quiet tinted field with raised work on top of it — and onboarding
     * was the last screen still asking a question from inside a bordered box on a
     * flat page.
     *
     * The outer `px` is a fix as well as styling: this route has no layout
     * between it and `<body>`, so with `max-w-*` alone the question ran to the
     * edges of a 320px screen.
     */
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:py-14">
      <div className="rounded-[var(--radius-section)] bg-[var(--tint-mint)] p-4 sm:p-8 lg:p-12">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,36fr)_minmax(0,64fr)] lg:gap-14">
          {/* Left: the question, why it is asked, and where we are. */}
          <header className="lg:sticky lg:top-10 lg:self-start">
            <OnboardingProgress step={step} />
            <h1 className="mt-6 text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-primary sm:text-4xl">
              {meta.title}
            </h1>
            <p className="mt-3.5 text-[0.9375rem] leading-relaxed text-secondary sm:text-base">
              {meta.subtitle}
            </p>

            <CueForStep
              step={step}
              language={language}
              motivations={answers.motivation}
              skills={answers.skills}
              minutes={answers.dailyMinutes}
            />

            <p className="mt-8 hidden text-xs leading-relaxed text-muted lg:block">
              You can change every one of these answers later in settings.
            </p>
          </header>

          {/* Right: the control. */}
          <div className="min-w-0">
            <form
              action={formAction}
              className="flex flex-col gap-6 rounded-[var(--radius-section)] bg-surface-raised p-4 shadow-[var(--shadow-float)] sm:p-7 lg:p-9"
            >
              {/*
                The submitted target language, bound to the SAME state as the Step 1
                cards — not to the `language` prop.

                These were two separate sources of truth and they disagreed: this
                field carried the URL's language (`language.code`, e.g. "es") while
                picking a card set `answers.language` (e.g. "fr"). The radio group
                submits under a different name (`languageChoice`), so nothing
                corrected it. Choosing French on Step 1 therefore sent `es` and
                would have built the plan for the wrong language entirely — a silent
                wrong-language bug rather than a visible error.
              */}
              <input type="hidden" name="language" value={answers.language} />
              <input type="hidden" name="step" value={step} />

              <FormError message={state.error} />

              {/* Step 1 — target language */}
              <StepPanel active={step === 1}>
                {languages.length > 1 ? (
                  <fieldset>
                    <legend className="sr-only">
                      Which language do you want to learn?
                    </legend>
                    <ul className="grid gap-3">
                      {languages.map((option) => {
                        const selected = answers.language === option.code;
                        return (
                          <li key={option.code} className="relative">
                            {/*
                              Unnamed on purpose. This input exists only so the card
                              is a native radio — arrow keys, grouping and the
                              checked state come from the platform. The submitted
                              value is the hidden `language` field above, bound to
                              the same `answers.language`, so there is exactly one
                              source of truth. Previously this carried
                              `name="languageChoice"`, which the server strips as an
                              unknown key, leaving the hidden field to submit a
                              different language than the one shown as selected.
                            */}
                            <input
                              type="radio"
                              id={`language-${option.code}`}
                              value={option.code}
                              checked={selected}
                              onChange={() => set("language", option.code)}
                              className="peer sr-only"
                            />
                            <label
                              htmlFor={`language-${option.code}`}
                              className="block cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]"
                            >
                              <LanguageCard
                                language={option}
                                selected={selected}
                                layout="row"
                              />
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                ) : (
                  <LanguageCard language={language} selected />
                )}
              </StepPanel>

              {/* Step 2 — first language */}
              <StepPanel active={step === 2}>
                <LanguagePicker
                  id="nativeLanguage"
                  name="nativeLanguage"
                  label="Your first language"
                  hint="Search by English or native name."
                  value={answers.nativeLanguage}
                  onChange={(code) => set("nativeLanguage", code)}
                  languages={nativeLanguages}
                />
              </StepPanel>

              {/* Step 3 — motivation */}
              <StepPanel active={step === 3}>
                <fieldset>
                  <legend className="mb-3 text-sm font-medium text-primary">
                    Choose everything that applies
                  </legend>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {MOTIVATIONS.map((motivation) => {
                      const checked = answers.motivation.includes(motivation);
                      return (
                        <div key={motivation} className="relative">
                          <input
                            type="checkbox"
                            id={`motivation-${motivation}`}
                            name="motivation"
                            value={motivation}
                            checked={checked}
                            onChange={(event) =>
                              toggle(
                                "motivation",
                                motivation,
                                event.target.checked,
                              )
                            }
                            className="peer sr-only"
                          />
                          <label
                            htmlFor={`motivation-${motivation}`}
                            className={cx(
                              "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--radius-xl)] border px-4 py-3.5 transition-colors",
                              checked
                                ? "border-accent bg-accent-subtle"
                                : "border-line bg-surface hover:bg-surface-hover",
                              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]",
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cx(
                                "flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border",
                                checked
                                  ? "border-accent bg-accent text-on-accent"
                                  : "border-line-strong",
                              )}
                            >
                              {checked ? <Icon name="check" size={10} /> : null}
                            </span>
                            <span className="min-w-0 text-sm font-medium text-primary">
                              {MOTIVATION_LABELS[motivation as Motivation]}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </StepPanel>

              {/* Step 4 — level and goal */}
              <StepPanel active={step === 4}>
                <div className="flex flex-col gap-6">
                  <ChoiceGroup
                    name="level"
                    legend="Where are you now?"
                    options={LEVEL_CHOICES}
                    value={
                      answers.level as (typeof LEVEL_CHOICES)[number]["value"]
                    }
                    onChange={(value) => set("level", value)}
                  />
                  <ChoiceGroup
                    name="goal"
                    legend="What are you aiming for?"
                    options={GOAL_CHOICES}
                    value={
                      answers.goal as (typeof GOAL_CHOICES)[number]["value"]
                    }
                    onChange={(value) => set("goal", value)}
                  />
                </div>
              </StepPanel>

              {/* Step 5 — daily budget */}
              <StepPanel active={step === 5}>
                <fieldset>
                  <legend className="mb-3 text-sm font-medium text-primary">
                    How long, on a normal day?
                  </legend>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {DAILY_MINUTES_OPTIONS.map((minutes) => {
                      const checked = answers.dailyMinutes === String(minutes);
                      const meta = DAILY_MINUTES_LABELS[minutes];
                      return (
                        <div key={minutes} className="relative">
                          <input
                            type="radio"
                            id={`dailyMinutes-${minutes}`}
                            name="dailyMinutes"
                            value={String(minutes)}
                            checked={checked}
                            onChange={() =>
                              set("dailyMinutes", String(minutes))
                            }
                            className="peer sr-only"
                          />
                          <label
                            htmlFor={`dailyMinutes-${minutes}`}
                            className={cx(
                              "flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-[var(--radius-xl)] border p-4 transition-colors",
                              checked
                                ? "border-accent bg-accent-subtle"
                                : "border-line bg-surface hover:bg-surface-hover",
                              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]",
                            )}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-base font-semibold tabular-nums text-primary">
                                {minutes} min
                              </span>
                              <span className="text-xs font-medium uppercase tracking-wide text-accent">
                                {meta.label}
                              </span>
                            </span>
                            <span className="text-xs text-secondary">
                              {meta.description}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </StepPanel>

              {/* Step 6 — skill priorities, name, timezone */}
              <StepPanel active={isLast}>
                <div className="flex flex-col gap-6">
                  <fieldset>
                    <legend className="mb-3 text-sm font-medium text-primary">
                      Choose at least one
                    </legend>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {SKILLS.map((skill) => {
                        const checked = answers.skills.includes(skill);
                        return (
                          <div key={skill} className="relative">
                            <input
                              type="checkbox"
                              id={`skill-${skill}`}
                              name="skills"
                              value={skill}
                              checked={checked}
                              onChange={(event) =>
                                toggle("skills", skill, event.target.checked)
                              }
                              className="peer sr-only"
                            />
                            <label
                              htmlFor={`skill-${skill}`}
                              className={cx(
                                "flex min-h-[44px] cursor-pointer flex-col gap-0.5 rounded-[var(--radius-xl)] border p-4 transition-colors",
                                checked
                                  ? "border-accent bg-accent-subtle"
                                  : "border-line bg-surface hover:bg-surface-hover",
                                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]",
                              )}
                            >
                              <span className="text-sm font-medium text-primary">
                                {SKILL_LABELS[skill as Skill]}
                              </span>
                              <span className="text-xs text-secondary">
                                {SKILL_DESCRIPTIONS[skill as Skill]}
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="What should we call you?"
                      htmlFor="displayName"
                    >
                      <TextInput
                        id="displayName"
                        name="displayName"
                        type="text"
                        value={answers.displayName}
                        onChange={(event) =>
                          set("displayName", event.target.value)
                        }
                        placeholder="Alex"
                        autoComplete="given-name"
                      />
                    </Field>
                    <Field
                      label="Time zone"
                      htmlFor="timezone"
                      hint="Detected from your browser. It decides when your day rolls over."
                    >
                      <TextInput
                        id="timezone"
                        name="timezone"
                        type="text"
                        value={answers.timezone}
                        onChange={(event) =>
                          set("timezone", event.target.value)
                        }
                        placeholder="Europe/London"
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                </div>
              </StepPanel>

              <div className="flex items-center justify-between gap-3 border-t border-line pt-6">
                {step > 1 ? (
                  <button
                    type="submit"
                    formAction={previousOnboardingStep}
                    formNoValidate
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius)] px-3 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
                  >
                    <Icon name="arrowLeft" size={16} />
                    Back
                  </button>
                ) : (
                  <span />
                )}

                <SubmitButton
                  pendingLabel={isLast ? "Building your plan…" : "Saving…"}
                  size="lg"
                >
                  {isLast ? "Create my plan" : "Continue"}
                </SubmitButton>
              </div>
            </form>

            {/* The note lives in the left column on desktop, where there is room
              for it beside the question; on a phone it belongs under the control
              the learner has just used. It is never shown twice. */}
            <p className="mt-4 text-center text-xs leading-relaxed text-muted lg:hidden">
              You can change every one of these answers later in settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A short, specific consequence of what the learner has chosen so far.
 *
 * These are generated from the answers rather than being static encouragement,
 * because a cue that does not change is just decoration. They are also the only
 * place onboarding explains what an answer actually *does*, which is most of the
 * difference between a form and a conversation.
 *
 * Nothing here claims another person is involved or counts anything: there is no
 * community backend, so there is no community number to show.
 */
function CueForStep({
  step,
  language,
  motivations,
  skills,
  minutes,
}: {
  step: OnboardingStep;
  language: Language;
  motivations: string[];
  skills: string[];
  minutes: string;
}) {
  const cue = (() => {
    if (step === 3 && motivations.length > 0) {
      const parts: string[] = [];
      if (motivations.includes("travel")) {
        parts.push("airports, hotels, food and directions");
      }
      if (motivations.includes("work") || motivations.includes("business")) {
        parts.push("meetings, email and small talk with colleagues");
      }
      if (
        motivations.includes("university") ||
        motivations.includes("school")
      ) {
        parts.push("lectures, reading and academic writing");
      }
      if (motivations.includes("relationships")) {
        parts.push("family conversations and everyday warmth");
      }
      if (motivations.includes("immigration")) {
        parts.push("appointments, paperwork and official conversations");
      }
      if (parts.length > 0) {
        return `We will move ${parts.slice(0, 2).join(", and ")} to the front of your ${language.name_en} practice.`;
      }
      return `We will lead with the ${language.name_en} that fits why you are here.`;
    }

    if (step === 5 && minutes) {
      const perDay = Number(minutes);
      if (perDay <= 5) {
        return "Five minutes a day is enough to keep a habit alive. Most of it will go to review, so what you learn stays learned.";
      }
      if (perDay <= 10) {
        return "Ten focused minutes a day builds more than an hour on Sunday. Expect review plus one short lesson.";
      }
      if (perDay <= 20) {
        return "Twenty minutes is the most common choice, and the one most people keep. It fits review, a lesson and some listening.";
      }
      return "That is enough time to introduce new material and still review it properly — the combination that actually moves you forward.";
    }

    if (step === 6 && skills.length > 0) {
      const names = skills
        .slice(0, 2)
        .map((skill) => SKILL_LABELS[skill as Skill]?.toLowerCase() ?? skill);
      return `Your practice will be weighted towards ${names.join(" and ")}.`;
    }

    return null;
  })();

  if (!cue) return null;

  return (
    <div className="mt-6 flex gap-3 rounded-[var(--radius-xl)] border border-line bg-surface-raised p-4">
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-accent">
        <Icon name="sparkle" size={15} />
      </span>
      <p
        className="text-[0.8125rem] leading-relaxed text-secondary"
        role="status"
      >
        {cue}
      </p>
    </div>
  );
}

/**
 * Hidden steps stay in the DOM so their inputs are submitted; `hidden` also
 * removes them from the accessibility tree and the tab order, which a CSS-only
 * `display: none` could get wrong.
 *
 * No card wrapper: the form itself is the surface now, so a card inside a card
 * was producing the "box inside a box" look this pass removes.
 */
function StepPanel({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div hidden={!active} className="flex flex-col gap-5">
      {children}
    </div>
  );
}
