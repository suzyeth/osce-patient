import type { JudgeClient, PatientClient } from '../llm.js';
import { offlineJudge, offlinePatient } from '../offline.js';
import { createBudget } from '../nebius/budget.js';
import { createChat } from '../nebius/chat.js';
import { MODELS, type NebiusConfig } from '../nebius/config.js';
import { createNemotronJudge } from '../nebius/judgeClient.js';
import { createNemotronPatient } from '../nebius/patientClient.js';
import { createNemotronSafety, type SafetyClient } from '../nebius/safetyClient.js';
import type { SessionDeps } from '../nebius/session.js';
import type { CallUsage } from '../nebius/usage.js';
import { createNemotronGrader, offlineGrader, type Grader } from './grader.js';

export interface JudgeSetting {
  name: string;
  model: string;
  thinking: boolean;
  maxTokens: number;
}

/** The judge settings compared in the model table. Reasoning needs room: its tokens count as output. */
export const JUDGE_SETTINGS: readonly JudgeSetting[] = [
  { name: 'Nano, reasoning off', model: MODELS.nano, thinking: false, maxTokens: 800 },
  { name: 'Lightning, reasoning off', model: MODELS.lightning, thinking: false, maxTokens: 800 },
  { name: 'Super, reasoning off (default)', model: MODELS.super, thinking: false, maxTokens: 800 },
  { name: 'Super, reasoning on', model: MODELS.super, thinking: true, maxTokens: 2000 },
  { name: 'Ultra, reasoning off', model: MODELS.ultra, thinking: false, maxTokens: 800 },
];

/**
 * The self-disclosure checks compared in the safety evaluation. The check answers with one short
 * JSON object, so 200 tokens is plenty and reasoning is not worth its seconds on every turn.
 */
export const SAFETY_SETTINGS: readonly JudgeSetting[] = [
  { name: 'Nano, reasoning off', model: MODELS.nano, thinking: false, maxTokens: 200 },
  { name: 'Lightning, reasoning off', model: MODELS.lightning, thinking: false, maxTokens: 200 },
  { name: 'Super, reasoning off', model: MODELS.super, thinking: false, maxTokens: 200 },
];

/** Never flags: offline runs have no safety model, and the rule list is reported on its own row. */
function offlineSafety(): SafetyClient {
  return {
    async check() {
      return { selfDisclosure: false, category: 'none' };
    },
  };
}

/**
 * The grader runs only in evaluations. It is Ultra, not Super, so the patient model (Super by
 * default) is never grading its own replies.
 */
export const GRADER_OPTIONS = { model: MODELS.ultra, thinking: false, maxTokens: 800 } as const;

export interface EvalClients {
  online: boolean;
  /** The judge and patient a real session uses (config defaults). */
  judge: JudgeClient;
  patient: PatientClient;
  grader: Grader;
  judgeFor(setting: JudgeSetting): JudgeClient;
  safetyFor(setting: JudgeSetting): SafetyClient;
  /** The safety setting a real session would use, when one of SAFETY_SETTINGS matches the config. */
  configuredSafety: string | null;
  usage(): readonly CallUsage[];
  /** What the budget has charged this run, including estimates for failed attempts that may have been billed. */
  spentUsd(): number;
}

/**
 * Every model call in one evaluation run goes through one chat and one budget: the run's cap is
 * the session cap, and the daily cap in the ledger still applies on top of it.
 */
export function createEvalClients(config: NebiusConfig, capUsd: number, deps: SessionDeps = {}): EvalClients {
  const budget = createBudget({ ...config, sessionBudgetUsd: capUsd }, deps.now);
  let usages: readonly CallUsage[] = [];
  const chat = createChat({
    config,
    budget,
    onUsage: (u) => {
      usages = [...usages, u];
    },
    fetchImpl: deps.fetchImpl,
    sleep: deps.sleep,
  });
  const judgeFor = (s: JudgeSetting) => createNemotronJudge(chat, { model: s.model, maxTokens: s.maxTokens, thinking: s.thinking });
  const safetyFor = (s: JudgeSetting) => createNemotronSafety(chat, { model: s.model, maxTokens: s.maxTokens, thinking: s.thinking });
  const configured = SAFETY_SETTINGS.find((s) => s.model === config.safetyModel && s.thinking === config.safetyThinking);
  return {
    online: true,
    judge: createNemotronJudge(chat, { model: config.judgeModel, maxTokens: config.judgeMaxTokens, thinking: config.judgeThinking }),
    patient: createNemotronPatient(chat, { model: config.patientModel, maxTokens: config.patientMaxTokens, thinking: config.patientThinking }),
    grader: createNemotronGrader(chat, GRADER_OPTIONS),
    judgeFor,
    safetyFor,
    configuredSafety: configured?.name ?? null,
    usage: () => usages,
    spentUsd: () => budget.sessionSpentUsd(),
  };
}

/** Free doubles for checking the plumbing. Their numbers mean nothing and are never saved. */
export function offlineEvalClients(): EvalClients {
  return {
    online: false,
    judge: offlineJudge(),
    patient: offlinePatient(),
    grader: offlineGrader(),
    judgeFor: () => offlineJudge(),
    safetyFor: () => offlineSafety(),
    configuredSafety: null,
    usage: () => [],
    spentUsd: () => 0,
  };
}
