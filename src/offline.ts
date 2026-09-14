import type { JudgeClient, PatientClient } from './llm.js';
import type { JudgeVerdict } from './types.js';

const EMPATHY = /\b(sorry|understand|that sounds|must be)\b/i;
const OPEN = /^(what|how|tell me|could you tell|can you tell|describe)\b/i;
const NOT_SURE = "I'm not sure, I haven't really noticed anything like that.";
const EMPATHY_TRUST_DELTA = 10;
const DEFAULT_TRUST_DELTA = 2;

/** A blank cue would match every question, so it never counts. */
function matchesCue(text: string, cue: string): boolean {
  const trimmed = cue.trim().toLowerCase();
  return trimmed !== '' && text.includes(trimmed);
}

/**
 * Deterministic keyword judge for zero-cost development and demos.
 * It is deliberately crude; evaluation numbers are never reported from offline mode.
 */
export function offlineJudge(): JudgeClient {
  return {
    async evaluate({ patientCase, studentInput }): Promise<JudgeVerdict> {
      const text = studentInput.toLowerCase();
      const rubricItemIds = patientCase.rubric
        .filter((r) => r.offlineCues.some((cue) => matchesCue(text, cue)))
        .map((r) => r.id);
      const trimmed = studentInput.trim();
      const questionStyle: JudgeVerdict['questionStyle'] = OPEN.test(trimmed)
        ? 'open'
        : trimmed.endsWith('?')
          ? 'closed'
          : 'none';
      const empathy = EMPATHY.test(studentInput);
      return {
        rubricItemIds,
        requestedFactIds: [],
        questionStyle,
        empathy,
        interrupted: false,
        jargon: false,
        selfDisclosure: false,
        trustDelta: empathy ? EMPATHY_TRUST_DELTA : DEFAULT_TRUST_DELTA,
        reasoning: 'offline keyword judge',
      };
    },
  };
}

/** Offline patient: says exactly the facts the engine marked relevant this turn. */
export function offlinePatient(): PatientClient {
  return {
    async respond({ relevantFacts }) {
      return relevantFacts.length ? relevantFacts.join(' ') : NOT_SURE;
    },
  };
}
