import type { NebiusConfig } from './config.js';
import type { Budget } from './budget.js';
import { costOf, estimateTokens, type CallUsage } from './usage.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  label: 'judge' | 'patient';
  model: string;
  messages: readonly ChatMessage[];
  maxTokens: number;
  temperature: number;
  /** Ask the server for a JSON object (OpenAI-compatible response_format). */
  json?: boolean;
  /** false turns reasoning off through the Nemotron chat template; leave it out for the model default. */
  thinking?: boolean;
}

/** Which model a client uses and how. */
export interface ModelOptions {
  model: string;
  maxTokens: number;
  thinking: boolean;
}

export interface ChatResult {
  content: string;
  finishReason: string;
  usage: CallUsage;
}

export type Chat = (request: ChatRequest) => Promise<ChatResult>;

export class NebiusError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = 'NebiusError';
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ChatDeps {
  config: Pick<NebiusConfig, 'apiKey' | 'baseUrl' | 'timeoutMs' | 'maxRetries'>;
  budget: Budget;
  onUsage: (usage: CallUsage) => void;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_BACKOFF_MS = 10_000;

interface RawResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type Outcome = { ok: true; body: RawResponse } | { ok: false; error: NebiusError; retryAfter: string | null };

function backoffMs(tryNo: number, retryAfter: string | null): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  return Math.min(500 * 2 ** tryNo, MAX_BACKOFF_MS);
}

/** One HTTP attempt. The key only ever goes into the Authorization header, never into a message. */
async function attemptOnce(deps: ChatDeps, body: string): Promise<Outcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${deps.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.config.apiKey}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(deps.config.timeoutMs),
    });
  } catch (e) {
    const name = (e as Error).name;
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    const message = timedOut ? 'the model did not answer in time' : 'network error reaching Token Factory';
    return { ok: false, error: new NebiusError(message, null, true), retryAfter: null };
  }
  if (!res.ok) {
    const error = new NebiusError(`Token Factory returned HTTP ${res.status}`, res.status, RETRIABLE_STATUS.has(res.status));
    return { ok: false, error, retryAfter: res.headers.get('retry-after') };
  }
  try {
    return { ok: true, body: (await res.json()) as RawResponse };
  } catch {
    return { ok: false, error: new NebiusError('Token Factory returned a reply that is not JSON', res.status, false), retryAfter: null };
  }
}

/** Retries timeouts, network errors, 408, 429 and 5xx with backoff; anything else fails at once. */
async function send(deps: ChatDeps, body: string): Promise<RawResponse> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let tryNo = 0; ; tryNo += 1) {
    const outcome = await attemptOnce(deps, body);
    if (outcome.ok) return outcome.body;
    if (!outcome.error.retriable || tryNo >= deps.config.maxRetries) throw outcome.error;
    await sleep(backoffMs(tryNo, outcome.retryAfter));
  }
}

/**
 * An OpenAI-compatible chat call with a budget check before it and usage accounting after it.
 * Reasoning fields in the reply are dropped on purpose: the judge's reasoning can mention hidden
 * facts, and nothing but the visible answer may reach the candidate or the logs.
 */
export function createChat(deps: ChatDeps): Chat {
  return async (request) => {
    const promptText = request.messages.map((m) => m.content).join('\n');
    deps.budget.check(costOf(request.model, estimateTokens(promptText), request.maxTokens));
    const started = Date.now();
    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      ...(request.json ? { response_format: { type: 'json_object' } } : {}),
      // Reasoning tokens are billed as output and add seconds per call; the timed station needs speed.
      ...(request.thinking === false ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    });
    const raw = await send(deps, body);
    const inputTokens = raw.usage?.prompt_tokens ?? estimateTokens(promptText);
    const outputTokens = raw.usage?.completion_tokens ?? request.maxTokens;
    const usage: CallUsage = {
      label: request.label,
      model: request.model,
      inputTokens,
      outputTokens,
      costUsd: costOf(request.model, inputTokens, outputTokens),
      latencyMs: Date.now() - started,
    };
    deps.budget.record(usage.costUsd);
    deps.onUsage(usage);
    const choice = raw.choices?.[0];
    return { content: choice?.message?.content ?? '', finishReason: choice?.finish_reason ?? 'unknown', usage };
  };
}
