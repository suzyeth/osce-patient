import { describe, it, expect } from 'vitest';
import { playSession, type RecordedSession } from '../src/recordedSession.js';
import { loadDemoCase } from './loadCase.js';
import { verdict } from './fakes.js';

const c = loadDemoCase();

const session: RecordedSession = {
  caseId: c.id,
  recordedAt: '2026-10-22T16:00:00.000Z',
  models: 'test',
  turns: [
    { input: 'Hello, may I ask you some questions?', verdict: verdict({ questionStyle: 'closed' }), reply: 'Yes, go ahead.' },
    { input: 'Do you smoke?', verdict: verdict({ rubricItemIds: ['smoking'], asksAboutFacts: true }), reply: 'Twenty a day, since I was eighteen.' },
  ],
};

describe('playSession', () => {
  it('replays the recorded replies and the marks their verdicts earned', async () => {
    const played = await playSession(c, session);
    expect(played.transcript).toEqual([
      { student: 'Hello, may I ask you some questions?', patient: 'Yes, go ahead.' },
      { student: 'Do you smoke?', patient: 'Twenty a day, since I was eighteen.' },
    ]);
    const smoking = played.report.items.find((i) => i.id === 'smoking');
    expect(smoking).toMatchObject({ covered: true, turn: 2, quote: 'Do you smoke?' });
  });

  it('refuses a recording made for another case', async () => {
    await expect(playSession(c, { ...session, caseId: 'case-other' })).rejects.toThrow(/case-other/);
  });
});
