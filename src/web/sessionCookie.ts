import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ConversationTurn } from '../llm.js';
import type { SessionState } from '../types.js';

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
const VERSION = 'v1';
const IV_BYTES = 12;

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
  };
}

/** Constant-time compare for the judge code, so the page cannot be used as an oracle. */
export function codeMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
