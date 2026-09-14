import { describe, it, expect } from 'vitest';
import type { PatientCase } from '../src/types.js';
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

  it('dedupes terms case-insensitively, keeping first spelling', () => {
    // Create a case with both 'blood' and 'Blood'
    const caseWithDuplicate: PatientCase = {
      ...c,
      facts: [
        ...c.facts,
        {
          id: 'f_duplicate',
          kind: 'history',
          rubricItemId: 'r_dup',
          text: 'Test fact',
          guardedTerms: ['Blood'],
          source: { dataset: 'authored', ref: 'test', quote: 'test' },
        },
      ],
    };
    const result = forbiddenTerms(caseWithDuplicate, initialSessionState());
    // Should contain 'blood' (from original) but not 'Blood'
    expect(result).toContain('blood');
    const bloodCount = result.filter((t) => t.toLowerCase() === 'blood').length;
    expect(bloodCount).toBe(1);
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

  it('handles overlapping terms: longest match first', () => {
    const r = guardReply('Is it lung cancer?', ['cancer', 'lung cancer']);
    expect(r.leaked).toEqual(['lung cancer']);
    expect(r.sanitized).toBe('Is it ...?');
  });

  it('reports multiple matches in input order', () => {
    const r = guardReply('Is it lung cancer? Cancer runs in my family.', ['lung cancer', 'cancer']);
    expect(r.leaked).toEqual(['lung cancer', 'cancer']);
    expect(r.sanitized).toBe('Is it ...? ... runs in my family.');
  });

  it('redacts multiple occurrences of same term', () => {
    const r = guardReply('blood blood Blood', ['blood']);
    expect(r.sanitized).toBe('... ... ...');
    expect(r.leaked).toEqual(['blood']);
  });

  it('does not flag term inside a longer word (lifeblood)', () => {
    expect(guardReply('lifeblood', ['blood']).ok).toBe(true);
  });

  it('matches multi-word terms with flexible whitespace', () => {
    expect(guardReply('six  weeks', ['six weeks']).ok).toBe(false);
    expect(guardReply('six\nweeks', ['six weeks']).ok).toBe(false);
  });

  it('does not flag redaction character itself', () => {
    const r = guardReply('I said blood.', ['blood', '...']);
    expect(r.leaked).toEqual(['blood']);
    expect(r.ok).toBe(false);
  });

  it('handles parenthesised terms', () => {
    const r = guardReply('a (b) c and x', ['a (b) c', 'x', '(b)']);
    expect(r.leaked).toEqual(['a (b) c', 'x']);
    expect(r.sanitized).toBe('... and ...');
  });

  it('catches fullwidth and zero-width variants of a term', () => {
    expect(guardReply('Is it ｃａｎｃｅｒ?', ['cancer']).leaked).toEqual(['cancer']);
    const hidden = guardReply('Is it can\u200Bcer?', ['cancer']);
    expect(hidden.leaked).toEqual(['cancer']);
    expect(hidden.sanitized).toBe('Is it ...?');
  });

  it('redacts the original wording when folding finds nothing extra', () => {
    expect(guardReply('It was 2² times, and there was blood…', ['blood']).sanitized).toBe('It was 2² times, and there was ...…');
  });

  it('redacts every copy when a term appears both plainly and hidden', () => {
    expect(guardReply('I saw blood, yes bl\u200Bood', ['blood']).sanitized).toBe('I saw ..., yes ...');
    expect(guardReply('blood and ｂｌｏｏｄ', ['blood']).sanitized).toBe('... and ...');
  });

  it('collapses terms with different spacing to one', () => {
    const r = guardReply('six weeks ago', ['six weeks', 'six  weeks']);
    expect(r.leaked).toEqual(['six weeks']);
    expect(r.ok).toBe(false);
  });
});
