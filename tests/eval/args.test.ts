import { describe, it, expect } from 'vitest';
import { DEFAULT_CAP_USD, parseEvalArgs } from '../../src/eval/args.js';

describe('parseEvalArgs', () => {
  it('fills defaults for a single evaluation', () => {
    expect(parseEvalArgs(['judge'])).toEqual({
      ok: true,
      args: { evals: ['judge'], casePath: 'cases/demo-cough.json', offline: false, capUsd: DEFAULT_CAP_USD, repeat: 2, labelsPath: null },
    });
  });

  it('expands all to the four evaluations that need no labels', () => {
    const parsed = parseEvalArgs(['all', '--offline', '--cap', '0.25', '--repeat', '1', '--case', 'cases/x.json']);
    expect(parsed).toEqual({
      ok: true,
      args: { evals: ['judge', 'safety', 'attack', 'honesty'], casePath: 'cases/x.json', offline: true, capUsd: 0.25, repeat: 1, labelsPath: null },
    });
  });

  it('needs labels for agreement', () => {
    expect(parseEvalArgs(['agreement'])).toEqual({ ok: false, message: 'agreement needs --labels <path>.' });
    expect(parseEvalArgs(['agreement', '--labels', 'eval/labels/mine.json'])).toMatchObject({ ok: true, args: { labelsPath: 'eval/labels/mine.json' } });
  });

  it('refuses any argument it does not know, so a typo never starts a paid run', () => {
    expect(parseEvalArgs(['all', '--ofline'])).toMatchObject({ ok: false, message: expect.stringContaining('Unknown argument "--ofline"') });
    expect(parseEvalArgs(['judge', 'safety'])).toMatchObject({ ok: false, message: expect.stringContaining('Unknown argument "safety"') });
  });

  it('refuses unknown evaluations and unsafe or malformed numbers', () => {
    expect(parseEvalArgs([])).toMatchObject({ ok: false, message: expect.stringContaining('Usage') });
    expect(parseEvalArgs(['everything'])).toMatchObject({ ok: false, message: expect.stringContaining('Unknown evaluation') });
    for (const cap of ['0', '-1', '40', 'abc']) {
      expect(parseEvalArgs(['judge', '--cap', cap])).toMatchObject({ ok: false, message: expect.stringContaining('--cap') });
    }
    expect(parseEvalArgs(['judge', '--cap'])).toEqual({ ok: false, message: '--cap needs a value.' });
    expect(parseEvalArgs(['judge', '--case', '--offline'])).toEqual({ ok: false, message: '--case needs a value.' });
    for (const repeat of ['0', '6', '1.5']) {
      expect(parseEvalArgs(['honesty', '--repeat', repeat])).toMatchObject({ ok: false, message: expect.stringContaining('--repeat') });
    }
  });
});
