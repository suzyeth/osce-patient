import type { JudgeVerdict, PatientCase, SessionState } from './types.js';

export interface ConversationTurn {
  student: string;
  patient: string;
}

export interface JudgeInput {
  patientCase: PatientCase;
  state: SessionState;
  studentInput: string;
  history: ConversationTurn[];
}

export interface JudgeClient {
  evaluate(input: JudgeInput): Promise<JudgeVerdict>;
}

export interface PatientInput {
  /** Built by buildPatientContext: persona plus shareable facts only. */
  context: string;
  studentInput: string;
  history: ConversationTurn[];
  /** Facts the student reached this turn: newly unlocked ones, plus shareable facts they asked about again. */
  relevantFacts: string[];
}

export interface PatientClient {
  respond(input: PatientInput): Promise<string>;
}

export interface UsageReport {
  label: 'judge' | 'patient';
  input: number;
  output: number;
}

export type UsageSink = (u: UsageReport) => void;
