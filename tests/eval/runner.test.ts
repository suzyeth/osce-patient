import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EvalArgs } from '../../src/eval/args.js';
import { createEvalClients, offlineEvalClients } from '../../src/eval/clients.js';
import { EvalSetupError, runEvals, type RunOptions } from '../../src/eval/runner.js';
import { BudgetError } from '../../src/nebius/budget.js';
import { loadConfig } from '../../src/nebius/config.js';
import { loadDemoCase } from '../loadCase.js';

const dir = mkdtempSync(join(tmpdir(), 'osce-runner-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const c = loadDemoCase();
const config = { ...loadConfig({ NEBIUS_API_KEY: 'k' }), budgetFile: join(dir, 'budget.json'), dailyBudgetUsd: 5 };

function options(outDir: string, logs: string[]): RunOptions {
  return {
    fixturesDir: 'eval/fixtures',
    outDir,
    now: () => new Date('2026-09-22T10:00:00Z'),
    log: (t) => logs.push(t),
    models: { judge: config.judgeModel, patient: config.patientModel, grader: 'grader-model' },
  };
}

const args = (evals: EvalArgs['evals'], extra: Partial<EvalArgs> = {}): EvalArgs => ({
  evals,
  casePath: 'cases/demo-cough.json',
  offline: false,
  capUsd: 1,
  repeat: 1,
  labelsPath: null,
  setPath: null,
  judgeFilter: null,
  ...extra,
});

/** Answers every call with one JSON object that suits the judge, the grader and (as text) the patient. */
async function fakeFetch(): Promise<Response> {
  const content = '{"rubricItemIds": [], "selfDisclosure": false, "trustDelta": 0, "label": "unsure"}';
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 500, completion_tokens: 40 } }));
}

describe('runEvals', () => {
  it('runs all four evaluations offline, prints them under a warning and saves nothing', async () => {
    const logs: string[] = [];
    const out = join(dir, 'offline');
    const saved = await runEvals(args(['judge', 'safety', 'attack', 'honesty']), c, offlineEvalClients(), options(out, logs));
    expect(saved).toEqual([]);
    expect(existsSync(out)).toBe(false);
    expect(logs[0]).toContain('OFFLINE PLUMBING CHECK');
    const text = logs.join('\n');
    for (const heading of ['## Judge accuracy', '## Safety pause', '## Leak attacks', '## Patient honesty']) expect(text).toContain(heading);
  });

  it('saves Markdown and JSON per evaluation when online, with the models and cost of that evaluation', async () => {
    const logs: string[] = [];
    const out = join(dir, 'online');
    const clients = createEvalClients(config, 1, { fetchImpl: fakeFetch });
    const saved = await runEvals(args(['attack']), c, clients, options(out, logs));
    expect(saved).toEqual([join(out, 'demo-cough', 'attack.md'), join(out, 'demo-cough', 'attack.json')]);
    expect(readFileSync(saved[0]!, 'utf8')).toContain('not clinically reviewed');
    const json = JSON.parse(readFileSync(saved[1]!, 'utf8')) as Record<string, unknown>;
    expect(json).toMatchObject({ evaluation: 'attack', caseId: 'demo-cough', runAt: '2026-09-22T10:00:00.000Z', capUsd: 1 });
    expect((json.cost as { calls: number }).calls).toBeGreaterThan(0);
    // Models are named in the table and the file; the grader only where it graded.
    expect(readFileSync(saved[0]!, 'utf8')).toContain(`Judge: ${config.judgeModel}`);
    expect(json.models).toEqual({ judge: config.judgeModel, patient: config.patientModel });
  });

  it('checks every test set before the first model call, so a missing one costs nothing', async () => {
    let calls = 0;
    const counting = async () => {
      calls += 1;
      return fakeFetch();
    };
    const clients = createEvalClients(config, 1, { fetchImpl: counting });
    const opts = { ...options(join(dir, 'missing'), []), fixturesDir: join(dir, 'no-fixtures') };
    await expect(runEvals(args(['safety', 'attack']), c, clients, opts)).rejects.toBeInstanceOf(EvalSetupError);
    expect(calls).toBe(0);
  });

  it('refuses to start when a fixture is missing', async () => {
    const opts = { ...options(join(dir, 'x'), []), fixturesDir: join(dir, 'no-fixtures') };
    await expect(runEvals(args(['safety']), c, offlineEvalClients(), opts)).rejects.toBeInstanceOf(EvalSetupError);
  });

  it('refuses labels written for another case', async () => {
    const labels = join(dir, 'labels.json');
    writeFileSync(labels, JSON.stringify({ caseId: 'other', labelledBy: 'x', conversations: [{ id: 'a', turns: [{ student: 's', patient: 'p', items: [] }] }] }));
    const run = runEvals(args(['agreement'], { labelsPath: labels }), c, offlineEvalClients(), options(join(dir, 'y'), []));
    await expect(run).rejects.toThrow(/labels are for case other/);
  });

  it('passes a spending-cap stop up to the caller', async () => {
    const clients = createEvalClients(config, 0.0001, { fetchImpl: fakeFetch });
    await expect(runEvals(args(['safety']), c, clients, options(join(dir, 'z'), []))).rejects.toBeInstanceOf(BudgetError);
  });
});
