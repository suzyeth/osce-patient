import { z } from 'zod';

/**
 * A scoring domain is named by the domain pack a case belongs to, not by this file: the engine has
 * no opinion about what is being taught. See src/domains/pack.ts.
 */
export type Domain = string;
export const FACT_KINDS = ['presenting', 'history', 'red_flag', 'concern'] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const SourceSchema = z.object({
  dataset: z.enum(['fareez2022', 'primock57', 'agentclinic-medqa', 'authored']),
  /** Where the fact came from, e.g. "RES0001.txt#L12". */
  ref: z.string().min(1),
  /** Verbatim source sentence, or an authoring note for dataset "authored". */
  quote: z.string().min(1),
});

export const RubricItemSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  label: z.string().min(1),
  /** A critical item (e.g. a red flag) caps the global judgement at Borderline when missed. */
  critical: z.boolean().default(false),
  /** Shown in the report as "Try: ..." when the item is missed. */
  exampleQuestion: z.string().min(1),
  /** Lower-case phrases used only by the offline keyword judge. */
  offlineCues: z.array(z.string()).default([]),
});

export const FactSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(FACT_KINDS),
  /** The rubric item whose coverage unlocks this fact. */
  rubricItemId: z.string().min(1),
  /** What the patient may say once the fact is unlocked. */
  text: z.string().min(1),
  /** Terms the patient must not say while this fact is locked. */
  guardedTerms: z.array(z.string()).default([]),
  /** Concern facts only: trust level at which the patient volunteers it unasked. */
  minTrust: z.number().min(0).max(100).optional(),
  source: SourceSchema,
});

export const PatientCaseSchema = z.object({
  id: z.string().min(1),
  /** The domain pack whose rubric, domains and feedback statements this case is marked against. */
  pack: z.string().min(1).default('uk-clinical-history'),
  title: z.string().min(1),
  candidateBrief: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  reviewStatus: z.enum(['unreviewed', 'reviewed']),
  patient: z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
    persona: z.string().min(1),
    openingLine: z.string().min(1),
  }),
  rubric: z.array(RubricItemSchema).min(1),
  facts: z.array(FactSchema).min(1),
});

export type Source = z.infer<typeof SourceSchema>;
export type RubricItem = z.infer<typeof RubricItemSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type PatientCase = z.infer<typeof PatientCaseSchema>;

export function parseCase(raw: unknown): PatientCase {
  return PatientCaseSchema.parse(raw);
}

export const JudgeVerdictSchema = z.object({
  /** Rubric items this student turn covered. */
  rubricItemIds: z.array(z.string()),
  /** Fact ids the student explicitly asked about (optional precision on top of rubric items). */
  requestedFactIds: z.array(z.string()),
  questionStyle: z.enum(['open', 'closed', 'leading', 'none']),
  empathy: z.boolean(),
  interrupted: z.boolean(),
  jargon: z.boolean(),
  /** True when the user seems to describe their own real symptoms. */
  selfDisclosure: z.boolean(),
  /**
   * True when the line asks about the person, their life or their circumstances, whether or not it
   * matches a rubric item. False for greetings, permission, summaries and closing.
   *
   * This is the signal that separates "asked about something the case never mentions", where the
   * answer must be that they do not know, from small talk, where it must not. Measured three times,
   * the prompt alone does not hold that line; without this field the engine cannot tell the two apart
   * ("How are you?" credits nothing and reaches no fact, and so does "Have you had chest pain?").
   * Defaults to false, so a judge that omits it leaves the engine doing what it did before.
   */
  asksAboutFacts: z.boolean().default(false),
  trustDelta: z.number(),
  reasoning: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

/**
 * One student turn, kept so the report can quote the words that earned a mark instead of only
 * naming the turn. Everything a mark rests on has to be inspectable by the person being marked.
 */
export interface TurnRecord {
  /** 1-based. */
  turn: number;
  /** The student's own words, verbatim. */
  studentInput: string;
  /** Rubric items this turn was the first to cover. */
  creditedItemIds: string[];
  questionStyle: JudgeVerdict['questionStyle'];
  empathy: boolean;
  interrupted: boolean;
  jargon: boolean;
}

export interface SessionState {
  trust: number;
  unlockedFactIds: string[];
  /** rubric item id -> 1-based turn index where it was first covered */
  rubricHits: Record<string, number>;
  turnsUsed: number;
  interruptions: number;
  jargonCount: number;
  empathyCount: number;
  /** Every turn in order, for quoting evidence back in the report. */
  transcript: TurnRecord[];
}
