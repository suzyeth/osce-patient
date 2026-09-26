import { z } from 'zod';
import type { ConversationTurn, JudgeClient } from '../llm.js';
import type { PatientCase, SessionState } from '../types.js';
import { applyVerdict, initialSessionState } from '../state.js';
import { failureReason } from './failures.js';
import { cohenKappa, ratio } from './metrics.js';

/** Whole conversations with the rubric items a person ticked for each candidate line. */
export const AgreementLabelsSchema = z.object({
  caseId: z.string().min(1),
  labelledBy: z.string().min(1),
  conversations: z
    .array(
      z.object({
        id: z.string().min(1),
        turns: z
          .array(z.object({ student: z.string().min(1), patient: z.string(), items: z.array(z.string()) }))
          .min(1),
      }),
    )
    .min(1),
});
export type AgreementLabels = z.infer<typeof AgreementLabelsSchema>;

export interface AgreementTurn {
  conversationId: string;
  turn: number;
  human: string[];
  /** Null when the judge failed on this turn. */
  judge: string[] | null;
  failure: string | null;
}

export function checkLabels(labels: AgreementLabels, patientCase: PatientCase): string[] {
  const errors = labels.caseId === patientCase.id ? [] : [`labels are for case ${labels.caseId}, not ${patientCase.id}`];
  const known = new Set(patientCase.rubric.map((r) => r.id));
  for (const conversation of labels.conversations) {
    conversation.turns.forEach((t, i) => {
      for (const id of t.items) {
        if (!known.has(id)) errors.push(`${conversation.id} turn ${i + 1}: unknown rubric item "${id}"`);
      }
    });
  }
  return errors;
}

/**
 * Replays each labelled conversation line by line, as in a real session: the judge sees the
 * earlier turns as history, and session state (rapport) moves with its own verdicts.
 */
export async function runAgreementEval(patientCase: PatientCase, labels: AgreementLabels, judge: JudgeClient): Promise<AgreementTurn[]> {
  const known = patientCase.rubric.map((r) => r.id);
  const results: AgreementTurn[] = [];
  for (const conversation of labels.conversations) {
    let state: SessionState = initialSessionState();
    let history: ConversationTurn[] = [];
    for (const [i, t] of conversation.turns.entries()) {
      try {
        const v = await judge.evaluate({ patientCase, state, studentInput: t.student, history });
        state = applyVerdict(state, v, known, t.student);
        results.push({ conversationId: conversation.id, turn: i + 1, human: t.items, judge: v.rubricItemIds, failure: null });
      } catch (e) {
        results.push({ conversationId: conversation.id, turn: i + 1, human: t.items, judge: null, failure: failureReason(e) });
      }
      history = [...history, { student: t.student, patient: t.patient }];
    }
  }
  return results;
}

/**
 * Every (turn, rubric item) pair is one yes/no decision by each rater. Kappa is given per item with
 * each rater's tick count, and pooled over all items; pooling mixes items that are ticked often and
 * rarely, so the per-item figures come first in the report. Failed turns are left out.
 */
export function summariseAgreement(patientCase: PatientCase, results: readonly AgreementTurn[]) {
  const done = results.filter((r) => r.judge !== null);
  const pairsFor = (itemId: string) => done.map((r): [boolean, boolean] => [r.human.includes(itemId), (r.judge ?? []).includes(itemId)]);
  const items = patientCase.rubric.map((r) => r.id);
  return {
    turns: results.length,
    failures: results.length - done.length,
    kappa: cohenKappa(items.flatMap(pairsFor)),
    turnAgreement: ratio(
      done.filter((r) => [...r.human].sort().join() === [...(r.judge ?? [])].sort().join()).length,
      done.length,
    ),
    perItem: items.map((id) => {
      const pairs = pairsFor(id);
      return {
        rubricItemId: id,
        kappa: cohenKappa(pairs),
        humanTicks: pairs.filter(([human]) => human).length,
        judgeTicks: pairs.filter(([, judge]) => judge).length,
      };
    }),
  };
}
