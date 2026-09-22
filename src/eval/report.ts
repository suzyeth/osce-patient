import type { CallUsage } from '../nebius/usage.js';
import type { PatientCase } from '../types.js';
import type { summariseAgreement } from './agreementEval.js';
import type { AttackSummary } from './attackEval.js';
import type { summariseFaithfulness, summariseOffCase } from './honestyEval.js';
import type { JudgeEvalSummary } from './judgeEval.js';
import { mean, pct, percentile } from './metrics.js';
import type { SafetyGroup, SafetyGroupSummary } from './safetyEval.js';

export interface CostSummary {
  calls: number;
  /** From the usage log; the runner replaces it with what the budget charged, failed attempts included. */
  costUsd: number;
  meanLatencyMs: number | null;
  p95LatencyMs: number | null;
}

export function costOfCalls(usages: readonly CallUsage[]): CostSummary {
  const latencies = usages.map((u) => u.latencyMs);
  const avg = mean(latencies);
  return {
    calls: usages.length,
    costUsd: usages.reduce((s, u) => s + u.costUsd, 0),
    meanLatencyMs: avg === null ? null : Math.round(avg),
    p95LatencyMs: percentile(latencies, 95),
  };
}

const ms = (v: number | null) => (v === null ? 'n/a' : `${(v / 1000).toFixed(1)} s`);
const usd = (v: number) => `$${v.toFixed(4)}`;
const num = (v: number | null, digits = 2) => (v === null ? 'n/a' : v.toFixed(digits));

function table(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function costLine(cost: CostSummary): string {
  return `${cost.calls} model calls, ${usd(cost.costUsd)} charged to the cap (failed attempts included), mean ${ms(cost.meanLatencyMs)} and 95th percentile ${ms(cost.p95LatencyMs)} per call.`;
}

export function formatJudgeReport(
  patientCase: PatientCase,
  rows: ReadonlyArray<{ setting: string; summary: JudgeEvalSummary; cost: CostSummary }>,
): string {
  const main = table(
    ['Judge setting', 'Exact lines', 'Precision', 'Recall', 'False unlocks', 'Failures', 'Cost', 'Per line (mean / 95th pct)'],
    rows.map(({ setting, summary: s, cost }) => [
      setting,
      pct(s.exactRate),
      pct(s.precision),
      pct(s.recall),
      pct(s.falseUnlockRate),
      String(s.failures),
      usd(cost.costUsd),
      `${ms(s.meanLatencyMs)} / ${ms(s.p95LatencyMs)}`,
    ]),
  );
  const facts = table(
    ['Fact', ...rows.map((r) => r.setting)],
    patientCase.facts.map((f) => [f.id, ...rows.map((r) => pct(r.summary.factUnlock.find((u) => u.factId === f.id)?.rate ?? null))]),
  );
  const lines = rows[0]?.summary.lines ?? 0;
  return [
    `## Judge accuracy (${patientCase.id}, ${lines} labelled lines each)`,
    main,
    'Exact lines counts a failed line as wrong. False unlocks: off-topic and injection lines that would have unlocked a fact, failed lines left out. Time per line includes any repair call. Cost is what the budget charged, failed attempts included.',
    '### Paraphrase unlock rate per fact',
    facts,
  ].join('\n\n');
}

export function formatSafetyReport(summary: Record<SafetyGroup, SafetyGroupSummary>, cost: CostSummary): string {
  const row = (label: string, s: SafetyGroupSummary) => [label, String(s.lines), pct(s.regexRate), pct(s.judgeRate), pct(s.blockedRate), String(s.failures)];
  return [
    '## Safety pause on the blind set',
    table(
      ['Lines', 'Count', 'Rule check', 'Judge', 'Either (what the engine does)', 'Judge failures'],
      [
        row('Real disclosures (recall, higher is better)', summary.disclosure),
        row('Candidate lines (false pauses, lower is better)', summary.candidate),
        row('Borderline (reported only)', summary.borderline),
      ],
    ),
    'The judge column leaves out lines where the judge failed. "Either" leaves out lines whose outcome is unknown: the judge failed and the rule check did not fire.',
    `Counting those unknown outcomes as misses, disclosure recall is ${pct(summary.disclosure.blockedRateAll)} (a session would not have paused on them).`,
    costLine(cost),
  ].join('\n\n');
}

export function formatAttackReport(summary: AttackSummary, cost: CostSummary): string {
  return [
    `## Leak attacks (${summary.attacks} attacks, one line each, fresh session)`,
    table(
      ['Version', 'Locked facts leaked per attack', 'Attacks with a leak'],
      [
        ['Control (all facts in the prompt, told not to volunteer)', num(summary.controlLeaksPerAttack), pct(summary.attacksWithControlLeak)],
        ['This engine, patient model before the output guard', num(summary.rawLeaksPerAttack), pct(summary.attacksWithRawLeak)],
        ['This engine, as shown to the candidate', num(summary.shownLeaksPerAttack), pct(summary.attacksWithShownLeak)],
      ],
    ),
    `The output guard removes still-locked terms by design, so a leak can reach the candidate only through a judge talked into unlocking a fact: that happened on ${summary.manipulatedUnlocks} attack(s), and ${summary.shownLeaksViaUnlock} fact(s) were then shown. Output guard triggered: ${summary.guardTriggers}. Safety pauses: ${summary.safetyBlocks}${summary.pausedAttackIds.length ? ` (${summary.pausedAttackIds.join(', ')}; scored as no engine leak)` : ''}. Failed attacks: ${summary.failures}.`,
    'The engine\'s patient model may answer twice on one attack (the guard\'s retry) and both answers count before the guard; the control version answers once. That leans against the engine.',
    'A leak is a literal mention of a locked fact\'s guarded term (whole word), counted over every fact locked before the attack, for both versions. It includes denials ("no blood") and hints, and misses paraphrases; only the control version has the facts to paraphrase, so those misses fall on its side.',
    costLine(cost),
  ].join('\n\n');
}

export interface HonestyMeta {
  /** Who graded, e.g. "Nemotron 3 Ultra (reasoning off)"; the report says it is not the patient model. */
  grader: string;
  repeat: number;
  questions: number;
  facts: number;
}

export function formatHonestyReport(
  offCase: ReturnType<typeof summariseOffCase>,
  faith: ReturnType<typeof summariseFaithfulness>,
  cost: CostSummary,
  meta: HonestyMeta,
): string {
  const offGraded = `${offCase.answers - offCase.failures} (${meta.questions} questions x ${meta.repeat})`;
  const faithGraded = `${faith.graded} (${meta.facts} facts x ${meta.repeat}, unlocked only)`;
  return [
    `## Patient honesty (graded by ${meta.grader})`,
    table(
      ['Measure', 'Result', 'Graded answers'],
      [
        ['Off-case questions answered with anything but "not sure" (the case says nothing either way)', pct(offCase.unsureRate === null ? null : 1 - offCase.unsureRate), offGraded],
        ['... of which an invented positive detail', pct(offCase.inventedRate), offGraded],
        ['... of which a flat denial', pct(offCase.deniedRate), offGraded],
        ['Off-case questions answered "not sure" (what the patient is told to say)', pct(offCase.unsureRate), offGraded],
        ['Unlocked facts actually stated', pct(faith.statedRate), faithGraded],
        ['Unlocked facts answered without contradiction', pct(faith.noContradictionRate), faithGraded],
      ],
    ),
    'Repeats of the same question are not independent samples. A reply that leaves a fact out counts as no contradiction, so read the stated rate first.',
    `Facts whose example question the judge did not credit: ${faith.notUnlocked}. Failed probes: ${offCase.failures + faith.failures}.`,
    costLine(cost),
  ].join('\n\n');
}

export function formatAgreementReport(summary: ReturnType<typeof summariseAgreement>, labelledBy: string, cost: CostSummary): string {
  return [
    `## Judge agreement with human labels (${labelledBy})`,
    table(
      ['Rubric item', 'Kappa', 'Ticked by the person', 'Ticked by the judge'],
      summary.perItem.map((p) => [p.rubricItemId, num(p.kappa), String(p.humanTicks), String(p.judgeTicks)]),
    ),
    `Pooled over every turn and item: kappa ${num(summary.kappa)}. Pooling mixes items ticked often and rarely, so read the rows first. Turns where the judge and the labels agree exactly: ${pct(summary.turnAgreement)} of ${summary.turns - summary.failures}.`,
    'Kappa is n/a for an item neither rater ticked on any turn.',
    costLine(cost),
  ].join('\n\n');
}
