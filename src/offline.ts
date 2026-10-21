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
/**
 * Greetings and courtesies. These ask about the person in plain English and still must not count as
 * asking for anything a case file would hold: hedging at "how are you?" makes the station look broken,
 * and it suppresses the opening the patient would otherwise give. Measured against the real judge,
 * which got this wrong until its instruction named the case.
 */
const SMALL_TALK =
  /\b(how are you|how do you feel today|are you (?:alright|ok|okay|comfortable)|is it (?:ok|okay|alright)|happy for me|any questions|anything else you|thank you|nice to meet|sorry to keep you)\b/i;

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
        // A question mark and a second person: crude, but it is the offline double's whole character,
        // and it keeps greetings and closings out of the off-case guard the way the real judge does.
        asksAboutFacts: trimmed.endsWith('?') && /\byou\b|\byour\b/i.test(trimmed) && !SMALL_TALK.test(trimmed),
        // The offline patient only repeats facts it was given, so it has nothing to invent from noise.
        unclear: false,
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
