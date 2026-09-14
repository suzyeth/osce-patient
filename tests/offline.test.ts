import { describe, it, expect } from 'vitest';
import { offlineJudge, offlinePatient } from '../src/offline.js';
import { runTurn } from '../src/orchestrator.js';
import { computeReport } from '../src/report.js';
import { initialSessionState } from '../src/state.js';
import { loadDemoCase } from './loadCase.js';

const c = loadDemoCase();

describe('offline mode', () => {
  it('plays a short session end to end without any model', async () => {
    const judge = offlineJudge();
    const patient = offlinePatient();
    let s = initialSessionState();
    const inputs = [
      "Hello, my name is Sam, I'm one of the doctors. Is it okay if I ask you some questions?",
      'What brings you in today?',
      'Do you smoke?',
      'Is there anything you are worried about?',
    ];
    const replies: string[] = [];
    for (const q of inputs) {
      const r = await runTurn(c, s, q, judge, patient);
      s = r.state;
      replies.push(r.reply);
    }
    expect(replies[1]).toContain("won't go away");
    expect(replies[2]).toContain('twenty a day');
    expect(replies[3]).toContain('lung cancer');
    const report = computeReport(c, s);
    expect(report.items.filter((i) => i.covered).map((i) => i.id)).toEqual([
      'intro_consent',
      'open_question',
      'smoking',
      'ice_concerns',
    ]);
    expect(report.criticalMisses).toEqual(['haemoptysis']);
  });

  it('classifies open, closed and statement turns', async () => {
    const judge = offlineJudge();
    const input = { patientCase: c, state: initialSessionState(), history: [] };
    expect((await judge.evaluate({ ...input, studentInput: 'How are you feeling?' })).questionStyle).toBe('open');
    expect((await judge.evaluate({ ...input, studentInput: 'Do you smoke?' })).questionStyle).toBe('closed');
    expect((await judge.evaluate({ ...input, studentInput: "I'm sorry to hear that." })).questionStyle).toBe('none');
  });

  it('never matches a blank cue', async () => {
    const withBlank = {
      ...c,
      rubric: c.rubric.map((r) => (r.id === 'haemoptysis' ? { ...r, offlineCues: ['blood', '', '  '] } : r)),
    };
    const v = await offlineJudge().evaluate({ patientCase: withBlank, state: initialSessionState(), history: [], studentInput: 'Hello' });
    expect(v.rubricItemIds).not.toContain('haemoptysis');
  });
});
