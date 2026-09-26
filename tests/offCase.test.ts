import { describe, it, expect } from 'vitest';
import { isOffCaseAnswer, OFF_CASE_ANSWERS, OFF_CASE_FALLBACK } from '../src/offCase.js';

describe('isOffCaseAnswer', () => {
  it('accepts each answer the prompt offers, however it is punctuated', () => {
    for (const answer of OFF_CASE_ANSWERS) {
      expect(isOffCaseAnswer(answer), answer).toBe(true);
      expect(isOffCaseAnswer(`${answer}.`), answer).toBe(true);
      expect(isOffCaseAnswer(answer.replace("'", '\u2019')), answer).toBe(true);
    }
    expect(isOffCaseAnswer(OFF_CASE_FALLBACK)).toBe(true);
    expect(isOffCaseAnswer("I'm not sure, sorry.")).toBe(true);
  });

  it('rejects the answers the last three measurements actually produced', () => {
    // Every one of these came back from the real model on a question the case says nothing about.
    for (const reply of [
      'No.',
      'No chest pain. Just this stubborn cough.',
      'No, my weight\u2019s been steady.',
      'No known allergies.',
      'No, I don\u2019t have any pets.',
      "I don't really drink\u2014maybe a beer once in a while with mates, but nothing regular.",
      "My wife\u2019s fine, kids are grown and live elsewhere\u2014nobody here\u2019s sick.",
      "I'm not sure\u2014I haven't checked my temperature lately. No one\u2019s mentioned it.",
    ]) {
      expect(isOffCaseAnswer(reply), reply).toBe(false);
    }
  });

  it('rejects an empty reply, which is a different failure with its own fallback', () => {
    expect(isOffCaseAnswer('')).toBe(false);
    expect(isOffCaseAnswer('   ')).toBe(false);
  });
});
