import type { ConversationTurn, JudgeClient, PatientClient } from './llm.js';
import type { JudgeVerdict, PatientCase } from './types.js';
import { appendTurn, runTurn } from './orchestrator.js';
import { initialSessionState } from './state.js';
import { computeReport } from './report.js';

/**
 * A station played once against the real models and saved: each line, the judge's verdict on it and
 * the patient's reply. Replaying it through the same engine gives the public sample report real model
 * replies at no cost per visit. The offline keyword doubles it replaces answered a greeting and an
 * open question with "I'm not sure", which made the one page most visitors see look broken.
 */
export interface RecordedTurn {
  input: string;
  verdict: JudgeVerdict;
  reply: string;
}

export interface RecordedSession {
  caseId: string;
  recordedAt: string;
  /** Which models produced it, for whoever reads the file. */
  models: string;
  turns: RecordedTurn[];
}

function lookup(session: RecordedSession, input: string): RecordedTurn {
  const turn = session.turns.find((t) => t.input === input);
  if (!turn) throw new Error(`the recording for ${session.caseId} has no line "${input}"`);
  return turn;
}

function replayClients(session: RecordedSession): { judge: JudgeClient; patient: PatientClient } {
  return {
    judge: { evaluate: async ({ studentInput }) => lookup(session, studentInput).verdict },
    patient: { respond: async ({ studentInput }) => lookup(session, studentInput).reply },
  };
}

/** Plays a recording through the engine, so the marks come from the same code a live station runs. */
export async function playSession(patientCase: PatientCase, session: RecordedSession) {
  if (session.caseId !== patientCase.id) {
    throw new Error(`a recording for ${session.caseId} cannot be played on ${patientCase.id}`);
  }
  const { judge, patient } = replayClients(session);
  let state = initialSessionState();
  let transcript: ConversationTurn[] = [];
  for (const turn of session.turns) {
    const result = await runTurn(patientCase, state, turn.input, judge, patient, transcript);
    state = result.state;
    transcript = appendTurn(transcript, turn.input, result);
  }
  return { report: computeReport(patientCase, state), transcript };
}
