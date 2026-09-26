import { z } from 'zod';
import { FACT_KINDS } from '../types.js';
import type { Chat, ChatMessage, ModelOptions } from '../nebius/chat.js';
import { extractJson } from '../nebius/judgeClient.js';
import { STANDARD_RUBRIC, STANDARD_RUBRIC_IDS } from './rubric.js';
import { patientTurns, type Transcript } from './transcript.js';

/**
 * What the model proposes from a transcript. Nothing here is trusted: every quote is checked
 * against the transcript afterwards, and a fact whose quote is not there is thrown away.
 */
export const DraftFactSchema = z.object({
  /** What the patient may say once this unlocks, in their own voice, one or two sentences. */
  text: z.string().min(4),
  kind: z.enum(FACT_KINDS),
  /** Which standard rubric item a candidate must cover to hear it. */
  rubricItemId: z.string().min(1),
  /** The patient's own words from the transcript, word for word. */
  quote: z.string().min(2),
  /** The line the quote is on. */
  line: z.number().int().positive(),
  /** Distinctive words the patient must not say while this is locked. */
  guardedTerms: z.array(z.string()).default([]),
});
export type DraftFact = z.infer<typeof DraftFactSchema>;

/** The draft as it arrives: facts are checked one by one, so one bad entry cannot lose the rest. */
const RawDraftSchema = z.object({
  /** A short title for the station, e.g. "Persistent cough in a smoker". */
  title: z.string().min(4),
  patient: z.object({
    name: z.string().min(2),
    age: z.number().int().min(16).max(110),
    /** How they come across and how they talk; never a symptom or a diagnosis. */
    persona: z.string().min(10),
    /** Their first line, close to what they actually said first. */
    openingLine: z.string().min(4),
  }),
  /** The presenting problem in one line, for the candidate's brief. */
  presentingProblem: z.string().min(4),
  facts: z.array(z.unknown()).min(3),
  /** Red flags this case needs, beyond the standard rubric. */
  redFlags: z.array(z.object({ id: z.string().min(1), label: z.string().min(4), exampleQuestion: z.string().min(8) })).default([]),
});
type RawDraft = z.infer<typeof RawDraftSchema>;
export type DraftCase = Omit<RawDraft, 'facts'> & { facts: DraftFact[] };

/** A fact the model returned in a shape this version cannot use, kept for the review sheet. */
export interface MalformedFact {
  raw: unknown;
  reason: string;
}

export interface Extraction {
  draft: DraftCase;
  malformed: MalformedFact[];
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

const RULES = [
  'You turn a real consultation transcript into a case file for a history-taking practice tool.',
  'Work only from what the patient said. Never add a symptom, a medicine, a number or a diagnosis that is not in the transcript.',
  "Every fact carries a quote: the patient's own words, copied exactly from one line, and that line's number. A fact whose quote is not in the transcript word for word is thrown away, so copy, do not paraphrase.",
  'Quote at least eight characters. If the patient answered in one word ("Yeah."), quote that whole answer and cite its line; a shorter fragment is refused.',
  'kind: "presenting" for the problem that brought them in (exactly one), "history" for everything else they told the doctor, "red_flag" for a symptom that would need urgent action, "concern" for a worry they voiced about what it might be.',
  'Give between 10 and 16 facts, no more. Put everything the patient said on one topic into a single fact: one for the pain, one for smoking, one for medicines. A station lasts eight minutes.',
  'Skip plain denials ("no headaches", "no fevers") unless the doctor asked about a red flag for this presentation; then make one fact that carries those denials together.',
  'Mark as red_flag anything that would make a doctor act the same day: coughing up blood, a swollen or painful calf, fainting, chest pain at rest, sudden weakness, a rash that does not blanch, weight loss with night sweats. If the transcript has one, it must be a red_flag fact with its own entry in redFlags.',
  'text is what the patient would say in practice: their voice, one or two short sentences, plain English.',
  "guardedTerms are the distinctive words of that fact (a number, a name, a diagnosis) that would give it away; they must appear in the fact's own text.",
  'Give the patient a plausible British first and last name. Use their age if they said it, otherwise pick one that fits.',
  'persona is how they come across and how they talk: their job, their manner, how much they volunteer, what they are like to interview. It must not name a symptom, a finding or a diagnosis, because the patient reads it before the candidate has asked anything.',
  'openingLine is one sentence naming only the problem that brought them in, nothing else.',
  'Reply with one JSON object and nothing else.',
].join('\n');

function rubricList(): string {
  return STANDARD_RUBRIC.map((r) => `- ${r.id}: ${r.label}`).join('\n');
}

const SHAPE = `{"title": "...", "patient": {"name": "...", "age": 0, "persona": "...", "openingLine": "..."},
 "presentingProblem": "...",
 "facts": [{"text": "...", "kind": "presenting|history|red_flag|concern", "rubricItemId": "one of the ids above",
            "quote": "the patient's exact words", "line": 0, "guardedTerms": ["..."]}],
 "redFlags": [{"id": "snake_case_id", "label": "Asks about ...", "exampleQuestion": "..."}]}`;

/** The transcript as numbered lines; the patient's side is marked, the doctor's is context. */
export function buildExtractionMessages(transcript: Transcript): ChatMessage[] {
  const lines = transcript.turns
    .map((t) => `${t.line}\t${t.speaker === 'patient' ? 'PATIENT' : 'doctor'}: ${t.text}`)
    .join('\n');
  const system = [RULES, `Rubric items a fact may be attached to:\n${rubricList()}`, `Output shape:\n${SHAPE}`].join('\n\n');
  const user = [
    'A red flag that is not in the list above gets its own entry in redFlags, and its facts use that id.',
    `Transcript (line number, speaker, words):\n${lines}`,
  ].join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function issues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

function parseDraft(content: string): Extraction {
  const parsed = RawDraftSchema.safeParse(extractJson(content));
  if (!parsed.success) throw new ExtractionError(issues(parsed.error));
  const facts: DraftFact[] = [];
  const malformed: MalformedFact[] = [];
  for (const raw of parsed.data.facts) {
    const fact = DraftFactSchema.safeParse(raw);
    if (fact.success) facts.push(fact.data);
    else malformed.push({ raw, reason: issues(fact.error) });
  }
  if (facts.length < 3) throw new ExtractionError(`only ${facts.length} usable facts came back; the rest were malformed`);
  return { draft: { ...parsed.data, facts }, malformed };
}

/** Ids the draft may use: the standard rubric plus the red flags it declares itself. */
export function knownIds(draft: DraftCase): Set<string> {
  return new Set([...STANDARD_RUBRIC_IDS, ...draft.redFlags.map((r) => r.id)]);
}

/**
 * Asks the model once, with one repair attempt. The transcript is long, so this is the one place
 * in the project that sends thousands of tokens; it runs when a case is built, never in a session.
 */
export async function extractDraftCase(chat: Chat, transcript: Transcript, options: ModelOptions): Promise<Extraction> {
  if (patientTurns(transcript).length < 5) throw new ExtractionError('the transcript has too few patient turns to build a case');
  const messages = buildExtractionMessages(transcript);
  const first = await chat({ label: 'extract', model: options.model, messages, maxTokens: options.maxTokens, temperature: 0, json: true, thinking: options.thinking });
  try {
    return parseDraft(first.content);
  } catch (e) {
    const repair: ChatMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content },
      { role: 'user', content: `That reply could not be used (${(e as Error).message}). Reply again with only the JSON object in the required shape.` },
    ];
    const second = await chat({
      label: 'extract',
      model: options.model,
      messages: repair,
      maxTokens: first.finishReason === 'length' ? options.maxTokens * 2 : options.maxTokens,
      temperature: 0,
      json: true,
      thinking: options.thinking,
    });
    try {
      return parseDraft(second.content);
    } catch (e2) {
      throw new ExtractionError(`the model could not produce a usable case twice: ${(e2 as Error).message}`);
    }
  }
}
