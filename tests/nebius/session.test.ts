import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNemotronSession } from '../../src/nebius/session.js';
import { loadConfig, MODELS } from '../../src/nebius/config.js';
import type { FetchLike } from '../../src/nebius/chat.js';
import { runTurn } from '../../src/orchestrator.js';
import { initialSessionState } from '../../src/state.js';
import { loadDemoCase } from '../loadCase.js';

const dir = mkdtempSync(join(tmpdir(), 'osce-session-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const c = loadDemoCase();

function reply(content: string, prompt = 200, completion = 40): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: completion } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Answers as the judge when the request asks for JSON (only the judge does), otherwise as the patient. */
const fakeTokenFactory: FetchLike = async (_url, init) => {
  const body = JSON.parse(String(init.body)) as { response_format?: unknown };
  if (body.response_format !== undefined) {
    return reply('{"rubricItemIds": ["smoking"], "questionStyle": "closed", "selfDisclosure": false, "trustDelta": 2}');
  }
  return reply('About twenty a day, since I was eighteen.');
};

describe('createNemotronSession', () => {
  it('runs a turn through both clients and accounts for its cost', async () => {
    const config = loadConfig({ NEBIUS_API_KEY: 'test-key', OSCE_BUDGET_FILE: join(dir, 'budget.json') });
    const session = createNemotronSession(config, { fetchImpl: fakeTokenFactory, sleep: async () => {} });
    const r = await runTurn(c, initialSessionState(), 'Do you smoke?', session.judge, session.patient);
    expect(r.newlyUnlocked).toEqual(['f_smoking']);
    expect(r.reply).toBe('About twenty a day, since I was eighteen.');
    const s = session.summary();
    expect(s.calls).toBe(2);
    expect(session.usage().map((u) => u.label)).toEqual(['judge', 'patient']);
    expect(session.usage().map((u) => u.model)).toEqual([MODELS.lightning, MODELS.super]);
    expect(s.costUsd).toBeGreaterThan(0);
    expect(session.budget.daySpentUsd()).toBeCloseTo(s.costUsd, 12);
  });
});
