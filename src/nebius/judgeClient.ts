import { ZodError } from 'zod';
import { JudgeVerdictSchema, type JudgeVerdict } from '../types.js';
import type { JudgeClient, JudgeInput } from '../llm.js';
import type { Chat, ChatMessage, ModelOptions } from './chat.js';
import { buildJudgeMessages } from './judgePrompt.js';

/** A single question rarely covers more than a few items; more is treated as a manipulated verdict. */
export const MAX_ITEMS_PER_TURN = 4;

export class JudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JudgeError';
  }
}

function describe(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  return e instanceof Error ? (e.message.split('\n')[0] ?? 'unknown error') : 'unknown error';
}

/** Pulls the first JSON object out of a reply, tolerating code fences or stray text around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new JudgeError('the judge did not return a JSON object');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new JudgeError('the judge returned malformed JSON');
  }
}

/**
 * Fills fields that do not affect scoring when the model leaves them out, keeps only rubric ids
 * that exist in the case, and caps them per turn. rubricItemIds, selfDisclosure and trustDelta
 * must be present, or the verdict is rejected. The judge never sees fact ids, so any it returns
 * are invented or injected and are dropped.
 */
export function coerceVerdict(raw: unknown, knownRubricIds: readonly string[]): JudgeVerdict {
  const obj = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rubricItemIds = Array.isArray(obj.rubricItemIds)
    ? obj.rubricItemIds
        .filter((id): id is string => typeof id === 'string' && knownRubricIds.includes(id))
        .slice(0, MAX_ITEMS_PER_TURN)
    : undefined;
  return JudgeVerdictSchema.parse({
    questionStyle: 'none',
    empathy: false,
    interrupted: false,
    jargon: false,
    reasoning: '',
    ...obj,
    rubricItemIds,
    requestedFactIds: [],
  });
}

function repairMessages(messages: readonly ChatMessage[], reply: string, problem: string): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: reply },
    { role: 'user', content: `That reply could not be used (${problem}). Reply again with only the JSON object in the required shape.` },
  ];
}

export function createNemotronJudge(chat: Chat, options: ModelOptions): JudgeClient {
  const { model, maxTokens, thinking } = options;
  return {
    async evaluate(input: JudgeInput): Promise<JudgeVerdict> {
      const messages = buildJudgeMessages(input);
      const known = input.patientCase.rubric.map((r) => r.id);
      const first = await chat({ label: 'judge', model, messages, maxTokens, temperature: 0, json: true, thinking });
      try {
        return coerceVerdict(extractJson(first.content), known);
      } catch (e) {
        // One repair attempt. If the first reply ran out of tokens (reasoning counts), allow twice as many.
        const retryTokens = first.finishReason === 'length' ? maxTokens * 2 : maxTokens;
        const second = await chat({
          label: 'judge',
          model,
          messages: repairMessages(messages, first.content, describe(e)),
          maxTokens: retryTokens,
          temperature: 0,
          json: true,
          thinking,
        });
        try {
          return coerceVerdict(extractJson(second.content), known);
        } catch (e2) {
          throw new JudgeError(`the judge gave an unusable verdict twice: ${describe(e2)}`);
        }
      }
    },
  };
}
