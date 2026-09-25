/**
 * Conversation scenarios for the AI tutor.
 *
 * A tutor is not a chatbot. The difference is that a tutor has a *task*: it is
 * trying to get you to produce specific language, it knows what you can already
 * handle, and it corrects in a way that does not stop you talking.
 *
 * This module is where that intent lives. It is pure data and pure functions, so
 * the scenario design can be read and reviewed without a provider, and so the
 * prompt-building is testable — a prompt that asks a beginner to discuss abstract
 * opinions would produce a bad lesson, and that is a bug worth catching in a test
 * rather than in a conversation.
 *
 * The scenarios are the ones the brief named, plus a few the level bands need.
 */

import type { CefrLevel } from "@/lib/types";

/**
 * How much the tutor should correct.
 *
 * The single most important setting for whether a conversation teaches or
 * discourages. Interrupting a beginner on every article stops them speaking;
 * letting an advanced learner repeat a fossilised error for an hour wastes the
 * session. This is a per-scenario choice rather than a per-level one because a
 * job interview and a coffee order have different tolerances for error.
 */
export const CORRECTION_STYLES = ["gentle", "balanced", "strict"] as const;
export type CorrectionStyle = (typeof CORRECTION_STYLES)[number];

export const CORRECTION_BEHAVIOUR: Record<CorrectionStyle, string> = {
  gentle:
    "Correct at most one thing per turn, and only when the meaning was unclear. Never interrupt to fix something you understood.",
  balanced:
    "Correct meaningful errors as they happen, at most two per turn, and always after acknowledging what the learner said.",
  strict:
    "Correct every error, including small ones, and ask the learner to repeat the corrected sentence before moving on.",
};

export type Scenario = {
  id: string;
  title: string;
  /** What the learner is trying to accomplish, in one line. */
  goal: string;
  /** The tutor's role in the scene. */
  tutorRole: string;
  /** Where the conversation happens, for the opening line. */
  setting: string;
  /** The level band this is written for, as authored. */
  minLevel: CefrLevel;
  maxLevel: CefrLevel;
  correctionStyle: CorrectionStyle;
  /** Specific things the learner should end up having said. */
  tasks: string[];
  /** Phrases a learner at the lower end can lean on. */
  usefulPhrases: string[];
  /** Grammar the scenario naturally exercises, for the report's pattern list. */
  grammarFocus: string[];
  /** Vocabulary the scenario naturally calls for. */
  vocabularyFocus: string[];
};

const LEVEL_ORDER: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function levelRank(level: CefrLevel): number {
  const index = LEVEL_ORDER.indexOf(level);
  return index === -1 ? 0 : index;
}

/**
 * The scenario catalogue.
 *
 * Written so each entry is answerable at its `minLevel` with the listed phrases
 * alone — that is what makes it a lesson rather than a test.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: "coffee-shop",
    title: "Coffee shop",
    goal: "Order a drink, ask a question about it, and pay.",
    tutorRole: "a friendly barista who is patient with hesitant speakers",
    setting: "a busy café in the morning",
    minLevel: "A1",
    maxLevel: "A2",
    correctionStyle: "gentle",
    tasks: [
      "Greet the barista",
      "Order one drink and one food item",
      "Ask how much it costs",
      "Say thank you and goodbye",
    ],
    usefulPhrases: [
      "I would like…",
      "How much is it?",
      "Can I have…?",
      "That's all, thank you.",
    ],
    grammarFocus: ["polite requests", "numbers and prices", "articles"],
    vocabularyFocus: ["drinks", "food", "money"],
  },
  {
    id: "directions",
    title: "Asking for directions",
    goal: "Stop a stranger, ask the way, and check you understood.",
    tutorRole: "a local passer-by who gives clear, simple directions",
    setting: "a street corner near a station",
    minLevel: "A1",
    maxLevel: "B1",
    correctionStyle: "gentle",
    tasks: [
      "Get the person's attention politely",
      "Ask how to get to a place",
      "Repeat the directions back to check",
      "Thank them",
    ],
    usefulPhrases: [
      "Excuse me, where is…?",
      "Is it far?",
      "So I go left, then straight on?",
      "Thank you very much.",
    ],
    grammarFocus: ["imperatives", "prepositions of place", "question forms"],
    vocabularyFocus: ["directions", "places in a town", "distance"],
  },
  {
    id: "restaurant",
    title: "Restaurant",
    goal: "Get a table, order a full meal, handle one problem, and pay.",
    tutorRole: "a waiter who is helpful and answers questions about the menu",
    setting: "a restaurant in the evening",
    minLevel: "A2",
    maxLevel: "B1",
    correctionStyle: "balanced",
    tasks: [
      "Ask for a table for two",
      "Ask what a dish contains",
      "Order a starter and a main",
      "Report one problem with the food",
      "Ask for the bill",
    ],
    usefulPhrases: [
      "A table for two, please.",
      "What's in the…?",
      "I'm afraid this isn't what I ordered.",
      "Could we have the bill?",
    ],
    grammarFocus: ["polite requests", "questions", "past tense for complaints"],
    vocabularyFocus: ["food", "menu", "complaints"],
  },
  {
    id: "shopping",
    title: "Shopping for clothes",
    goal: "Find the right size, ask to try something on, and decide.",
    tutorRole: "a shop assistant who offers alternatives without pushing",
    setting: "a clothing shop",
    minLevel: "A2",
    maxLevel: "B1",
    correctionStyle: "balanced",
    tasks: [
      "Say what you are looking for",
      "Ask for a different size or colour",
      "Ask to try it on",
      "Say whether you will buy it",
    ],
    usefulPhrases: [
      "I'm looking for…",
      "Do you have this in a larger size?",
      "Can I try it on?",
      "I'll take it.",
    ],
    grammarFocus: ["comparatives", "demonstratives", "conditional for politeness"],
    vocabularyFocus: ["clothes", "sizes", "colours"],
  },
  {
    id: "hotel",
    title: "Hotel check-in",
    goal: "Check in, ask about facilities, and resolve a problem with the room.",
    tutorRole: "a receptionist who is efficient and willing to help",
    setting: "a hotel reception desk",
    minLevel: "A2",
    maxLevel: "B1",
    correctionStyle: "balanced",
    tasks: [
      "Say you have a reservation",
      "Ask about breakfast times",
      "Report a problem with the room",
      "Ask for it to be fixed",
    ],
    usefulPhrases: [
      "I have a reservation under…",
      "What time is breakfast?",
      "There's a problem with…",
      "Could you send someone up?",
    ],
    grammarFocus: ["present perfect", "polite requests", "there is / there are"],
    vocabularyFocus: ["travel", "hotel", "facilities"],
  },
  {
    id: "airport",
    title: "You missed your flight",
    goal: "Explain what happened and get rebooked.",
    tutorRole: "an airline desk agent who is calm and needs specific information",
    setting: "an airline service desk after a delay",
    minLevel: "B1",
    maxLevel: "B2",
    correctionStyle: "balanced",
    tasks: [
      "Explain why you missed the flight",
      "Ask what your options are",
      "Negotiate a replacement flight",
      "Ask about compensation",
    ],
    usefulPhrases: [
      "My flight was delayed and I missed the connection.",
      "What are my options?",
      "Is there anything earlier?",
      "Am I entitled to anything?",
    ],
    grammarFocus: ["past continuous and past simple together", "modals of possibility", "polite negotiation"],
    vocabularyFocus: ["travel", "delays", "connections"],
  },
  {
    id: "meeting-someone",
    title: "Meeting someone new",
    goal: "Introduce yourself, find common ground, and arrange to meet again.",
    tutorRole: "someone the learner has just been introduced to at a social event",
    setting: "a friend's party",
    minLevel: "A2",
    maxLevel: "B1",
    correctionStyle: "gentle",
    tasks: [
      "Introduce yourself and say what you do",
      "Ask the other person about themselves",
      "Find something you have in common",
      "Suggest meeting again",
    ],
    usefulPhrases: [
      "I don't think we've met.",
      "What do you do?",
      "Me too!",
      "We should do this again sometime.",
    ],
    grammarFocus: ["present simple questions", "present perfect for experience", "suggestions"],
    vocabularyFocus: ["work", "hobbies", "social"],
  },
  {
    id: "workplace",
    title: "Workplace conversation",
    goal: "Discuss a project, raise a concern, and agree next steps.",
    tutorRole: "a colleague working on the same project who partly disagrees",
    setting: "a short internal meeting",
    minLevel: "B1",
    maxLevel: "C1",
    correctionStyle: "balanced",
    tasks: [
      "Summarise where the project stands",
      "Raise a concern about the deadline",
      "Disagree politely with a suggestion",
      "Agree on what happens next",
    ],
    usefulPhrases: [
      "Where are we with…?",
      "I'm a bit concerned about the timeline.",
      "I see your point, but…",
      "Let's agree that…",
    ],
    grammarFocus: ["present perfect continuous", "hedging", "polite disagreement"],
    vocabularyFocus: ["work", "projects", "meetings"],
  },
  {
    id: "university",
    title: "Talking to a lecturer",
    goal: "Ask about an assignment, explain a difficulty, and request an extension.",
    tutorRole: "a lecturer who is approachable but expects a clear reason",
    setting: "office hours",
    minLevel: "B1",
    maxLevel: "B2",
    correctionStyle: "balanced",
    tasks: [
      "Explain which assignment you are asking about",
      "Ask a specific question about the requirements",
      "Explain a difficulty you are having",
      "Ask for an extension",
    ],
    usefulPhrases: [
      "I'd like to ask about the assignment.",
      "Could you clarify what you mean by…?",
      "I've been struggling with…",
      "Would it be possible to have more time?",
    ],
    grammarFocus: ["indirect questions", "present perfect continuous", "formal requests"],
    vocabularyFocus: ["study", "assignments", "deadlines"],
  },
  {
    id: "job-interview",
    title: "Job interview",
    goal: "Present your experience, handle a difficult question, and ask your own.",
    tutorRole: "an interviewer for a software engineering role who probes for specifics",
    setting: "a first-round interview",
    minLevel: "B1",
    maxLevel: "C1",
    correctionStyle: "strict",
    tasks: [
      "Introduce yourself and your background",
      "Describe a project you are proud of",
      "Answer a question about a failure",
      "Ask two questions about the role",
    ],
    usefulPhrases: [
      "I've been working in… for…",
      "The main challenge was…",
      "What I took from that was…",
      "Could you tell me more about…?",
    ],
    grammarFocus: ["past simple vs present perfect", "relative clauses", "formal register"],
    vocabularyFocus: ["work", "skills", "achievements"],
  },
  {
    id: "health",
    title: "At the doctor's",
    goal: "Describe symptoms clearly and understand the advice.",
    tutorRole: "a doctor who asks precise follow-up questions",
    setting: "a clinic appointment",
    minLevel: "A2",
    maxLevel: "B1",
    correctionStyle: "balanced",
    tasks: [
      "Say what the problem is",
      "Describe how long it has been happening",
      "Answer follow-up questions",
      "Check you understood the advice",
    ],
    usefulPhrases: [
      "I've had a… for…",
      "It hurts when I…",
      "How often should I take it?",
      "Sorry, could you repeat that?",
    ],
    grammarFocus: ["present perfect with for and since", "body and pain vocabulary", "imperatives"],
    vocabularyFocus: ["health", "symptoms", "treatment"],
  },
  {
    id: "free-conversation",
    title: "Free conversation",
    goal: "Talk about whatever you like, with corrections as you go.",
    tutorRole: "a conversation partner who follows the learner's interests and keeps them talking",
    setting: "a relaxed chat",
    minLevel: "A1",
    maxLevel: "C2",
    correctionStyle: "gentle",
    tasks: [
      "Say what you have been doing lately",
      "Talk about something you enjoy",
      "Ask the tutor a question",
    ],
    usefulPhrases: [
      "Recently I've been…",
      "I really enjoy…",
      "What about you?",
    ],
    grammarFocus: ["present perfect", "present simple", "question forms"],
    vocabularyFocus: ["daily life", "interests"],
  },
];

export function findScenario(id: string): Scenario | null {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/** Scenarios suitable for a learner's level. */
export function scenariosForLevel(level: CefrLevel | null): Scenario[] {
  if (!level) return [...SCENARIOS];
  const rank = levelRank(level);
  return SCENARIOS.filter(
    (scenario) =>
      rank >= levelRank(scenario.minLevel) - 1 && rank <= levelRank(scenario.maxLevel) + 1,
  );
}

export type ConversationPlan = {
  scenario: Scenario;
  level: CefrLevel;
  /** The system prompt for the tutor. */
  systemPrompt: string;
  /** What the tutor opens with. */
  openingLine: string | null;
  /** How long the session is expected to run, in turns. */
  expectedTurns: number;
  /** Whether the learner's level is inside the scenario's authored band. */
  levelIsInBand: boolean;
};

/**
 * Level-specific guidance for the tutor.
 *
 * The concrete constraints matter more than the label. "B1" means nothing to a
 * model; "use one clause per sentence and only the present and past simple" is
 * actionable, and is what keeps a beginner conversation from collapsing into
 * incomprehensible input.
 */
const LEVEL_GUIDANCE: Record<CefrLevel, { language: string; turns: number }> = {
  A1: {
    language:
      "Use only the present simple, the near future, and set phrases. One short sentence per turn, at most 8 words. Use the 500 most common words. Ask one question at a time and wait.",
    turns: 8,
  },
  A2: {
    language:
      "Use the present, past simple and near future. Sentences of at most 12 words. Avoid subordinate clauses. Introduce one new word per turn at most, and only when the context makes it obvious.",
    turns: 10,
  },
  B1: {
    language:
      "Speak naturally but clearly, with common past and future forms. Sentences of up to 18 words. You may use one subordinate clause per sentence. Introduce a new expression every few turns.",
    turns: 12,
  },
  B2: {
    language:
      "Speak at natural speed with a wide range of tenses. Use idiomatic expressions, and explain one if the learner does not follow.",
    turns: 14,
  },
  C1: {
    language:
      "Speak as you would to a fluent colleague. Use idioms, register shifts, and nuance freely. Push the learner towards precision rather than simplifying.",
    turns: 16,
  },
  C2: {
    language:
      "Speak exactly as to a native speaker. Introduce stylistic nuance, humour and cultural reference. Treat the learner as a peer.",
    turns: 18,
  },
};

/**
 * Build the tutor's plan for one session.
 *
 * `levelIsInBand` is reported rather than enforced: a B1 learner choosing the
 * coffee-shop scenario gets an easier conversation, which is a legitimate choice
 * for building confidence. What must not happen is the tutor speaking at B1 to an
 * A1 learner, and that is what the language guidance prevents.
 */
export function planConversation(
  scenario: Scenario,
  level: CefrLevel,
): ConversationPlan {
  const guidance = LEVEL_GUIDANCE[level];

  const systemPrompt = [
    `You are ${scenario.tutorRole}, in ${scenario.setting}.`,
    `The learner is studying ${"the target language"} at level ${level}.`,
    "",
    "How to speak:",
    guidance.language,
    "",
    "How to correct:",
    CORRECTION_BEHAVIOUR[scenario.correctionStyle],
    "Never correct by restating the whole sentence and moving on — name the change in a few words, then continue the scene.",
    "",
    "What to accomplish:",
    ...scenario.tasks.map((task, index) => `${index + 1}. Get the learner to ${task.toLowerCase()}`),
    "",
    "Rules:",
    "- Stay in character. You are not a teacher explaining grammar; you are a person in this situation.",
    "- Keep the conversation moving. If the learner is stuck, offer a choice rather than the answer.",
    "- Work the listed phrases in naturally so the learner hears them in use.",
    `- Aim for about ${guidance.turns} exchanges, then bring the scene to a natural close.`,
    "- Speak only in the target language, except to give a one-word gloss when the learner is clearly lost.",
    "",
    `Grammar to exercise naturally: ${scenario.grammarFocus.join(", ")}.`,
    `Vocabulary to draw on: ${scenario.vocabularyFocus.join(", ")}.`,
  ].join("\n");

  return {
    scenario,
    level,
    systemPrompt,
    openingLine: buildOpeningLine(scenario, level),
    expectedTurns: guidance.turns,
    levelIsInBand:
      levelRank(level) >= levelRank(scenario.minLevel) &&
      levelRank(level) <= levelRank(scenario.maxLevel),
  };
}

/**
 * The tutor's first line.
 *
 * Null when a scripted opening would be wrong: a free conversation should start
 * from what the learner says, not from a canned greeting they then have to
 * answer. Returning null is better than a line that does not fit the scene.
 */
export function buildOpeningLine(scenario: Scenario, level: CefrLevel): string | null {
  if (scenario.id === "free-conversation") return null;

  // Written per scenario rather than generated: an opening line is the learner's
  // model for the whole conversation, and it should be authored.
  const openings: Record<string, string> = {
    "coffee-shop": "Hi there! What can I get you today?",
    directions: "You look a bit lost — are you trying to find something?",
    restaurant: "Good evening. A table for how many?",
    shopping: "Hello! Let me know if you'd like a hand with anything.",
    hotel: "Good afternoon, welcome. Do you have a reservation with us?",
    airport: "Hello. How can I help you today?",
    "meeting-someone": "Hey, I don't think we've met — I'm Sam. How do you know Alex?",
    workplace: "Morning. Shall we go through where the project's got to?",
    university: "Come in, take a seat. Which assignment did you want to talk about?",
    "job-interview": "Thanks for coming in. To start, could you tell me a bit about your background?",
    health: "Hello, take a seat. What seems to be the problem?",
  };

  const opening = openings[scenario.id];
  if (!opening) return null;

  // A1 learners get a shorter greeting so the first thing they hear is decodable.
  if (level === "A1" && opening.length > 40) {
    const short: Record<string, string> = {
      "coffee-shop": "Hi! What would you like?",
      directions: "Hello! Are you lost?",
      restaurant: "Good evening. How many people?",
      shopping: "Hello! Can I help you?",
      hotel: "Good afternoon. Do you have a reservation?",
      airport: "Hello. Can I help you?",
      "meeting-someone": "Hi! I'm Sam. And you?",
      workplace: "Morning. Let's start.",
      university: "Hello. Which assignment?",
      "job-interview": "Hello. Tell me about your work.",
      health: "Hello. What's the problem?",
    };
    return short[scenario.id] ?? opening;
  }

  return opening;
}
