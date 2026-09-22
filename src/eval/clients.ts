import type { JudgeClient, PatientClient } from '../llm.js';
import { offlineJudge, offlinePatient } from '../offline.js';
import { createBudget } from '../nebius/budget.js';
import { createChat } from '../nebius/chat.js';
import { MODELS, type NebiusConfig } from '../nebius/config.js';
import { createNemotronJudge } from '../nebius/judgeClient.js';
import { createNemotronPatient } from '../nebius/patientClient.js';
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
  { name: 'Super, reasoning off', model: MODELS.super, thinking: false, maxTokens: 800 },
  { name: 'Super, reasoning on', model: MODELS.super, thinking: true, maxTokens: 2000 },
  { name: 'Ultra, reasoning off', model: MODELS.ultra, thinking: false, maxTokens: 800 },
];

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
  return {
    online: true,
    judge: createNemotronJudge(chat, { model: config.judgeModel, maxTokens: config.judgeMaxTokens, thinking: config.judgeThinking }),
    patient: createNemotronPatient(chat, { model: config.patientModel, maxTokens: config.patientMaxTokens, thinking: config.patientThinking }),
    grader: createNemotronGrader(chat, GRADER_OPTIONS),
    judgeFor,
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
    usage: () => [],
    spentUsd: () => 0,
  };
}
