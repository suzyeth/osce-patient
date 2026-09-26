import { JudgeVerdictSchema, type Fact, type JudgeVerdict, type PatientCase, type SessionState } from './types.js';
import type { ConversationTurn, JudgeClient, PatientClient, PatientInput } from './llm.js';
import { applyVerdict } from './state.js';
import { isPublic, unlockFacts } from './gates.js';
import { buildPatientContext } from './patientContext.js';
import { forbiddenTerms, guardReply } from './patientGuard.js';
import { looksLikeSelfDisclosure, safetyMessage, safetyMessageFor } from './safety.js';
import { packFor } from './domains/index.js';
import type { DisclosureCategory, SafetyClient, SafetyCheck } from './nebius/safetyClient.js';
import type { Signposting } from './safety.js';

export interface TurnResult {
  state: SessionState;
  reply: string;
  /** Null when the turn was blocked by the safety check. */
  verdict: JudgeVerdict | null;
  newlyUnlocked: string[];
  guardTriggered: boolean;
  safetyBlocked: boolean;
  /** Which check paused practice: the rule list, the safety model, or the judge's own flag. */
  blockedBy: 'rule' | 'model' | 'judge' | null;
  /** What the safety model called it, when it is what paused practice: drives the signposting. */
  blockedCategory: DisclosureCategory | null;
}

/** Generic retry warnings; they never name a leaked term, so they cannot feed a secret back. */
const LEAK_WARNING =
  '\n\nNote: your previous answer mentioned details that are not in your list of facts you may share. ' +
  'Answer again using only the facts listed above.';
// "the doctor" would contradict a non-clinical pack own role line, which tells the person they
// are not a customer and not being sold anything: both go into the same prompt.
const EMPTY_WARNING = '\n\nNote: your previous answer was empty. Answer in character, in one to three short sentences.';

/** Said in character when the patient model returns nothing twice. */
export const FALLBACK_REPLY = "Sorry, I didn't quite catch that. Could you say it again?";

function blocked(
  state: SessionState,
  blockedBy: 'rule' | 'model' | 'judge',
  signposting: Signposting,
  category: DisclosureCategory | null = null,
): TurnResult {
  return {
    state,
    reply: category === null ? safetyMessage(signposting) : safetyMessageFor(category, signposting),
    verdict: null,
    newlyUnlocked: [],
    guardTriggered: false,
    safetyBlocked: true,
    blockedBy,
    blockedCategory: category,
  };
}

/**
 * The safety model runs beside the judge, so it costs no extra waiting. Null means it had no
 * answer, from no client (offline) or a failed call; the caller then falls back to the judge's own
 * flag. Pausing a station over a network error would cost the candidate exam time.
 */
async function askSafetyModel(
  safety: SafetyClient | undefined,
  studentInput: string,
  history: readonly ConversationTurn[],
): Promise<SafetyCheck | null> {
  if (!safety) return null;
  try {
    return await safety.check({ studentInput, history });
  } catch {
    return null;
  }
}

/** Facts the student reached this turn: newly unlocked ones, plus shareable facts they asked about again. */
function relevantFacts(patientCase: PatientCase, state: SessionState, verdict: JudgeVerdict, newlyUnlocked: string[]): string[] {
  const asked = (f: Fact) => verdict.rubricItemIds.includes(f.rubricItemId) || verdict.requestedFactIds.includes(f.id);
  const shareable = (f: Fact) => isPublic(f) || state.unlockedFactIds.includes(f.id);
  return patientCase.facts.filter((f) => newlyUnlocked.includes(f.id) || (shareable(f) && asked(f))).map((f) => f.text);
}

interface GuardedReply {
  reply: string;
  guardTriggered: boolean;
}

/** One retry when the reply is empty or says a locked term; then an in-character fallback or redaction. */
async function respondGuarded(patient: PatientClient, base: PatientInput, forbidden: readonly string[]): Promise<GuardedReply> {
  const first = await patient.respond(base);
  const firstBlank = first.trim() === '';
  if (!firstBlank && guardReply(first, forbidden).ok) return { reply: first, guardTriggered: false };
  const retry = await patient.respond({ ...base, context: base.context + (firstBlank ? EMPTY_WARNING : LEAK_WARNING) });
  if (retry.trim() === '') return { reply: FALLBACK_REPLY, guardTriggered: !firstBlank };
  const retryGuard = guardReply(retry, forbidden);
  return { reply: retryGuard.ok ? retry : retryGuard.sanitized, guardTriggered: !firstBlank || !retryGuard.ok };
}

export async function runTurn(
  patientCase: PatientCase,
  state: SessionState,
  studentInput: string,
  judge: JudgeClient,
  patient: PatientClient,
  history: ConversationTurn[] = [],
  safety?: SafetyClient,
): Promise<TurnResult> {
  // Which lines pause practice, and how a pause is worded, belong to the field.
  const { disclosure, signposting } = packFor(patientCase.pack).safety;
  if (looksLikeSelfDisclosure(studentInput, disclosure)) return blocked(state, 'rule', signposting);

  // Both models are asked at once, so the safety check adds no waiting to the turn. The judge's
  // outcome is settled rather than awaited, because a failed judge call must never swallow a
  // disclosure the check has already confirmed.
  const [judged, flaggedByModel] = await Promise.all([
    judge.evaluate({ patientCase, state, studentInput, history }).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    askSafetyModel(safety, studentInput, history),
  ]);
  if (flaggedByModel?.selfDisclosure) return blocked(state, 'model', signposting, flaggedByModel.category);
  if (!judged.ok) throw judged.error;

  // The judge is an external model: validate its output before it touches state.
  const verdict = JudgeVerdictSchema.parse(judged.value);
  // The judge's own flag is the fallback for when the safety check had no answer. On the blind set
  // it added no recall over that check and tripled false pauses, so it does not override it.
  if (flaggedByModel === null && verdict.selfDisclosure) return blocked(state, 'judge', signposting);

  const afterVerdict = applyVerdict(state, verdict, patientCase.rubric.map((r) => r.id), studentInput);
  const newlyUnlocked = unlockFacts(patientCase, afterVerdict, verdict);
  const nextState: SessionState = {
    ...afterVerdict,
    unlockedFactIds: [...afterVerdict.unlockedFactIds, ...newlyUnlocked],
  };

  const base: PatientInput = {
    context: buildPatientContext(patientCase, nextState),
    studentInput,
    history,
    relevantFacts: relevantFacts(patientCase, nextState, verdict, newlyUnlocked),
  };
  const { reply, guardTriggered } = await respondGuarded(patient, base, forbiddenTerms(patientCase, nextState));
  return { state: nextState, reply, verdict, newlyUnlocked, guardTriggered, safetyBlocked: false, blockedBy: null, blockedCategory: null };
}

/** The next conversation history. A blocked turn is dropped, so its text is never sent to a model on a later turn. */
export function appendTurn(history: readonly ConversationTurn[], student: string, result: TurnResult): ConversationTurn[] {
  return result.safetyBlocked ? [...history] : [...history, { student, patient: result.reply }];
}
