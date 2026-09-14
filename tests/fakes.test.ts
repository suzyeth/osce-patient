import { describe, it, expect } from 'vitest';
import { scriptedPatient } from './fakes.js';

describe('scriptedPatient', () => {
  it('returns replies in order, repeats the last, and counts calls', async () => {
    const p = scriptedPatient('a', 'b');
    const input = { context: '', studentInput: '', history: [], relevantFacts: [] };
    expect([await p.respond(input), await p.respond(input), await p.respond(input)]).toEqual(['a', 'b', 'b']);
    expect(p.calls).toBe(3);
  });
});
