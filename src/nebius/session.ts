import type { JudgeClient, PatientClient } from '../llm.js';
import type { NebiusConfig } from './config.js';
import { createBudget, type Budget } from './budget.js';
import { createChat, type FetchLike } from './chat.js';
import { createNemotronJudge } from './judgeClient.js';
import { createNemotronPatient } from './patientClient.js';
import { createNemotronSafety, type SafetyClient } from './safetyClient.js';
import { summarise, type CallUsage, type UsageSummary } from './usage.js';

export interface NemotronSession {
  judge: JudgeClient;
  patient: PatientClient;
  /** The self-disclosure check, asked beside the judge on every turn. */
  safety: SafetyClient;
  budget: Budget;
  usage(): readonly CallUsage[];
  summary(): UsageSummary;
}

export interface SessionDeps {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/** One practice session's clients, sharing one budget and one usage log. */
export function createNemotronSession(config: NebiusConfig, deps: SessionDeps = {}): NemotronSession {
  const budget = createBudget(config, deps.now);
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
  return {
    judge: createNemotronJudge(chat, {
      model: config.judgeModel,
      maxTokens: config.judgeMaxTokens,
      thinking: config.judgeThinking,
    }),
    patient: createNemotronPatient(chat, {
      model: config.patientModel,
      maxTokens: config.patientMaxTokens,
      thinking: config.patientThinking,
    }),
    safety: createNemotronSafety(chat, {
      model: config.safetyModel,
      maxTokens: config.safetyMaxTokens,
      thinking: config.safetyThinking,
    }),
    budget,
    usage: () => usages,
    summary: () => summarise(usages),
  };
}
