import { describe, it, expect } from 'vitest';
import {
  codeMatches,
  COOKIE_CHUNK_CHARS,
  joinCookieChunks,
  MAX_COOKIE_CHUNKS,
  splitCookie,
  openSession,
  sealSession,
  SessionCookieError,
  toSessionState,
  toStored,
  type StoredSession,
} from '../../src/web/sessionCookie.js';
import { initialSessionState } from '../../src/state.js';
import type { TurnRecord } from '../../src/types.js';

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

describe('the transcript in the cookie', () => {
  const turn = (i: number, over: Partial<TurnRecord> = {}): TurnRecord => ({
    turn: i,
    studentInput: `Question number ${i}: ${'a very long thing to ask the patient about their symptoms '.repeat(4)}`,
    creditedItemIds: [],
    questionStyle: 'closed' as const,
    empathy: false,
    interrupted: false,
    jargon: false,
    ...over,
  });

  it('stores only the turns the report can say something about', () => {
    const transcript = [turn(1), turn(2, { creditedItemIds: ['smoking'] }), turn(3, { jargon: true })];
    const stored = toStored('demo-cough', 1, { ...state, transcript }, [], 0);
    // Turn one earned nothing and carries no flag, so the report would never print it.
    expect(stored.transcript.map((x) => x.t)).toEqual([2, 3]);
    expect(stored.transcript[0]?.q).toContain('Question number 2');
    expect(stored.transcript[0]?.c).toEqual(['smoking']);
    expect(stored.transcript[1]?.f).toBe(4);
  });

  it('trims a long question rather than dropping it', () => {
    const stored = toStored('demo-cough', 1, { ...state, transcript: [turn(1, { creditedItemIds: ['smoking'] })] }, [], 0);
    const quote = stored.transcript[0]?.q ?? '';
    expect(quote.length).toBeLessThanOrEqual(120);
    expect(quote.endsWith('…')).toBe(true);
  });

  it('round-trips the flags back into the engine state', () => {
    const transcript = [turn(1, { creditedItemIds: ['smoking'], empathy: true, interrupted: true, jargon: true })];
    const restored = toSessionState(openSession(sealSession(toStored('demo-cough', 1, { ...state, transcript }, [], 0), SECRET), SECRET));
    expect(restored.transcript[0]).toMatchObject({ turn: 1, empathy: true, interrupted: true, jargon: true, questionStyle: 'closed' });
    expect(restored.transcript[0]?.creditedItemIds).toEqual(['smoking']);
  });

  it('fits a whole station in a few cookies, and never drops the evidence for a mark', () => {
    // Worse than a real station: 20 credited questions, all long, plus 10 flagged ones.
    const credited = Array.from({ length: 20 }, (_, i) => turn(i + 1, { creditedItemIds: [`rubric_item_${i}`] }));
    const flagged = Array.from({ length: 10 }, (_, i) => turn(i + 21, { jargon: true, interrupted: true }));
    const transcript = [...credited, ...flagged];
    const stored = toStored('demo-cough', 1, { ...state, transcript }, history, 0.05);
    const cookie = sealSession(stored, SECRET);
    // Browsers only guarantee about 4 KB per cookie, so no single chunk may approach that.
    const parts = splitCookie(cookie);
    expect(parts.length).toBeLessThanOrEqual(MAX_COOKIE_CHUNKS);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(COOKIE_CHUNK_CHARS);
    // Put back together, it is the same session; nothing about chunking changes what is stored.
    expect(joinCookieChunks(new Map(parts.map((part, i) => [i, part])))).toBe(cookie);
    expect(stored.transcript).toHaveLength(30);
    // Every credited turn still carries the words that earned it.
    expect(stored.transcript.filter((x) => x.c.length > 0).every((x) => x.q !== '')).toBe(true);
    expect(openSession(cookie, SECRET).transcript).toHaveLength(30);
  });
});

describe('splitting the cookie', () => {
  it('needs no split for a short session and leaves it byte for byte the same', () => {
    const cookie = sealSession(toStored('demo-cough', 1, state, [], 0), SECRET);
    expect(splitCookie(cookie)).toEqual([cookie]);
  });

  it('stops at a gap rather than joining a stale tail onto a new session', () => {
    expect(joinCookieChunks(new Map([[0, 'aaa'], [2, 'ccc']]))).toBe('aaa');
    expect(joinCookieChunks(new Map())).toBeNull();
  });

  it('refuses to store a session that would need more cookies than a browser will keep', () => {
    const tooLong = 'x'.repeat(COOKIE_CHUNK_CHARS * MAX_COOKIE_CHUNKS + 1);
    expect(() => splitCookie(tooLong)).toThrow(SessionCookieError);
  });

  it('trims the history, because that is what actually fills the cookie', () => {
    const long = [{ student: 'q'.repeat(900), patient: 'a'.repeat(900) }];
    const stored = toStored('demo-cough', 1, state, long, 0);
    expect(stored.history[0]?.student.length).toBeLessThanOrEqual(250);
    expect(stored.history[0]?.patient.length).toBeLessThanOrEqual(350);
    expect(stored.history[0]?.student.endsWith('…')).toBe(true);
  });

  it('fits the longest station the web limits allow', () => {
    // maxTurns is 40, so this is the worst case a visitor can actually reach.
    const transcript = Array.from({ length: 40 }, (_, i) => ({
      turn: i + 1,
      studentInput: `A long question about the patient and their symptoms, number ${i + 1}, ${'padding '.repeat(20)}`,
      creditedItemIds: [`rubric_item_${i}`],
      questionStyle: 'closed' as const,
      empathy: true,
      interrupted: true,
      jargon: true,
    }));
    const full = {
      ...state,
      turnsUsed: 40,
      transcript,
      rubricHits: Object.fromEntries(transcript.map((x, i) => [`rubric_item_${i}`, x.turn])),
    };
    const history = Array.from({ length: 8 }, (_, i) => ({ student: 'q'.repeat(500), patient: 'a'.repeat(500) }));
    const sealed = sealSession(toStored('demo-cough', 1, full, history, 0.05), SECRET);
    const parts = splitCookie(sealed);
    expect(parts.length).toBeLessThanOrEqual(MAX_COOKIE_CHUNKS);
    // Four chunks is about 13.7 KB of request header. Node's default limit for the whole header is
    // 16 KB and a reverse proxy may be tighter, so this is the number that has to hold, not the
    // chunk count on its own.
    expect(sealed.length).toBeLessThan(14 * 1024);
  });

  const turn = (i: number, over: Partial<TurnRecord> = {}): TurnRecord => ({
    turn: i,
    studentInput: `Question number ${i}: ${'a long thing to ask about their symptoms '.repeat(3)}`,
    creditedItemIds: [],
    questionStyle: 'closed' as const,
    empathy: false,
    interrupted: false,
    jargon: false,
    ...over,
  });

  it('keeps every credited quote under real pressure, and drops flag-only text first', () => {
    // 60 worth-quoting turns against a 1200 character budget: the dropping loop has to run. The old
    // test sat ten characters under the budget, so removing the guard that protects credited quotes
    // did not fail it.
    const credited = Array.from({ length: 30 }, (_, i) => turn(i + 1, { creditedItemIds: [`item_${i}`] }));
    const flagged = Array.from({ length: 30 }, (_, i) => turn(i + 31, { jargon: true }));
    const stored = toStored('demo-cough', 1, { ...state, transcript: [...credited, ...flagged] }, [], 0);
    const kept = stored.transcript.filter((x) => x.c.length > 0);
    const flagOnly = stored.transcript.filter((x) => x.c.length === 0);
    expect(kept).toHaveLength(30);
    expect(flagOnly).toHaveLength(30);
    // Every mark still has its words; the flag-only turns are what gave way.
    expect(kept.every((x) => x.q !== '')).toBe(true);
    expect(flagOnly.some((x) => x.q === '')).toBe(true);
  });

  it('refuses a state too large to store rather than writing one a browser will reject', () => {
    const huge = 'x'.repeat(COOKIE_CHUNK_CHARS * MAX_COOKIE_CHUNKS + 1);
    expect(() => splitCookie(huge)).toThrow(SessionCookieError);
    // And the message says what the problem is, because a caller has to tell the candidate.
    expect(() => splitCookie(huge)).toThrow(/too large to store/);
  });
});
