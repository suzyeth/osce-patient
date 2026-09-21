import { describe, it, expect } from 'vitest';
import { createChat, NebiusError, type ChatRequest, type FetchLike } from '../../src/nebius/chat.js';
import { BudgetError, type Budget } from '../../src/nebius/budget.js';
import { MODELS } from '../../src/nebius/config.js';
import type { CallUsage } from '../../src/nebius/usage.js';

const KEY = 'test-key-xyz';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

const OK_BODY = {
  choices: [{ message: { content: 'Hello', reasoning: 'secret thoughts about hidden facts' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
};

/** A budget that never refuses and counts what happens to it. */
function countingBudget(refuseOnCheck = Number.POSITIVE_INFINITY) {
  const log = { checks: 0, records: [] as number[] };
  const budget: Budget = {
    check() {
      log.checks += 1;
      if (log.checks >= refuseOnCheck) throw new BudgetError('this session has reached its $0.05 cap');
    },
    record(cost) {
      log.records.push(cost);
    },
    sessionSpentUsd: () => log.records.reduce((a, b) => a + b, 0),
    daySpentUsd: () => log.records.reduce((a, b) => a + b, 0),
  };
  return { budget, log };
}

const REQUEST: ChatRequest = {
  label: 'patient',
  model: MODELS.super,
  messages: [{ role: 'user', content: 'Do you smoke?' }],
  maxTokens: 50,
  temperature: 0.7,
};

function setup(responses: Array<Response | Error>, budget: Budget = countingBudget().budget) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const waits: number[] = [];
  const usages: CallUsage[] = [];
  const queue = [...responses];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next === undefined) throw new Error('test ran out of responses');
    if (next instanceof Error) throw next;
    return next;
  };
  const chat = createChat({
    config: { apiKey: KEY, baseUrl: 'https://api.example/v1', timeoutMs: 1000, maxRetries: 2 },
    budget,
    onUsage: (u) => usages.push(u),
    fetchImpl,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  return { chat, calls, waits, usages };
}

const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, unknown>;
const timeoutError = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' });

describe('createChat', () => {
  it('sends an OpenAI-compatible request and returns only the visible content', async () => {
    const { chat, calls } = setup([jsonResponse(OK_BODY)]);
    const result = await chat(REQUEST);
    expect(calls[0]!.url).toBe('https://api.example/v1/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(bodyOf(calls[0]!.init)).toMatchObject({ model: MODELS.super, max_tokens: 50, temperature: 0.7 });
    expect(bodyOf(calls[0]!.init).response_format).toBeUndefined();
    expect(bodyOf(calls[0]!.init).chat_template_kwargs).toBeUndefined();
    expect(result.content).toBe('Hello');
    expect(result.finishReason).toBe('stop');
    expect(JSON.stringify(result)).not.toContain('secret thoughts');
  });

  it('asks for a JSON object when requested', async () => {
    const { chat, calls } = setup([jsonResponse(OK_BODY)]);
    await chat({ ...REQUEST, json: true });
    expect(bodyOf(calls[0]!.init).response_format).toEqual({ type: 'json_object' });
  });

  it('turns reasoning off through the chat template when asked', async () => {
    const { chat, calls } = setup([jsonResponse(OK_BODY)]);
    await chat({ ...REQUEST, thinking: false });
    expect(bodyOf(calls[0]!.init).chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('records usage and cost from the response', async () => {
    const { budget, log } = countingBudget();
    const { chat, usages } = setup([jsonResponse(OK_BODY)], budget);
    await chat(REQUEST);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ label: 'patient', inputTokens: 100, outputTokens: 20 });
    expect(usages[0]!.costUsd).toBeCloseTo((100 * 0.3 + 20 * 0.9) / 1_000_000, 12);
    expect(log.records).toEqual([usages[0]!.costUsd]);
  });

  it('ignores nonsense usage numbers from the server', async () => {
    const body = { ...OK_BODY, usage: { prompt_tokens: -5, completion_tokens: 'lots' } };
    const { chat, usages } = setup([jsonResponse(body)]);
    await chat(REQUEST);
    expect(usages[0]!.inputTokens).toBeGreaterThan(0);
    expect(usages[0]!.outputTokens).toBe(REQUEST.maxTokens);
    expect(Number.isFinite(usages[0]!.costUsd)).toBe(true);
  });

  it('retries a rate limit, honouring Retry-After, without charging for it', async () => {
    const { budget, log } = countingBudget();
    const { chat, calls, waits } = setup([jsonResponse({}, 429, { 'retry-after': '2' }), jsonResponse(OK_BODY)], budget);
    const result = await chat(REQUEST);
    expect(result.content).toBe('Hello');
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([2000]);
    expect(log.records).toHaveLength(1);
  });

  it('charges the estimate for timed-out attempts and checks the budget before each retry', async () => {
    const { budget, log } = countingBudget();
    const { chat, calls } = setup([timeoutError(), timeoutError(), timeoutError()], budget);
    await expect(chat(REQUEST)).rejects.toThrow('the model did not answer in time');
    expect(calls).toHaveLength(3);
    expect(log.records).toHaveLength(3);
    expect(log.records.every((cost) => cost > 0)).toBe(true);
    expect(log.checks).toBe(3);
  });

  it('stops retrying when the budget runs out between attempts', async () => {
    const { budget } = countingBudget(2);
    const { chat, calls } = setup([timeoutError(), jsonResponse(OK_BODY)], budget);
    await expect(chat(REQUEST)).rejects.toBeInstanceOf(BudgetError);
    expect(calls).toHaveLength(1);
  });

  it('does not retry or charge a client error, and never puts the key in the error', async () => {
    const { budget, log } = countingBudget();
    const { chat, calls } = setup([jsonResponse({ error: 'bad request' }, 400)], budget);
    const error = await chat(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NebiusError);
    expect((error as NebiusError).status).toBe(400);
    expect(String(error)).not.toContain(KEY);
    expect(calls).toHaveLength(1);
    expect(log.records).toHaveLength(0);
  });

  it('refuses before calling when the budget is exhausted', async () => {
    const { budget } = countingBudget(1);
    const { chat, calls } = setup([jsonResponse(OK_BODY)], budget);
    await expect(chat(REQUEST)).rejects.toBeInstanceOf(BudgetError);
    expect(calls).toHaveLength(0);
  });
});
