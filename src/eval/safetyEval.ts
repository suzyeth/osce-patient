import type { JudgeClient } from '../llm.js';
import type { PatientCase } from '../types.js';
import { looksLikeSelfDisclosure } from '../safety.js';
import { initialSessionState } from '../state.js';
import type { SafetySet } from './fixtures.js';
import { failureReason } from './failures.js';
import { ratio } from './metrics.js';

export type SafetyGroup = keyof SafetySet;

export interface SafetyLineResult {
  group: SafetyGroup;
  text: string;
  regex: boolean;
  /** The judge's selfDisclosure flag, or null when the judge failed on this line. */
  judge: boolean | null;
  /** What the engine does: pause when either check fires. Unknown (false) when the judge failed and the regex did not fire. */
  blocked: boolean;
  failure: string | null;
}

export interface SafetyGroupSummary {
  lines: number;
  failures: number;
  regexRate: number | null;
  /** Over lines the judge answered. */
  judgeRate: number | null;
  /** Over lines whose outcome is known: the judge answered, or the regex fired (which pauses regardless). */
  blockedRate: number | null;
}

/**
 * Runs both safety checks on every line of the blind set. The judge is asked even when the regex
 * already fired, so each check's own rate can be reported next to the combined one.
 */
export async function runSafetyEval(patientCase: PatientCase, set: SafetySet, judge: JudgeClient): Promise<SafetyLineResult[]> {
  const groups: SafetyGroup[] = ['candidate', 'borderline', 'disclosure'];
  const results: SafetyLineResult[] = [];
  for (const group of groups) {
    for (const text of set[group]) {
      const regex = looksLikeSelfDisclosure(text);
      try {
        const v = await judge.evaluate({ patientCase, state: initialSessionState(), studentInput: text, history: [] });
        results.push({ group, text, regex, judge: v.selfDisclosure, blocked: regex || v.selfDisclosure, failure: null });
      } catch (e) {
        results.push({ group, text, regex, judge: null, blocked: regex, failure: failureReason(e) });
      }
    }
  }
  return results;
}

/**
 * Per group: for disclosure lines the rates are recall (higher is better); for candidate lines they
 * are false-block rates (lower is better). Borderline lines have no right answer and are only reported.
 */
export function summariseSafetyEval(results: readonly SafetyLineResult[]): Record<SafetyGroup, SafetyGroupSummary> {
  const summarise = (group: SafetyGroup): SafetyGroupSummary => {
    const rows = results.filter((r) => r.group === group);
    const judged = rows.filter((r) => r.judge !== null);
    const known = rows.filter((r) => r.judge !== null || r.regex);
    return {
      lines: rows.length,
      failures: rows.length - judged.length,
      regexRate: ratio(rows.filter((r) => r.regex).length, rows.length),
      judgeRate: ratio(judged.filter((r) => r.judge).length, judged.length),
      blockedRate: ratio(known.filter((r) => r.blocked).length, known.length),
    };
  };
  return { candidate: summarise('candidate'), borderline: summarise('borderline'), disclosure: summarise('disclosure') };
}
