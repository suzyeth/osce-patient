import { describe, it, expect } from 'vitest';
import {
  codeMatches,
  openSession,
  sealSession,
  SessionCookieError,
  toSessionState,
  toStored,
  type StoredSession,
} from '../../src/web/sessionCookie.js';
import { initialSessionState } from '../../src/state.js';

const SECRET = 'a-secret-of-at-least-16-chars';
const OTHER = 'another-secret-of-16-plus-chars';

const state = { ...initialSessionState(), trust: 45, unlockedFactIds: ['f_smoking'], rubricHits: { smoking: 3 }, turnsUsed: 3 };
const history = Array.from({ length: 12 }, (_, i) => ({ student: `q${i}`, patient: `a${i}` }));

describe('toStored', () => {
  it('keeps the state, the started time and only the last eight turns', () => {
    const stored = toStored('demo-cough', 1_700_000_000_000, state, history, 0.0031);
    expect(stored).toMatchObject({ caseId: 'demo-cough', startedAt: 1_700_000_000_000, spentUsd: 0.0031 });
    expect(stored.history).toHaveLength(8);
    expect(stored.history[0]).toEqual({ student: 'q4', patient: 'a4' });
    expect(stored.state.unlockedFactIds).toEqual(['f_smoking']);
  });

  it('round-trips into the engine state', () => {
    const stored = toStored('demo-cough', 1, state, [], 0);
    expect(toSessionState(stored)).toEqual(state);
  });
});

describe('sealSession and openSession', () => {
  const stored = toStored('demo-cough', 1_700_000_000_000, state, history, 0.01);

  it('returns exactly what was sealed', () => {
    expect(openSession(sealSession(stored, SECRET), SECRET)).toEqual(stored);
  });

  it('never shows the unlocked facts in the cookie itself', () => {
    expect(sealSession(stored, SECRET)).not.toContain('f_smoking');
  });

  it('refuses a cookie changed by one character', () => {
    const cookie = sealSession(stored, SECRET);
    const parts = cookie.split('.');
    // Flip a byte of the ciphertext itself, not a base64 character, so the change is real.
    const body = Buffer.from(parts[2]!, 'base64url');
    body[0] = body[0]! ^ 0x01;
    const tampered = [parts[0], parts[1], body.toString('base64url'), parts[3]].join('.');
    expect(() => openSession(tampered, SECRET)).toThrow(SessionCookieError);
  });

  it('refuses a cookie sealed with another secret, and nonsense', () => {
    expect(() => openSession(sealSession(stored, OTHER), SECRET)).toThrow(SessionCookieError);
    expect(() => openSession('not-a-cookie', SECRET)).toThrow(/expected format/);
    expect(() => openSession('v1.a.b.c', SECRET)).toThrow(SessionCookieError);
  });

  it('refuses a state this version does not understand', () => {
    const wrong = { ...stored, state: { ...stored.state, turnsUsed: -1 } } as unknown as StoredSession;
    expect(() => openSession(sealSession(wrong, SECRET), SECRET)).toThrow(/does not understand/);
  });

  it('refuses a secret too short to be worth anything', () => {
    expect(() => sealSession(stored, 'short')).toThrow(/at least 16/);
  });

  it('gives a different cookie every time, so two stations cannot be told apart by it', () => {
    expect(sealSession(stored, SECRET)).not.toBe(sealSession(stored, SECRET));
  });
});

describe('codeMatches', () => {
  it('accepts only the exact code', () => {
    expect(codeMatches('judge-code', 'judge-code')).toBe(true);
    expect(codeMatches('judge-cod', 'judge-code')).toBe(false);
    expect(codeMatches('', 'judge-code')).toBe(false);
    expect(codeMatches('JUDGE-CODE', 'judge-code')).toBe(false);
  });
});
