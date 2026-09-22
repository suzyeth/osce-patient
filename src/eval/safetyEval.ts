import type { JudgeClient } from '../llm.js';
import type { PatientCase } from '../types.js';
import type { SafetyClient } from '../nebius/safetyClient.js';
import { looksLikeSelfDisclosure } from '../safety.js';
import { initialSessionState } from '../state.js';
import type { SafetySet } from './fixtures.js';
import { failureReason } from './failures.js';
import { ratio } from './metrics.js';

export type SafetyGroup = keyof SafetySet;

/** A named self-disclosure check to measure: one row per setting in the report. */
export interface NamedSafetyCheck {
  name: string;
  client: SafetyClient;
}

export interface SafetyLineResult {
  group: SafetyGroup;
  text: string;
  regex: boolean;
  /** The judge's selfDisclosure flag, or null when the judge failed on this line. */
  judge: boolean | null;
  /** Each named check's answer, or null when that call failed. */
  models: Record<string, boolean | null>;
  failures: string[];
}

export interface SignalSummary {
  /** Share of the group this signal flagged, over the lines it answered. */
  rate: number | null;
  failures: number;
}

export interface SafetyGroupSummary {
  lines: number;
  regex: SignalSummary;
  judge: SignalSummary;
  models: Record<string, SignalSummary>;
  /** Pause when the rule list or the chosen model fires. */
  blockedRate: number | null;
  /** The same over every line, a line whose outcome is unknown counted as not paused. */
  blockedRateAll: number | null;
  /** Pause when the rule list, the chosen model or the judge's own flag fires. */
  withJudgeRate: number | null;
}

export interface EngineSignals {
  /** Which named check the engine would use; leave it out to score the rule list and judge alone. */
  model?: string;
}

/**
 * Runs the rule list, the judge and every named check on every line of a set. Each signal is asked
 * on every line, even when another has already fired, so each one's own rate stands next to the
 * combined rate the engine would use.
 */
export async function runSafetyEval(
  patientCase: PatientCase,
  set: SafetySet,
  judge: JudgeClient,
  checks: readonly NamedSafetyCheck[] = [],
): Promise<SafetyLineResult[]> {
  const groups: SafetyGroup[] = ['candidate', 'borderline', 'disclosure'];
  const results: SafetyLineResult[] = [];
  for (const group of groups) {
    for (const text of set[group]) {
      const failures: string[] = [];
      let judged: boolean | null = null;
      try {
        judged = (await judge.evaluate({ patientCase, state: initialSessionState(), studentInput: text, history: [] })).selfDisclosure;
      } catch (e) {
        failures.push(`judge: ${failureReason(e)}`);
      }
      const models: Record<string, boolean | null> = {};
      for (const check of checks) {
        try {
          models[check.name] = (await check.client.check({ studentInput: text, history: [] })).selfDisclosure;
        } catch (e) {
          models[check.name] = null;
          failures.push(`${check.name}: ${failureReason(e)}`);
        }
      }
      results.push({ group, text, regex: looksLikeSelfDisclosure(text), judge: judged, models, failures });
    }
  }
  return results;
}

function signal(rows: readonly SafetyLineResult[], pick: (r: SafetyLineResult) => boolean | null): SignalSummary {
  const answered = rows.map(pick).filter((v): v is boolean => v !== null);
  return { rate: ratio(answered.filter(Boolean).length, answered.length), failures: rows.length - answered.length };
}

/**
 * Per group: for disclosure lines the rates are recall (higher is better); for candidate lines they
 * are false-pause rates (lower is better). Borderline lines have no right answer and are reported only.
 */
export function summariseSafetyEval(
  results: readonly SafetyLineResult[],
  engine: EngineSignals = {},
  names: readonly string[] = [],
): Record<SafetyGroup, SafetyGroupSummary> {
  const summarise = (group: SafetyGroup): SafetyGroupSummary => {
    const rows = results.filter((r) => r.group === group);
    const engineModel = (r: SafetyLineResult) => (engine.model === undefined ? false : (r.models[engine.model] ?? null));
    const blocked = (r: SafetyLineResult) => r.regex || engineModel(r) === true;
    const withJudge = (r: SafetyLineResult) => blocked(r) || r.judge === true;
    // Unknown: nothing fired, but a signal the engine uses failed, so this line's outcome is not known.
    const unknown = (r: SafetyLineResult) => !blocked(r) && engineModel(r) === null;
    const known = rows.filter((r) => !unknown(r));
    const knownWithJudge = rows.filter((r) => withJudge(r) || (engineModel(r) !== null && r.judge !== null));
    return {
      lines: rows.length,
      regex: signal(rows, (r) => r.regex),
      judge: signal(rows, (r) => r.judge),
      models: Object.fromEntries(names.map((name) => [name, signal(rows, (r) => r.models[name] ?? null)])),
      blockedRate: ratio(known.filter(blocked).length, known.length),
      blockedRateAll: ratio(rows.filter(blocked).length, rows.length),
      withJudgeRate: ratio(knownWithJudge.filter(withJudge).length, knownWithJudge.length),
    };
  };
  return { candidate: summarise('candidate'), borderline: summarise('borderline'), disclosure: summarise('disclosure') };
}
