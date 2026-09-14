import { JudgeVerdictSchema, type Fact, type JudgeVerdict, type PatientCase, type SessionState } from './types.js';
import type { ConversationTurn, JudgeClient, PatientClient, PatientInput } from './llm.js';
import { applyVerdict } from './state.js';
import { isPublic, unlockFacts } from './gates.js';
import { buildPatientContext } from './patientContext.js';
import { forbiddenTerms, guardReply } from './patientGuard.js';
import { looksLikeSelfDisclosure, SAFETY_MESSAGE } from './safety.js';

export interface TurnResult {
  state: SessionState;
  reply: string;
  /** Null when the turn was blocked by the safety check. */
  verdict: JudgeVerdict | null;
  newlyUnlocked: string[];
  guardTriggered: boolean;
  safetyBlocked: boolean;
}

/** Generic retry warnings; they never name a leaked term, so they cannot feed a secret back. */
const LEAK_WARNING =
  '\n\nNote: your previous answer mentioned details that are not in your list of facts you may share. ' +
  'Answer again using only the facts listed above.';
const EMPTY_WARNING = '\n\nNote: your previous answer was empty. Answer the doctor in character, in one to three short sentences.';

/** Said in character when the patient model returns nothing twice. */
export const FALLBACK_REPLY = "Sorry, I didn't quite catch that. Could you say it again?";

function blocked(state: SessionState): TurnResult {
  return { state, reply: SAFETY_MESSAGE, verdict: null, newlyUnlocked: [], guardTriggered: false, safetyBlocked: true };
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
): Promise<TurnResult> {
  if (looksLikeSelfDisclosure(studentInput)) return blocked(state);

  // The judge is an external model: validate its output before it touches state.
  const verdict = JudgeVerdictSchema.parse(await judge.evaluate({ patientCase, state, studentInput, history }));
  if (verdict.selfDisclosure) return blocked(state);

  const afterVerdict = applyVerdict(state, verdict, patientCase.rubric.map((r) => r.id));
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
  return { state: nextState, reply, verdict, newlyUnlocked, guardTriggered, safetyBlocked: false };
}

/** The next conversation history. A blocked turn is dropped, so real symptoms never reach a model. */
export function appendTurn(history: readonly ConversationTurn[], student: string, result: TurnResult): ConversationTurn[] {
  return result.safetyBlocked ? [...history] : [...history, { student, patient: result.reply }];
}
