/**
 * Domain types for the learn-me schema.
 *
 * These mirror `migrations/*.sql` by hand. The InsForge PostgREST client is not
 * schema-typed, so these types are the single place the application states what
 * a row looks like — every read in `lib/db/*` is annotated with them and parsed
 * defensively, so a schema drift shows up as a type error or a caught
 * validation failure rather than a runtime `undefined`.
 *
 * When the schema changes, change the migration and this file in the same
 * commit.
 */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const SKILLS = [
  "vocabulary",
  "listening",
  "speaking",
  "grammar",
  "reading",
  "pronunciation",
] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABELS: Record<Skill, string> = {
  vocabulary: "Vocabulary",
  listening: "Listening",
  speaking: "Speaking",
  grammar: "Grammar",
  reading: "Reading",
  pronunciation: "Pronunciation",
};

/** Reasons a learner gives for studying. Stored in `learner_languages.motivation`. */
export const MOTIVATIONS = [
  "travel",
  "work",
  "school",
  "university",
  "business",
  "relationships",
  "immigration",
  "ministry",
  "culture",
  "personal",
] as const;
export type Motivation = (typeof MOTIVATIONS)[number];

export const MOTIVATION_LABELS: Record<Motivation, string> = {
  travel: "Travel",
  work: "Work",
  school: "School",
  university: "University",
  business: "Business",
  relationships: "Relationships",
  immigration: "Immigration",
  ministry: "Ministry or religious communication",
  culture: "Culture",
  personal: "Personal interest",
};

/**
 * Daily study budgets. These are the choices offered in onboarding; the
 * curriculum and session composer derive their budgets from the selection.
 */
export const DAILY_MINUTES_OPTIONS = [5, 10, 20, 30, 60] as const;
export type DailyMinutes = (typeof DAILY_MINUTES_OPTIONS)[number];

/** Ways a learner can study. Filters over one session composer, not six systems. */
export const LEARNING_MODES = [
  "quick",
  "commute",
  "study",
  "speak",
  "review",
  "explore",
] as const;
export type LearningMode = (typeof LEARNING_MODES)[number];

/**
 * What each mode is called and what it is for.
 *
 * There is deliberately **no `minutes` field here any more**. It held hardcoded
 * lengths — study 30, speak 10 — which disagreed with the session the learner
 * was actually given: `minutesForMode` sizes `study` from the learner's own
 * `daily_minutes`, so a twenty-minute learner saw a "Study 30m" chip above a
 * session planned for twenty. A mode's length is computed by
 * `minutesForMode(mode, learner.daily_minutes)` and nowhere else.
 */
export const LEARNING_MODE_META: Record<
  LearningMode,
  { label: string; description: string }
> = {
  quick: { label: "Quick", description: "Vocabulary and recall" },
  commute: { label: "Commute", description: "Audio-focused practice" },
  study: { label: "Study", description: "Full structured lesson" },
  speak: { label: "Speak", description: "Conversation practice" },
  review: { label: "Review", description: "Spaced repetition only" },
  explore: { label: "Explore", description: "Learn from real-world content" },
};

export type TextDirection = "ltr" | "rtl";

export type Language = {
  code: string;
  name_en: string;
  name_native: string;
  /**
   * Secondary decoration only. A flag names a country, and Spanish, Arabic and
   * Swahili are each spoken across many — so languages are identified by name and
   * native script first, never by a flag alone.
   */
  flag_emoji: string | null;
  /** A short everyday greeting, for selection cards. */
  greeting_native: string | null;
  /** The greeting's plain-English meaning. */
  greeting_english: string | null;
  direction: TextDirection;
  script: string | null;
  supports_cefr: boolean;
  supports_audio: boolean;
  supports_asr: boolean;
  supports_pronunciation: boolean;
  is_available: boolean;
  sort_order: number;
};

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  ui_locale: string;
  native_language: string | null;
  onboarding_state: "pending" | "in_progress" | "complete";
  onboarding_step: number;
  onboarded_at: string | null;
};

export type LearnerLanguage = {
  id: string;
  user_id: string;
  language_code: string;
  is_active: boolean;
  is_primary: boolean;
  motivation: string[];
  cefr_level: CefrLevel | null;
  cefr_goal: CefrLevel | null;
  daily_minutes: number;
  skill_priorities: string[];
  preferred_modes: string[];
  started_at: string;
};

export type UserStats = {
  user_id: string;
  language_code: string;
  words_learned: number;
  sentences_mastered: number;
  review_cards_due: number;
  listening_seconds: number;
  speaking_seconds: number;
  total_reviews: number;
  total_correct: number;
  streak_current: number;
  streak_longest: number;
  last_active_date: string | null;
};

/** A published track plus the learner's real progress through it. */
export type TrackWithProgress = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string;
  cefr_band: CefrLevel | null;
  order_index: number;
  total_units: number;
  /**
   * Units the learner has completed. `null` when there is no lesson-completion
   * tracking yet for this learner — renders as "not started", never as a
   * fabricated 0%.
   */
  completed_units: number | null;
};

export type WeeklySummary = {
  /** Inclusive ISO dates (YYYY-MM-DD) covered by this summary. */
  from: string;
  to: string;
  active_days: number;
  reviews: number;
  reviews_correct: number;
  new_items: number;
  listening_seconds: number;
  speaking_seconds: number;
};

/** The composed answer to "what should I learn next?". */
export type TodaySession = {
  languageCode: string;
  /** Total minutes the learner asked for. */
  goalMinutes: number;
  reviewsDue: number;
  /** Honest: 0 until guided content is published for this language. */
  lessonsAvailable: number;
  mode: LearningMode;
  /** Ordered, human-readable plan for the session. */
  items: TodaySessionItem[];
  totalMinutes: number;
};

export type TodaySessionItem = {
  kind: "review" | "lesson" | "listening" | "speaking" | "content";
  label: string;
  minutes: number;
  /** Set when the learner can act on this item right now. */
  href?: string;
};

/**
 * Plain-language level options.
 *
 * The database stores CEFR codes, but a learner choosing their first language
 * course should not have to know what "A2" means. Each option carries the CEFR
 * value it maps to, shown as secondary information rather than the label.
 *
 * `unsure` is a real answer, not a placeholder: it stores `null`, which means
 * "place me as I go" rather than "I am A1".
 */
export const LEVEL_OPTIONS = [
  { value: "unsure", label: "Complete beginner", cefr: null, description: "I am starting from nothing. Place me as I go." },
  { value: "A1", label: "I know a few words", cefr: "A1", description: "Greetings, numbers, simple phrases." },
  { value: "A2", label: "I can have basic conversations", cefr: "A2", description: "Everyday topics, present and past." },
  { value: "B1", label: "Intermediate", cefr: "B1", description: "I can hold a conversation and be understood." },
  { value: "B2", label: "Advanced", cefr: "B2", description: "I am comfortable on most subjects." },
] as const;

/** Short character labels for each daily-time choice. */
export const DAILY_MINUTES_LABELS: Record<number, { label: string; description: string }> = {
  5: { label: "Quick", description: "A few cards, every day" },
  10: { label: "Light", description: "One short session" },
  20: { label: "Steady", description: "The most common choice" },
  30: { label: "Focused", description: "Room for new material and review" },
  60: { label: "Intensive", description: "Serious, sustained study" },
};

/** What each skill priority actually changes about practice. */
export const SKILL_DESCRIPTIONS: Record<Skill, string> = {
  vocabulary: "More new words, more often",
  listening: "More audio and comprehension",
  speaking: "More spoken recall and conversation",
  grammar: "More sentence building and patterns",
  reading: "More written passages to work through",
  pronunciation: "More sound-by-sound practice",
};
