import { describe, it, expect } from 'vitest';
import { formatReport } from '../src/formatReport.js';
import { computeReport } from '../src/report.js';
import { initialSessionState } from '../src/state.js';
import { loadDemoCase } from './loadCase.js';

const c = loadDemoCase();

const text = () =>
  formatReport(
    computeReport(c, {
      ...initialSessionState(),
      rubricHits: { smoking: 2 },
      turnsUsed: 2,
      transcript: [
        {
          turn: 1,
          studentInput: 'What brings you in today?',
          creditedItemIds: [],
          questionStyle: 'open',
          empathy: false,
          interrupted: false,
          jargon: false,
        },
        {
          turn: 2,
          studentInput: 'Do you smoke at all?',
          creditedItemIds: ['smoking'],
          questionStyle: 'closed',
          empathy: false,
          interrupted: false,
          jargon: false,
        },
      ],
    }),
  );

describe('formatReport', () => {
  it('says what this is before it says anything about the candidate', () => {
    const out = text();
    expect(out).toContain('This is practice feedback, not a mark');
    expect(out).toContain('publishes no item-by-item mark scheme');
    expect(out).toContain('not been reviewed');
    // No verdict, anywhere.
    expect(out).not.toMatch(/Global judgement|Borderline|Satisfactory/);
  });

  it('shows the ten statements with the GMC wording and what each one rests on', () => {
    const out = text();
    expect(out).toContain('Does not develop a management plan reflecting current best practice');
    expect(out).toContain('[--] Examination');
    expect(out).toContain('Nothing is examined in a typed history-taking station.');
    // The wording's authority is shown, because ours and a regulator's are not the same thing.
    expect(out).toContain('Published wording, from: GMC');
  });

  it('quotes the question that earned each mark, and suggests wording for the ones missed', () => {
    const out = text();
    expect(out).toContain('[x] Takes a smoking history - question 2');
    expect(out).toContain('You asked: "Do you smoke at all?"');
    expect(out).toContain('[ ] Asks about coughing up blood (critical)');
    expect(out).toContain('Try: "Have you coughed up any blood?"');
    expect(out).toContain('You did not find out what the patient was worried about.');
  });
});
