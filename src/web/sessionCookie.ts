import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ConversationTurn } from '../llm.js';
import type { SessionState, TurnRecord } from '../types.js';

/**
 * A station's state lives in one encrypted cookie, so the server keeps nothing between requests
 * and the tool needs no database. Encryption, not just signing: the state names the facts a
 * candidate has unlocked, and the browser has no business reading or editing that.
 */
export const StoredSessionSchema = z.object({
  caseId: z.string().min(1),
  /** Epoch milliseconds when the station started; the clock is server-side. */
  startedAt: z.number().int().positive(),
  state: z.object({
    trust: z.number(),
    unlockedFactIds: z.array(z.string()),
    rubricHits: z.record(z.number()),
    turnsUsed: z.number().int().min(0),
    interruptions: z.number().int().min(0),
    jargonCount: z.number().int().min(0),
    empathyCount: z.number().int().min(0),
  }),
  /**
   * Enough of each turn to quote the words a mark rests on. The keys are one letter and the three
   * flags are one number because this has to survive a whole station inside a 4 KB cookie: t turn,
   * q the student's words, c the items credited, s the question style, f the flags. See storedTurns.
   */
  transcript: z.array(
    z.object({
      t: z.number().int().positive(),
      q: z.string(),
      c: z.array(z.string()),
      s: z.enum(['open', 'closed', 'leading', 'none']),
      f: z.number().int().min(0).max(7),
    }),
  ),
  /** Only what the models need: the patient sees eight turns, the judge six. */
  history: z.array(z.object({ student: z.string(), patient: z.string() })),
  /** How much this session has spent, to enforce a per-session cap across requests. */
  spentUsd: z.number().min(0),
});
export type StoredSession = z.infer<typeof StoredSessionSchema>;

export class SessionCookieError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionCookieError';
  }
}

const HISTORY_TURNS = 8;
const VERSION = 'v2';
const IV_BYTES = 12;

/**
 * A cookie holds about 4 KB and this state has to survive a whole station, so the transcript is
 * kept down three ways. Only turns the report can say something about are stored at all: one that
 * earned an item, or one flagged for jargon, an interruption or empathy. Each quote is trimmed.
 * And if the total text is still over budget, the flag-only quotes lose their text first, because
 * an item's quote is the evidence for a mark and must not be the thing that goes.
 *
 * A dropped turn is not a lost mark: the marks live in rubricHits and the count in turnsUsed. What
 * is lost is a quote for a turn that earned nothing, which the report would never print.
 */
const QUOTE_MAX = 120;
const QUOTE_MIN = 40;
const TRANSCRIPT_TEXT_BUDGET = 1600;
const FLAG = { empathy: 1, interrupted: 2, jargon: 4 } as const;

function trim(text: string, limit: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

export type StoredTurn = StoredSession['transcript'][number];

export function storedTurns(transcript: readonly TurnRecord[]): StoredTurn[] {
  const flagsOf = (t: TurnRecord): number =>
    (t.empathy ? FLAG.empathy : 0) + (t.interrupted ? FLAG.interrupted : 0) + (t.jargon ? FLAG.jargon : 0);
  const worth = transcript.filter((t) => t.creditedItemIds.length > 0 || flagsOf(t) !== 0);
  // Every quote gets an equal share of the budget, so a long station shortens all of them rather
  // than keeping the first few whole and losing the rest.
  const share = worth.length === 0 ? QUOTE_MAX : Math.max(QUOTE_MIN, Math.floor(TRANSCRIPT_TEXT_BUDGET / worth.length));
  const limit = Math.min(QUOTE_MAX, share);
  const kept = worth.map((t) => ({
    t: t.turn,
    q: trim(t.studentInput, limit),
    c: [...t.creditedItemIds],
    s: t.questionStyle,
    f: flagsOf(t),
  }));
  let total = kept.reduce((n, x) => n + x.q.length, 0);
  for (const x of kept) {
    if (total <= TRANSCRIPT_TEXT_BUDGET) break;
    if (x.c.length === 0 && x.q !== '') {
      total -= x.q.length;
      x.q = '';
    }
  }
  return kept;
}

function toTurnRecord(x: StoredTurn): TurnRecord {
  return {
    turn: x.t,
    studentInput: x.q,
    creditedItemIds: [...x.c],
    questionStyle: x.s,
    empathy: (x.f & FLAG.empathy) !== 0,
    interrupted: (x.f & FLAG.interrupted) !== 0,
    jargon: (x.f & FLAG.jargon) !== 0,
  };
}

/** A key derived once per secret; scrypt is deliberate about the cost of a guessed secret. */
function keyFor(secret: string): Buffer {
  if (secret.length < 16) throw new SessionCookieError('the session secret must be at least 16 characters');
  return scryptSync(secret, 'osce-session-v1', 32);
}

export function toStored(caseId: string, startedAt: number, state: SessionState, history: readonly ConversationTurn[], spentUsd: number): StoredSession {
  return {
    caseId,
    startedAt,
    state: {
      trust: state.trust,
      unlockedFactIds: [...state.unlockedFactIds],
      rubricHits: { ...state.rubricHits },
      turnsUsed: state.turnsUsed,
      interruptions: state.interruptions,
      jargonCount: state.jargonCount,
      empathyCount: state.empathyCount,
    },
    transcript: storedTurns(state.transcript),
    history: history.slice(-HISTORY_TURNS).map((t) => ({ student: t.student, patient: t.patient })),
    spentUsd,
  };
}

/** AES-256-GCM, so a changed byte fails to decrypt rather than yielding altered state. */
export function sealSession(session: StoredSession, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), body.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function openSession(cookie: string, secret: string): StoredSession {
  const parts = cookie.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SessionCookieError('the session cookie is not in the expected format');
  const [, ivText, bodyText, tagText] = parts as [string, string, string, string];
  let json: string;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    json = Buffer.concat([decipher.update(Buffer.from(bodyText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new SessionCookieError('the session cookie could not be read; it was changed or signed with another secret');
  }
  const parsed = StoredSessionSchema.safeParse(JSON.parse(json));
  if (!parsed.success) throw new SessionCookieError('the session cookie holds a state this version does not understand');
  return parsed.data;
}

/** Restores the engine's own state shape from what was stored. */
export function toSessionState(stored: StoredSession): SessionState {
  return {
    trust: stored.state.trust,
    unlockedFactIds: [...stored.state.unlockedFactIds],
    rubricHits: { ...stored.state.rubricHits },
    turnsUsed: stored.state.turnsUsed,
    interruptions: stored.state.interruptions,
    jargonCount: stored.state.jargonCount,
    empathyCount: stored.state.empathyCount,
    transcript: stored.transcript.map(toTurnRecord),
  };
}

/** Constant-time compare for the judge code, so the page cannot be used as an oracle. */
export function codeMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A browser only guarantees about 4 KB per cookie, and a whole station's evidence can exceed that:
 * forty questions, each with the words that earned a mark. So the sealed value is split across
 * numbered cookies and put back together on the way in. Splitting keeps the evidence; the
 * alternative was to throw away the quotes that make a mark checkable.
 */
export const COOKIE_CHUNK_CHARS = 3400;
export const MAX_COOKIE_CHUNKS = 6;

export function splitCookie(value: string): string[] {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += COOKIE_CHUNK_CHARS) parts.push(value.slice(i, i + COOKIE_CHUNK_CHARS));
  if (parts.length === 0) parts.push('');
  if (parts.length > MAX_COOKIE_CHUNKS) {
    throw new SessionCookieError(`the session is too large to store: ${parts.length} cookies needed`);
  }
  return parts;
}

/** Joins the numbered chunks, in order, stopping at the first gap so a stale tail cannot corrupt it. */
export function joinCookieChunks(chunks: ReadonlyMap<number, string>): string | null {
  const parts: string[] = [];
  for (let i = 0; i < MAX_COOKIE_CHUNKS; i++) {
    const part = chunks.get(i);
    if (part === undefined) break;
    parts.push(part);
  }
  return parts.length === 0 ? null : parts.join('');
}
