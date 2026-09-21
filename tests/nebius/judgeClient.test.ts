import { describe, it, expect } from 'vitest';
import { createNemotronJudge, JudgeError, MAX_ITEMS_PER_TURN } from '../../src/nebius/judgeClient.js';
import type { Chat, ChatRequest } from '../../src/nebius/chat.js';
import { MODELS } from '../../src/nebius/config.js';
import { initialSessionState } from '../../src/state.js';
import { loadDemoCase } from '../loadCase.js';

const c = loadDemoCase();
const INPUT = { patientCase: c, state: initialSessionState(), studentInput: 'Do you smoke?', history: [] };

function fakeChat(replies: Array<{ content: string; finishReason?: string }>) {
  const requests: ChatRequest[] = [];
  const chat: Chat = async (request) => {
    requests.push(request);
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)]!;
    return {
      content: reply.content,
      finishReason: reply.finishReason ?? 'stop',
      usage: { label: request.label, model: request.model, inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 0 },
    };
  };
  return { chat, requests };
}

const GOOD = '{"rubricItemIds": ["smoking"], "selfDisclosure": false, "trustDelta": 3}';
const judgeWith = (chat: Chat) => createNemotronJudge(chat, { model: MODELS.nano, maxTokens: 800, thinking: false });

describe('createNemotronJudge', () => {
  it('turns a clean reply into a verdict and fills the optional fields', async () => {
    const { chat, requests } = fakeChat([{ content: GOOD }]);
    const v = await judgeWith(chat).evaluate(INPUT);
    expect(v).toMatchObject({
      rubricItemIds: ['smoking'],
      requestedFactIds: [],
      questionStyle: 'none',
      empathy: false,
      selfDisclosure: false,
      trustDelta: 3,
    });
    expect(requests[0]).toMatchObject({
      label: 'judge',
      model: MODELS.nano,
      temperature: 0,
      json: true,
      maxTokens: 800,
      thinking: false,
    });
  });

  it('tolerates code fences around the JSON', async () => {
    const { chat } = fakeChat([{ content: '```json\n' + GOOD + '\n```' }]);
    expect((await judgeWith(chat).evaluate(INPUT)).rubricItemIds).toEqual(['smoking']);
  });

  it('drops rubric ids that are not in the case and keeps at most four', async () => {
    const ids = ['smoking', 'made_up', 'intro_consent', 'open_question', 'onset_duration', 'closing'];
    const { chat } = fakeChat([{ content: JSON.stringify({ rubricItemIds: ids, selfDisclosure: false, trustDelta: 0 }) }]);
    const v = await judgeWith(chat).evaluate(INPUT);
    expect(v.rubricItemIds).toEqual(['smoking', 'intro_consent', 'open_question', 'onset_duration']);
    expect(v.rubricItemIds).toHaveLength(MAX_ITEMS_PER_TURN);
  });

  it('ignores fact ids the model makes up, because it never sees any', async () => {
    const reply = JSON.stringify({ rubricItemIds: [], requestedFactIds: ['f_blood'], selfDisclosure: false, trustDelta: 0 });
    const { chat } = fakeChat([{ content: reply }]);
    expect((await judgeWith(chat).evaluate(INPUT)).requestedFactIds).toEqual([]);
  });

  it('repairs once after an unusable reply', async () => {
    const { chat, requests } = fakeChat([{ content: 'not json at all' }, { content: GOOD }]);
    const v = await judgeWith(chat).evaluate(INPUT);
    expect(v.rubricItemIds).toEqual(['smoking']);
    expect(requests).toHaveLength(2);
    const repair = requests[1]!.messages;
    expect(repair.at(-2)).toEqual({ role: 'assistant', content: 'not json at all' });
    expect(repair.at(-1)!.content).toContain('could not be used');
  });

  it('doubles the token allowance when the first reply ran out of tokens', async () => {
    const { chat, requests } = fakeChat([{ content: '', finishReason: 'length' }, { content: GOOD }]);
    await judgeWith(chat).evaluate(INPUT);
    expect(requests[1]!.maxTokens).toBe(requests[0]!.maxTokens * 2);
    expect(requests[1]!.thinking).toBe(false);
  });

  it('gives up with a JudgeError after two unusable replies', async () => {
    const { chat } = fakeChat([{ content: 'nope' }, { content: 'still nope' }]);
    await expect(judgeWith(chat).evaluate(INPUT)).rejects.toBeInstanceOf(JudgeError);
  });

  it('rejects a verdict without the fields that drive safety and trust', async () => {
    const { chat } = fakeChat([{ content: '{"rubricItemIds": []}' }]);
    await expect(judgeWith(chat).evaluate(INPUT)).rejects.toThrow(/selfDisclosure|trustDelta/);
  });
});
