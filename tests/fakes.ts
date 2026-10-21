import type { JudgeClient, PatientClient } from '../src/llm.js';
import type { JudgeVerdict } from '../src/types.js';

/** A neutral verdict with overrides. */
export function verdict(partial: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    rubricItemIds: [],
    requestedFactIds: [],
    questionStyle: 'closed',
    empathy: false,
    interrupted: false,
    jargon: false,
    selfDisclosure: false,
    asksAboutFacts: false,
    unclear: false,
    trustDelta: 0,
    reasoning: 'test',
    ...partial,
  };
}

/** Judge double that always returns the given verdict. */
export function fakeJudge(v: JudgeVerdict): JudgeClient {
  return {
    async evaluate() {
      return v;
    },
  };
}

/**
 * Worst-case patient: a fully jailbroken model that dumps everything it can see.
 * Used to prove that facts absent from the context cannot leak.
 */
export function echoPatient(): PatientClient {
  return {
    async respond({ context, studentInput }) {
      return `${context}\n[STUDENT]: ${studentInput}`;
    },
  };
}

/** Returns replies in order (repeating the last one) and counts calls. */
export function scriptedPatient(...replies: string[]): PatientClient & { calls: number } {
  const stub = {
    calls: 0,
    async respond(): Promise<string> {
      const reply = replies[Math.min(stub.calls, replies.length - 1)] ?? '';
      stub.calls += 1;
      return reply;
    },
  };
  return stub;
}
