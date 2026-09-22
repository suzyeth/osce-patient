import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEvalClients, JUDGE_SETTINGS, offlineEvalClients } from '../../src/eval/clients.js';
import { BudgetError } from '../../src/nebius/budget.js';
import { loadConfig, MODELS } from '../../src/nebius/config.js';
import { initialSessionState } from '../../src/state.js';
import { loadDemoCase } from '../loadCase.js';

const dir = mkdtempSync(join(tmpdir(), 'osce-evalclients-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const c = loadDemoCase();
const config = { ...loadConfig({ NEBIUS_API_KEY: 'k' }), budgetFile: join(dir, 'budget.json') };
const INPUT = { patientCase: c, state: initialSessionState(), studentInput: 'Do you smoke?', history: [] };

/** A server that answers every call with the same JSON verdict and records the model asked for. */
function fakeServer() {
  const models: string[] = [];
  const fetchImpl = async (_url: string, init: RequestInit) => {
    models.push((JSON.parse(String(init.body)) as { model: string }).model);
    const content = '{"rubricItemIds": ["smoking"], "selfDisclosure": false, "trustDelta": 0, "label": "unsure"}';
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 50 } }));
  };
  return { fetchImpl, models };
}

describe('createEvalClients', () => {
  it('routes each judge setting to its own model and logs every call in one usage log', async () => {
    const server = fakeServer();
    const clients = createEvalClients(config, 1, { fetchImpl: server.fetchImpl });
    for (const s of JUDGE_SETTINGS) await clients.judgeFor(s).evaluate(INPUT);
    await clients.grader.offCase({ patientCase: c, question: 'q', reply: 'r' });
    // The grader is Ultra, a different model from the default patient (Super).
    expect(server.models).toEqual([...JUDGE_SETTINGS.map((s) => s.model), MODELS.ultra]);
    expect(clients.usage().map((u) => u.label)).toEqual([...JUDGE_SETTINGS.map(() => 'judge'), 'grader']);
    expect(clients.spentUsd()).toBeCloseTo(clients.usage().reduce((s, u) => s + u.costUsd, 0), 12);
  });

  it('counts a timed-out attempt in what was spent, though it has no usage record', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    let calls = 0;
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls += 1;
      if (calls === 1) throw timeout;
      return fakeServer().fetchImpl(url, init);
    };
    const clients = createEvalClients({ ...config, maxRetries: 1 }, 1, { fetchImpl, sleep: async () => {} });
    await clients.judge.evaluate(INPUT);
    const logged = clients.usage().reduce((s, u) => s + u.costUsd, 0);
    expect(clients.usage()).toHaveLength(1);
    expect(clients.spentUsd()).toBeGreaterThan(logged);
  });

  it('stops the whole run at its own cap', async () => {
    const server = fakeServer();
    // An Ultra judge call is estimated at about a third of a cent (800 output tokens at $3 per million), so a $0.002 cap refuses it.
    const clients = createEvalClients(config, 0.002, { fetchImpl: server.fetchImpl });
    const ultra = JUDGE_SETTINGS.find((s) => s.model === MODELS.ultra)!;
    await expect(clients.judgeFor(ultra).evaluate(INPUT)).rejects.toBeInstanceOf(BudgetError);
    expect(server.models).toEqual([]);
  });
});

describe('offlineEvalClients', () => {
  it('costs nothing and says it is offline', async () => {
    const clients = offlineEvalClients();
    expect(clients.online).toBe(false);
    expect((await clients.judgeFor(JUDGE_SETTINGS[0]!).evaluate(INPUT)).rubricItemIds).toEqual(['smoking']);
    expect(clients.usage()).toEqual([]);
    expect(clients.spentUsd()).toBe(0);
  });
});
