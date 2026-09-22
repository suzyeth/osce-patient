import { z, ZodError } from 'zod';

/** Token Factory model ids, checked against the catalogue on 2026-09-20. */
export const MODELS = {
  nano: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  lightning: 'nvidia/Nemotron-3_5-Lightning',
  super: 'nvidia/nemotron-3-super-120b-a12b',
  ultra: 'nvidia/Nemotron-3-Ultra-550b-a55b',
} as const;

export interface Price {
  /** US dollars per million input tokens. */
  input: number;
  /** US dollars per million output tokens; reasoning tokens are billed as output. */
  output: number;
}

/** Catalogue prices on 2026-09-20. */
export const PRICES: Readonly<Record<string, Price>> = {
  [MODELS.nano]: { input: 0.06, output: 0.24 },
  [MODELS.lightning]: { input: 0.06, output: 0.24 },
  [MODELS.super]: { input: 0.3, output: 0.9 },
  [MODELS.ultra]: { input: 1, output: 3 },
};

/** An unknown model is priced at the most expensive rate, so the budget errs on the safe side. */
export const FALLBACK_PRICE: Price = { input: 1, output: 3 };

const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'NEBIUS_API_KEY is missing: put it in .env'),
  // The bearer key goes to this address, so it must be encrypted in transit.
  baseUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), 'NEBIUS_BASE_URL must use https'),
  judgeModel: z.string().min(1),
  patientModel: z.string().min(1),
  safetyModel: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  maxRetries: z.number().int().min(0).max(5),
  judgeMaxTokens: z.number().int().positive(),
  patientMaxTokens: z.number().int().positive(),
  safetyMaxTokens: z.number().int().positive(),
  judgeThinking: z.boolean(),
  patientThinking: z.boolean(),
  safetyThinking: z.boolean(),
  sessionBudgetUsd: z.number().positive(),
  dailyBudgetUsd: z.number().positive(),
  budgetFile: z.string().min(1),
});

export type NebiusConfig = z.infer<typeof ConfigSchema>;

const DEFAULTS = {
  baseUrl: 'https://api.tokenfactory.nebius.com/v1',
  // Chosen on the 50-line judge evaluation of 2026-09-22 (eval/results/demo-cough/judge.md).
  // False unlocks, where an off-topic or injection line unlocks a fact, decided it: Lightning 33%,
  // Nano 7%, Super 0%, Ultra 0%. Super (reasoning off) is 90% exact at 1.1 s and about half a cent
  // per station; Lightning was faster and much looser, Ultra four times the price for +6% exact.
  judgeModel: MODELS.super,
  patientModel: MODELS.super,
  // The self-disclosure check runs beside the judge; the setting is chosen on the safety
  // evaluation (eval/results/<case>/safety.md). It answers with one short JSON object, so 200 tokens is plenty.
  safetyModel: MODELS.super,
  timeoutMs: 30_000,
  maxRetries: 2,
  // Reasoning tokens count as output, so leave headroom beyond the visible answer.
  judgeMaxTokens: 800,
  safetyMaxTokens: 200,
  patientMaxTokens: 400,
  // Reasoning off by default: with it on, a judge call took 4 to 6 seconds and could run out of tokens.
  judgeThinking: false,
  safetyThinking: false,
  patientThinking: false,
  sessionBudgetUsd: 0.05,
  dailyBudgetUsd: 0.5,
  budgetFile: '.osce-budget.json',
} as const;

function num(value: string | undefined, fallback: number): number {
  return value === undefined || value.trim() === '' ? fallback : Number(value);
}

/** "on" or "off"; anything else is rejected by the schema as a non-boolean. */
function flag(value: string | undefined, fallback: boolean): boolean | string {
  if (value === undefined || value.trim() === '') return fallback;
  const v = value.trim().toLowerCase();
  return v === 'on' ? true : v === 'off' ? false : value;
}

/** Reads settings from the environment. Error messages never contain the key. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): NebiusConfig {
  return ConfigSchema.parse({
    apiKey: env.NEBIUS_API_KEY ?? '',
    baseUrl: env.NEBIUS_BASE_URL || DEFAULTS.baseUrl,
    judgeModel: env.OSCE_JUDGE_MODEL || DEFAULTS.judgeModel,
    patientModel: env.OSCE_PATIENT_MODEL || DEFAULTS.patientModel,
    safetyModel: env.OSCE_SAFETY_MODEL || DEFAULTS.safetyModel,
    timeoutMs: num(env.OSCE_TIMEOUT_MS, DEFAULTS.timeoutMs),
    maxRetries: num(env.OSCE_MAX_RETRIES, DEFAULTS.maxRetries),
    judgeMaxTokens: num(env.OSCE_JUDGE_MAX_TOKENS, DEFAULTS.judgeMaxTokens),
    patientMaxTokens: num(env.OSCE_PATIENT_MAX_TOKENS, DEFAULTS.patientMaxTokens),
    safetyMaxTokens: num(env.OSCE_SAFETY_MAX_TOKENS, DEFAULTS.safetyMaxTokens),
    judgeThinking: flag(env.OSCE_JUDGE_THINKING, DEFAULTS.judgeThinking),
    patientThinking: flag(env.OSCE_PATIENT_THINKING, DEFAULTS.patientThinking),
    safetyThinking: flag(env.OSCE_SAFETY_THINKING, DEFAULTS.safetyThinking),
    sessionBudgetUsd: num(env.OSCE_SESSION_BUDGET_USD, DEFAULTS.sessionBudgetUsd),
    dailyBudgetUsd: num(env.OSCE_DAILY_BUDGET_USD, DEFAULTS.dailyBudgetUsd),
    budgetFile: env.OSCE_BUDGET_FILE || DEFAULTS.budgetFile,
  });
}

/** One readable line for a settings problem; zod's own message is multi-line JSON. */
export function describeConfigError(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  return e instanceof Error ? (e.message.split('\n')[0] ?? 'unknown error') : 'unknown error';
}

/** Loads .env into process.env when it exists; a missing file is fine. */
export function loadDotEnv(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

export function priceOf(model: string): Price {
  return PRICES[model] ?? FALLBACK_PRICE;
}
