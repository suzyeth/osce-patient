import { describe, it, expect } from 'vitest';
import { forbiddenTerms, guardReply } from '../src/patientGuard.js';
import { initialSessionState } from '../src/state.js';
import { loadDemoCase } from './loadCase.js';

const c = loadDemoCase();

describe('forbiddenTerms', () => {
  it('collects guarded terms of locked facts only', () => {
    expect(forbiddenTerms(c, initialSessionState())).toEqual([
      'six weeks',
      'blood',
      'twenty a day',
      'eighteen',
      'lung cancer',
      'cancer',
    ]);
    expect(forbiddenTerms(c, { ...initialSessionState(), unlockedFactIds: ['f_blood'] })).not.toContain('blood');
  });
});

describe('guardReply', () => {
  it('passes a clean reply unchanged', () => {
    expect(guardReply('It is just a cough.', ['blood'])).toEqual({
      ok: true,
      leaked: [],
      sanitized: 'It is just a cough.',
    });
  });

  it('matches whole words case-insensitively and redacts them', () => {
    const r = guardReply('There was some Blood, yes.', ['blood']);
    expect(r.ok).toBe(false);
    expect(r.leaked).toEqual(['blood']);
    expect(r.sanitized).toBe('There was some ..., yes.');
  });

  it('does not flag a term inside a longer word', () => {
    expect(guardReply('My bloodhound is fine.', ['blood']).ok).toBe(true);
  });

  it('handles multi-word terms and regex special characters', () => {
    expect(guardReply('I smoke twenty a day.', ['twenty a day']).ok).toBe(false);
    expect(guardReply('Take a+b now.', ['a+b']).ok).toBe(false);
  });

  it('handles terms ending in punctuation', () => {
    expect(guardReply('He has C.O.P.D. now.', ['C.O.P.D.']).ok).toBe(false);
  });
});
