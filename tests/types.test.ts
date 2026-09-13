import { describe, it, expect } from 'vitest';
import { parseCase } from '../src/types.js';
import { loadDemoRaw } from './loadCase.js';

describe('parseCase', () => {
  it('parses the demo case and fills defaults', () => {
    const c = parseCase(loadDemoRaw());
    expect(c.id).toBe('demo-cough');
    expect(c.rubric.find((r) => r.id === 'smoking')?.critical).toBe(false);
    expect(c.facts.find((f) => f.id === 'f_presenting')?.guardedTerms).toEqual([]);
  });

  it('rejects a fact without a source', () => {
    const raw = loadDemoRaw() as { facts: Array<Record<string, unknown>> };
    delete raw.facts[0]!.source;
    expect(() => parseCase(raw)).toThrow();
  });

  it('rejects an unknown fact kind', () => {
    const raw = loadDemoRaw() as { facts: Array<Record<string, unknown>> };
    raw.facts[0]!.kind = 'gossip';
    expect(() => parseCase(raw)).toThrow();
  });
});
