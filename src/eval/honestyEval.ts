import type { JudgeClient, PatientClient } from '../llm.js';
import type { PatientCase } from '../types.js';
import { isPublic } from '../gates.js';
import { runTurn } from '../orchestrator.js';
import { initialSessionState } from '../state.js';
import type { OffCaseProbes } from './fixtures.js';
import { failureReason } from './failures.js';
import type { FaithLabel, Grader, OffCaseLabel } from './grader.js';
import { ratio } from './metrics.js';

export interface OffCaseResult {
  question: string;
  reply: string;
  label: OffCaseLabel | null;
  failure: string | null;
}

export interface FaithResult {
  factId: string;
  question: string;
  reply: string;
  /** False when the judge did not credit the question, so the fact never reached the patient. */
  unlocked: boolean;
  /** Null when not unlocked (nothing to grade) or when a model call failed. */
  label: FaithLabel | null;
  failure: string | null;
}

/** Plays one question from a fresh session through the whole engine and returns what was shown. */
async function ask(patientCase: PatientCase, question: string, judge: JudgeClient, patient: PatientClient) {
  const r = await runTurn(patientCase, initialSessionState(), question, judge, patient, []);
  if (r.safetyBlocked) throw new Error('the safety check paused practice on this question');
  return r;
}

/** Asks about things the case never mentions, `repeat` times each, and grades each answer. */
export async function runOffCaseEval(
  patientCase: PatientCase,
  probes: OffCaseProbes,
  clients: { judge: JudgeClient; patient: PatientClient; grader: Grader },
  repeat = 1,
): Promise<OffCaseResult[]> {
  const results: OffCaseResult[] = [];
  for (let round = 0; round < repeat; round += 1) {
    for (const question of probes.questions) {
      try {
        const { reply } = await ask(patientCase, question, clients.judge, clients.patient);
        const label = await clients.grader.offCase({ patientCase, question, reply });
        results.push({ question, reply, label, failure: null });
      } catch (e) {
        results.push({ question, reply: '', label: null, failure: failureReason(e) });
      }
    }
  }
  return results;
}

/**
 * For every fact, asks its rubric item's example question and grades the reply against the fact.
 * The example question is the case author's own wording, so this measures the patient, not the judge.
 */
export async function runFaithfulnessEval(
  patientCase: PatientCase,
  clients: { judge: JudgeClient; patient: PatientClient; grader: Grader },
  repeat = 1,
): Promise<FaithResult[]> {
  const results: FaithResult[] = [];
  for (let round = 0; round < repeat; round += 1) {
    for (const fact of patientCase.facts) {
      const question = patientCase.rubric.find((r) => r.id === fact.rubricItemId)?.exampleQuestion ?? '';
      try {
        const r = await ask(patientCase, question, clients.judge, clients.patient);
        const unlocked = isPublic(fact) || r.state.unlockedFactIds.includes(fact.id);
        const label = unlocked ? await clients.grader.faithful({ fact: fact.text, question, reply: r.reply }) : null;
        results.push({ factId: fact.id, question, reply: r.reply, unlocked, label, failure: null });
      } catch (e) {
        results.push({ factId: fact.id, question, reply: '', unlocked: false, label: null, failure: failureReason(e) });
      }
    }
  }
  return results;
}

export function summariseOffCase(results: readonly OffCaseResult[]) {
  const graded = results.filter((r) => r.label !== null);
  const share = (label: OffCaseLabel) => ratio(graded.filter((r) => r.label === label).length, graded.length);
  return {
    answers: results.length,
    failures: results.length - graded.length,
    inventedRate: share('invented'),
    deniedRate: share('denied'),
    unsureRate: share('unsure'),
  };
}

export function summariseFaithfulness(results: readonly FaithResult[]) {
  const graded = results.filter((r) => r.label !== null);
  return {
    probes: results.length,
    failures: results.filter((r) => r.failure !== null).length,
    notUnlocked: results.filter((r) => r.failure === null && !r.unlocked).length,
    graded: graded.length,
    /** The design's faithfulness figure: replies that do not contradict the fact. */
    noContradictionRate: ratio(graded.filter((r) => r.label !== 'contradicts').length, graded.length),
    statedRate: ratio(graded.filter((r) => r.label === 'consistent').length, graded.length),
    contradictions: graded.filter((r) => r.label === 'contradicts').length,
  };
}
