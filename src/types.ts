import { z } from 'zod';

export const DOMAINS = ['data_gathering', 'interpersonal', 'management'] as const;
export type Domain = (typeof DOMAINS)[number];
export const FACT_KINDS = ['presenting', 'history', 'red_flag', 'concern'] as const;
export type FactKind = (typeof FACT_KINDS)[number];
export type GlobalJudgement = 'Unsatisfactory' | 'Borderline' | 'Satisfactory' | 'Good';

export const SourceSchema = z.object({
  dataset: z.enum(['fareez2022', 'primock57', 'agentclinic-medqa', 'authored']),
  /** Where the fact came from, e.g. "RES0001.txt#L12". */
  ref: z.string().min(1),
  /** Verbatim source sentence, or an authoring note for dataset "authored". */
  quote: z.string().min(1),
});

export const RubricItemSchema = z.object({
  id: z.string().min(1),
  domain: z.enum(DOMAINS),
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
  trustDelta: z.number(),
  reasoning: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export interface SessionState {
  trust: number;
  unlockedFactIds: string[];
  /** rubric item id -> 1-based turn index where it was first covered */
  rubricHits: Record<string, number>;
  turnsUsed: number;
  interruptions: number;
  jargonCount: number;
  empathyCount: number;
}
