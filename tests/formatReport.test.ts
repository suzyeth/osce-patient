import { describe, it, expect } from 'vitest';
import { formatReport } from '../src/formatReport.js';
import { computeReport } from '../src/report.js';
import { initialSessionState } from '../src/state.js';
import { loadDemoCase } from './loadCase.js';

const c = loadDemoCase();

describe('formatReport', () => {
  it('shows the judgement, the unreviewed note, hits, critical misses and suggestions', () => {
    const text = formatReport(computeReport(c, { ...initialSessionState(), rubricHits: { smoking: 2 } }));
    expect(text).toContain('Global judgement: Unsatisfactory');
    expect(text).toContain('not been reviewed by a clinician');
    expect(text).toContain('[x] turn 2  Takes a smoking history');
    expect(text).toContain('[!] MISSED (critical)  Asks about coughing up blood');
    expect(text).toContain('Try: "Have you coughed up any blood?"');
    expect(text).toContain('You did not find out what the patient was worried about.');
  });
});
