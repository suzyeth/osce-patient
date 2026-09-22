import { describe, it, expect } from 'vitest';
import { handleApi, SESSION_COOKIE, type StationClients, type WebDeps } from '../../src/web/router.js';
import { openSession, sealSession, toStored } from '../../src/web/sessionCookie.js';
import type { WebLimits } from '../../src/web/limits.js';
import { offlineJudge, offlinePatient } from '../../src/offline.js';
import { computeReport } from '../../src/report.js';
import { initialSessionState } from '../../src/state.js';
import { loadDemoCase } from '../loadCase.js';

const c = loadDemoCase();
const SECRET = 'a-secret-of-at-least-16-chars';
const limits: WebLimits = { accessCode: 'plab-2026', sessionBudgetUsd: 0.05, dailyBudgetUsd: 2, maxTurns: 3, maxInputChars: 100 };

/** Offline doubles, and a spend the test can set. */
function clients(spent = 0.001, safetyFlags = false): StationClients {
  return {
    judge: offlineJudge(),
    patient: offlinePatient(),
    safety: safetyFlags ? { async check() { return { selfDisclosure: true, category: 'own_health' as const }; } } : undefined,
    spentUsd: () => spent,
  };
}

function deps(over: Partial<WebDeps> = {}): WebDeps {
  return {
    limits,
    secret: SECRET,
    cases: { [c.id]: c },
    clientsFor: () => clients(),
    now: () => 1_700_000_000_000,
    sampleReport: () => ({ caseTitle: c.title, report: computeReport(c, initialSessionState()), transcript: [] }),
    ...over,
  };
}

const post = (path: string, payload: unknown, cookie?: string) =>
  new Request(`https://example.test${path}`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });

const cookieFrom = (response: Response): string => (response.headers.get('set-cookie') ?? '').split(';')[0]!.split('=').slice(1).join('=');

describe('POST /api/start', () => {
  it('needs the access code and sets a sealed cookie', async () => {
    const refused = await handleApi(post('/api/start', { code: 'wrong' }), deps());
    expect(refused.status).toBe(403);
    expect(refused.headers.get('set-cookie')).toBeNull();

    const started = await handleApi(post('/api/start', { code: 'plab-2026' }), deps());
    expect(started.status).toBe(200);
    const payload = (await started.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({ caseId: c.id, patientName: c.patient.name, secondsLeft: c.durationSeconds, reviewStatus: 'unreviewed' });
    const header = started.headers.get('set-cookie') ?? '';
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Secure');
    expect(openSession(cookieFrom(started), SECRET)).toMatchObject({ caseId: c.id, spentUsd: 0 });
  });

  it('never puts case facts in the payload it returns', async () => {
    const started = await handleApi(post('/api/start', { code: 'plab-2026' }), deps());
    const raw = JSON.stringify(await started.json());
    for (const fact of c.facts.filter((f) => f.kind !== 'presenting')) expect(raw).not.toContain(fact.text);
  });
});

describe('POST /api/turn', () => {
  const sealed = (over: Partial<Parameters<typeof toStored>[2]> = {}, spent = 0, startedAt = 1_700_000_000_000) =>
    sealSession(toStored(c.id, startedAt, { ...initialSessionState(), ...over }, [], spent), SECRET);

  it('answers, unlocks and keeps the state in the new cookie', async () => {
    const response = await handleApi(post('/api/turn', { input: 'Do you smoke?' }, sealed()), deps());
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.reply).toContain('twenty a day');
    expect(payload).toMatchObject({ paused: false, turnsUsed: 1 });
    const next = openSession(cookieFrom(response), SECRET);
    expect(next.state.unlockedFactIds).toEqual(['f_smoking']);
    expect(next.spentUsd).toBeCloseTo(0.001, 10);
    expect(next.history).toHaveLength(1);
  });

  it('refuses without a station, and with a cookie that was tampered with', async () => {
    expect((await handleApi(post('/api/turn', { input: 'Hi' }), deps())).status).toBe(401);
    expect((await handleApi(post('/api/turn', { input: 'Hi' }, 'v1.a.b.c'), deps())).status).toBe(400);
  });

  it('stops an empty line, an over-long line, a station out of turns and one out of time', async () => {
    const cases: Array<[string, string, number, string]> = [
      ['   ', sealed(), 429, 'empty'],
      ['x'.repeat(101), sealed(), 429, 'input_too_long'],
      ['Do you smoke?', sealed({ turnsUsed: 3 }), 429, 'too_many_turns'],
      ['Do you smoke?', sealed({}, 0, 1_700_000_000_000 - c.durationSeconds * 1000 - 1000), 429, 'time_up'],
      ['Do you smoke?', sealed({}, 0.05), 429, 'session_budget'],
    ];
    for (const [input, cookie, status, reason] of cases) {
      const response = await handleApi(post('/api/turn', { input }, cookie), deps());
      expect(response.status, reason).toBe(status);
      expect((await response.json()) as { reason: string }).toMatchObject({ reason });
    }
  });

  it('shows the safety pause as a pause, not as the patient talking', async () => {
    const response = await handleApi(post('/api/turn', { input: 'I have chest pain, what should I do?' }, sealed()), deps({ clientsFor: () => clients(0.001, true) }));
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.paused).toBe(true);
    expect(String(payload.reply)).toContain('NHS 111');
  });

  it('leaves the station untouched when a model fails', async () => {
    const failing: WebDeps['clientsFor'] = () => ({
      judge: { async evaluate() { throw new Error('HTTP 503'); } },
      patient: offlinePatient(),
      spentUsd: () => 0,
    });
    const cookie = sealed();
    const response = await handleApi(post('/api/turn', { input: 'Do you smoke?' }, cookie), deps({ clientsFor: failing }));
    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(openSession(cookie, SECRET).state.turnsUsed).toBe(0);
  });

  it('gives each station its own remaining budget', async () => {
    const seen: number[] = [];
    await handleApi(post('/api/turn', { input: 'Do you smoke?' }, sealed({}, 0.02)), deps({ clientsFor: (remaining) => { seen.push(remaining); return clients(); } }));
    expect(seen).toEqual([0.05 - 0.02]);
  });
});

describe('POST /api/report and GET /api/sample', () => {
  it('scores the station from the sealed state and clears the cookie', async () => {
    const stored = sealSession(toStored(c.id, 1_700_000_000_000, { ...initialSessionState(), rubricHits: { smoking: 1 }, turnsUsed: 1 }, [], 0.002), SECRET);
    const response = await handleApi(post('/api/report', {}, stored), deps());
    const payload = (await response.json()) as { report: { items: Array<{ id: string; covered: boolean }> } };
    expect(payload.report.items.find((i) => i.id === 'smoking')?.covered).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('serves the sample report without a code', async () => {
    const response = await handleApi(new Request('https://example.test/api/sample'), deps());
    expect(response.status).toBe(200);
    expect((await response.json()) as { caseTitle: string }).toMatchObject({ caseTitle: c.title });
  });

  it('answers anything else with a 404', async () => {
    expect((await handleApi(new Request('https://example.test/api/turn'), deps())).status).toBe(404);
    expect((await handleApi(post('/api/nope', {}), deps())).status).toBe(404);
  });
});
