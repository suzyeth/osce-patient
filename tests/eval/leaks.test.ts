import { describe, it, expect } from 'vitest';
import { buildControlContext, leakedFactIds, lockedFactIds, recordReplies } from '../../src/eval/leaks.js';
import { buildPatientContext, opennessLine } from '../../src/patientContext.js';
import { initialSessionState } from '../../src/state.js';
import { scriptedPatient } from '../fakes.js';
import { loadDemoCase } from '../loadCase.js';

const c = loadDemoCase();

describe('lockedFactIds', () => {
  it('lists every non-public fact that is not unlocked', () => {
    expect(lockedFactIds(c, initialSessionState())).toEqual(['f_duration', 'f_blood', 'f_smoking', 'f_concern']);
    expect(lockedFactIds(c, { ...initialSessionState(), unlockedFactIds: ['f_blood'] })).toEqual([
      'f_duration',
      'f_smoking',
      'f_concern',
    ]);
  });
});

describe('leakedFactIds', () => {
  const locked = lockedFactIds(c, initialSessionState());

  it('finds locked facts named in a reply, whole words only and in any case', () => {
    expect(leakedFactIds(c, 'There was some BLOOD, and I worry about cancer.', locked)).toEqual(['f_blood', 'f_concern']);
    expect(leakedFactIds(c, 'My bloodwork was fine.', locked)).toEqual([]);
    // A literal mention counts even in a denial; the report says so.
    expect(leakedFactIds(c, 'No blood at all.', locked)).toEqual(['f_blood']);
  });

  it('ignores facts that are not locked', () => {
    expect(leakedFactIds(c, 'A bit of blood.', ['f_smoking'])).toEqual([]);
  });

  it('counts a fact once however many of its terms appear', () => {
    expect(leakedFactIds(c, 'Twenty a day since I was eighteen.', locked)).toEqual(['f_smoking']);
  });
});

describe('buildControlContext', () => {
  it('holds every fact, which the real context never does before they unlock', () => {
    const control = buildControlContext(c, 30);
    const real = buildPatientContext(c, initialSessionState());
    for (const fact of c.facts) expect(control).toContain(fact.text);
    expect(real).not.toContain('streak of blood');
  });

  it('keeps the persona and answer rules of the real context', () => {
    const control = buildControlContext(c, 30);
    expect(control).toContain(c.patient.persona);
    expect(control).toContain('Never invent symptoms');
    expect(control).toContain('Keep each detail to yourself');
  });

  it('uses the same trust line as the real context at the same trust', () => {
    for (const trust of [10, 30, 50, 80]) {
      const state = { ...initialSessionState(), trust };
      const line = opennessLine(trust);
      expect(buildControlContext(c, trust)).toContain(line);
      expect(buildPatientContext(c, state)).toContain(line);
    }
  });
});

describe('recordReplies', () => {
  it('keeps each raw reply until taken, then starts again', async () => {
    const rec = recordReplies(scriptedPatient('first', 'second'));
    const input = { context: '', studentInput: 'hi', history: [], relevantFacts: [] };
    expect(await rec.patient.respond(input)).toBe('first');
    expect(await rec.patient.respond(input)).toBe('second');
    expect(rec.take()).toEqual(['first', 'second']);
    expect(rec.take()).toEqual([]);
  });
});
