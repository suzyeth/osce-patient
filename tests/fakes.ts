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
    trustDelta: 0,
    reasoning: 'test',
    ...partial,
  };
}
