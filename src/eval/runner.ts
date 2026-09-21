import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PatientCase } from '../types.js';
import { AgreementLabelsSchema, checkLabels, runAgreementEval, summariseAgreement } from './agreementEval.js';
import type { EvalArgs, EvalName } from './args.js';
import { runAttackEval, summariseAttackEval } from './attackEval.js';
import { GRADER_OPTIONS, JUDGE_SETTINGS, type EvalClients } from './clients.js';
import {
  AttackSetSchema,
  checkAgainstCase,
  JudgeLinesSchema,
  loadFixture,
  OffCaseProbesSchema,
  SafetySetSchema,
} from './fixtures.js';
import { runFaithfulnessEval, runOffCaseEval, summariseFaithfulness, summariseOffCase } from './honestyEval.js';
import { runJudgeEval, summariseJudgeEval } from './judgeEval.js';
import {
  costOfCalls,
  type CostSummary,
  formatAgreementReport,
  formatAttackReport,
  formatHonestyReport,
  formatJudgeReport,
  formatSafetyReport,
} from './report.js';
import { runSafetyEval, summariseSafetyEval } from './safetyEval.js';
import type { z } from 'zod';

/** A fixture is missing, malformed or written for another case: the run cannot start. */
export class EvalSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalSetupError';
  }
}

export interface RunOptions {
  fixturesDir: string;
  /** Where online results are saved; offline results are never saved. */
  outDir: string;
  now: () => Date;
  log: (text: string) => void;
  /** Model names recorded with saved results. */
  models: { judge: string; patient: string };
}

interface Report {
  markdown: string;
  data: unknown;
}

function need<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const loaded = loadFixture(path, schema);
  if (!loaded.ok) throw new EvalSetupError(loaded.message);
  return loaded.value;
}

function mustMatch(errors: string[], what: string): void {
  if (errors.length > 0) throw new EvalSetupError(`${what} does not match the case:\n  ${errors.join('\n  ')}`);
}

function runners(args: EvalArgs, c: PatientCase, clients: EvalClients, opts: RunOptions): Record<EvalName, () => Promise<Report>> {
  const fixture = (name: string) => join(opts.fixturesDir, name);
  const mark = () => ({ calls: clients.usage().length, spent: clients.spentUsd() });
  // Calls and latency from the usage log; cost from the budget, which also charged failed attempts.
  const since = (m: ReturnType<typeof mark>): CostSummary => ({ ...costOfCalls(clients.usage().slice(m.calls)), costUsd: clients.spentUsd() - m.spent });
  return {
    async judge() {
      const lines = need(fixture(`judge-lines.${c.id}.json`), JudgeLinesSchema);
      mustMatch(checkAgainstCase(lines, c), 'The judge lines');
      const settings = clients.online ? JUDGE_SETTINGS : [{ name: 'offline keyword judge', model: 'offline', thinking: false, maxTokens: 0 }];
      const rows = [];
      for (const setting of settings) {
        const start = mark();
        const results = await runJudgeEval(c, lines, clients.judgeFor(setting));
        rows.push({ setting: setting.name, model: setting.model, summary: summariseJudgeEval(c, results), cost: since(start), results });
      }
      return { markdown: formatJudgeReport(c, rows), data: { labelledBy: lines.labelledBy, rows } };
    },
    async safety() {
      const set = need(fixture('safety-blind-heldout.json'), SafetySetSchema);
      const start = mark();
      const results = await runSafetyEval(c, set, clients.judge);
      const summary = summariseSafetyEval(results);
      return { markdown: formatSafetyReport(summary, since(start)), data: { summary, results } };
    },
    async attack() {
      const set = need(fixture('attacks.json'), AttackSetSchema);
      const start = mark();
      const results = await runAttackEval(c, set, clients.judge, clients.patient);
      const summary = summariseAttackEval(results);
      return { markdown: formatAttackReport(summary, since(start)), data: { summary, results } };
    },
    async honesty() {
      const probes = need(fixture(`off-case.${c.id}.json`), OffCaseProbesSchema);
      mustMatch(checkAgainstCase(probes, c), 'The off-case questions');
      const start = mark();
      const offCase = await runOffCaseEval(c, probes, clients, args.repeat);
      const faith = await runFaithfulnessEval(c, clients, args.repeat);
      const summaries = { offCase: summariseOffCase(offCase), faithfulness: summariseFaithfulness(faith) };
      return {
        markdown: formatHonestyReport(summaries.offCase, summaries.faithfulness, since(start), {
          grader: clients.online ? 'Nemotron Super with reasoning on' : 'the offline keyword grader',
          repeat: args.repeat,
          questions: probes.questions.length,
          facts: c.facts.length,
        }),
        data: { repeat: args.repeat, summaries, offCase, faithfulness: faith },
      };
    },
    async agreement() {
      const labels = need(args.labelsPath ?? '', AgreementLabelsSchema);
      mustMatch(checkLabels(labels, c), 'The labels');
      const start = mark();
      const results = await runAgreementEval(c, labels, clients.judge);
      const summary = summariseAgreement(c, results);
      return { markdown: formatAgreementReport(summary, labels.labelledBy, since(start)), data: { labelledBy: labels.labelledBy, summary, results } };
    },
  };
}

function save(opts: RunOptions, c: PatientCase, name: EvalName, report: Report, cost: CostSummary, capUsd: number): string[] {
  const dir = join(opts.outDir, c.id);
  mkdirSync(dir, { recursive: true });
  const runAt = opts.now().toISOString();
  const header = `<!-- Generated by npm run eval on ${runAt}. Case ${c.id} is ${c.reviewStatus}: not clinically reviewed. -->`;
  const md = join(dir, `${name}.md`);
  const json = join(dir, `${name}.json`);
  writeFileSync(md, `${header}\n\n${report.markdown}\n`);
  const meta = { evaluation: name, caseId: c.id, runAt, ...opts.models, grader: GRADER_OPTIONS.model, capUsd, cost };
  writeFileSync(json, `${JSON.stringify({ ...meta, data: report.data }, null, 2)}\n`);
  return [md, json];
}

/**
 * Runs the chosen evaluations in order, printing each report. Online results are saved as
 * Markdown and JSON under outDir/<case id>/; offline numbers only check the plumbing and are
 * printed under a warning, never saved. A BudgetError stops the run and is passed to the caller.
 */
export async function runEvals(args: EvalArgs, c: PatientCase, clients: EvalClients, opts: RunOptions): Promise<string[]> {
  const run = runners(args, c, clients, opts);
  const saved: string[] = [];
  if (!clients.online) opts.log('OFFLINE PLUMBING CHECK: keyword doubles, numbers mean nothing and nothing is saved.\n');
  for (const name of args.evals) {
    const calls = clients.usage().length;
    const spent = clients.spentUsd();
    const report = await run[name]();
    opts.log(`${report.markdown}\n`);
    const cost: CostSummary = { ...costOfCalls(clients.usage().slice(calls)), costUsd: clients.spentUsd() - spent };
    if (clients.online) saved.push(...save(opts, c, name, report, cost, args.capUsd));
  }
  return saved;
}
