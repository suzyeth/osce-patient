import { describe, it, expect } from 'vitest';
import { namesDiagnosis, redFlagHint, redFlagItem, rubricFor, STANDARD_RUBRIC, STANDARD_RUBRIC_IDS } from '../../src/cases/rubric.js';
import { RubricItemSchema } from '../../src/types.js';

describe('the standard rubric', () => {
  it('is a valid rubric with unique ids and an example question for every item', () => {
    for (const item of STANDARD_RUBRIC) expect(() => RubricItemSchema.parse(item)).not.toThrow();
    expect(new Set(STANDARD_RUBRIC_IDS).size).toBe(STANDARD_RUBRIC.length);
    for (const item of STANDARD_RUBRIC) expect(item.exampleQuestion.length).toBeGreaterThan(10);
  });

  it('covers what a history station is marked on', () => {
    for (const id of ['intro_consent', 'open_question', 'onset_duration', 'medications_allergies', 'ice_concerns', 'closing', 'safety_netting']) {
      expect(STANDARD_RUBRIC_IDS).toContain(id);
    }
  });

  it('puts a case red flag among the symptom questions, before the history ones', () => {
    const rubric = rubricFor([redFlagItem('haemoptysis', 'Asks about coughing up blood', 'Have you coughed up any blood?', ['blood'])]);
    const ids = rubric.map((r) => r.id);
    expect(ids.indexOf('haemoptysis')).toBe(5);
    expect(ids.indexOf('haemoptysis')).toBeLessThan(ids.indexOf('past_medical'));
    expect(rubric.find((r) => r.id === 'haemoptysis')?.critical).toBe(true);
    // Adding a red flag does not drop or reorder anything else.
    expect(ids.filter((id) => id !== 'haemoptysis')).toEqual([...STANDARD_RUBRIC_IDS]);
  });
});

describe('redFlagHint', () => {
  it('spots wording a doctor would act on the same day', () => {
    const cases: Array<[string, string]> = [
      ['Last week I coughed up a streak of blood.', 'coughing up blood'],
      ['My left leg is a little bit sore, but I do not see any swelling.', 'a painful or swollen leg'],
      ['I passed out at work on Tuesday.', 'fainting or collapse'],
      ["My son has a rash that doesn't fade when I press a glass on it.", 'a rash that does not fade'],
      ['I have lost a stone and I get night sweats.', 'weight loss with night sweats'],
    ];
    for (const [text, reason] of cases) expect(redFlagHint(text), text).toBe(reason);
  });

  it('leaves ordinary history alone', () => {
    for (const text of [
      'I smoke about twenty a day and have done since I was eighteen.',
      'I work as an administrator at a bank.',
      'My mother had a heart attack at 56.',
      'The pain is sharp and worse on a deep breath.',
    ]) {
      expect(redFlagHint(text), text).toBeNull();
    }
  });
});

describe('namesDiagnosis', () => {
  it('flags a patient who names the diagnosis, and leaves symptoms alone', () => {
    expect(namesDiagnosis('I am worried this might be a pulmonary embolism.')).toBe(true);
    expect(namesDiagnosis('My dad had lung cancer and I am frightened.')).toBe(false);
    expect(namesDiagnosis('I think it is just a chest infection.')).toBe(false);
  });
});
