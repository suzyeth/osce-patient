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
// chars/4 can undercount (non-Latin text, chat-template tokens), so the pre-call estimate is padded.
const INPUT_SAFETY_FACTOR = 1.5;
const TEMPLATE_OVERHEAD_TOKENS = 50;

interface RawResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

/** billable: the server may have run (and charged for) a generation even though we got no answer. */
type Outcome =
  | { ok: true; body: RawResponse }
  | { ok: false; error: NebiusError; retryAfter: string | null; billable: boolean };

function isTimeout(e: unknown): boolean {
  const name = (e as Error).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

function backoffMs(tryNo: number, retryAfter: string | null): number {
  const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  return Math.min(500 * 2 ** tryNo, MAX_BACKOFF_MS);
}

/** A token count from the server, or undefined when it is missing or not a sensible number. */
function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

async function readBody(res: Response): Promise<Outcome> {
  try {
    return { ok: true, body: (await res.json()) as RawResponse };
  } catch (e) {
    // The generation has finished by now, so either way it was probably billed.
    const error = isTimeout(e)
      ? new NebiusError('the model did not answer in time', res.status, true)
      : new NebiusError('Token Factory returned a reply that is not JSON', res.status, false);
    return { ok: false, error, retryAfter: null, billable: true };
  }
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
    const message = isTimeout(e) ? 'the model did not answer in time' : 'network error reaching Token Factory';
    return { ok: false, error: new NebiusError(message, null, true), retryAfter: null, billable: true };
  }
  if (!res.ok) {
    const error = new NebiusError(`Token Factory returned HTTP ${res.status}`, res.status, RETRIABLE_STATUS.has(res.status));
    return { ok: false, error, retryAfter: res.headers.get('retry-after'), billable: res.status >= 500 };
  }
  return readBody(res);
}

/**
 * Retries timeouts, network errors, 408, 429 and 5xx with backoff; anything else fails at once.
 * An attempt that may have been billed is charged at the estimate, and the budget is checked
 * again before every retry, so retries cannot run past the cap.
 */
async function send(deps: ChatDeps, body: string, estimateUsd: number): Promise<RawResponse> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let tryNo = 0; ; tryNo += 1) {
    const outcome = await attemptOnce(deps, body);
    if (outcome.ok) return outcome.body;
    if (outcome.billable) deps.budget.record(estimateUsd);
    if (!outcome.error.retriable || tryNo >= deps.config.maxRetries) throw outcome.error;
    await sleep(backoffMs(tryNo, outcome.retryAfter));
    deps.budget.check(estimateUsd);
  }
}

function usageOf(request: ChatRequest, raw: RawResponse, estimatedInput: number, started: number): CallUsage {
  const inputTokens = tokenCount(raw.usage?.prompt_tokens) ?? estimatedInput;
  const outputTokens = tokenCount(raw.usage?.completion_tokens) ?? request.maxTokens;
  return {
    label: request.label,
    model: request.model,
    inputTokens,
    outputTokens,
    costUsd: costOf(request.model, inputTokens, outputTokens),
    latencyMs: Date.now() - started,
  };
}

/**
 * An OpenAI-compatible chat call with a budget check before it and usage accounting after it.
 * Reasoning fields in the reply are dropped on purpose: the judge's reasoning can mention hidden
 * facts, and nothing but the visible answer may reach the candidate or the logs.
 */
export function createChat(deps: ChatDeps): Chat {
  return async (request) => {
    const promptText = request.messages.map((m) => m.content).join('\n');
    const estimatedInput = Math.ceil(estimateTokens(promptText) * INPUT_SAFETY_FACTOR) + TEMPLATE_OVERHEAD_TOKENS;
    const estimateUsd = costOf(request.model, estimatedInput, request.maxTokens);
    deps.budget.check(estimateUsd);
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
    const raw = await send(deps, body, estimateUsd);
    const usage = usageOf(request, raw, estimatedInput, started);
    deps.onUsage(usage);
    // Throws BudgetError when the spend cannot be saved, which ends the session.
    deps.budget.record(usage.costUsd);
    const choice = raw.choices?.[0];
    return { content: choice?.message?.content ?? '', finishReason: choice?.finish_reason ?? 'unknown', usage };
  };
}
