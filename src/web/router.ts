import type { JudgeClient, PatientClient, ConversationTurn } from '../llm.js';
import type { PatientCase } from '../types.js';
import type { SafetyClient } from '../nebius/safetyClient.js';
import { appendTurn, runTurn } from '../orchestrator.js';
import { computeReport, type SessionReport } from '../report.js';
import { initialSessionState } from '../state.js';
import { packFor } from '../domains/index.js';
import { checkAccess, checkTurn, type WebLimits } from './limits.js';
import {
  joinCookieChunks,
  MAX_COOKIE_CHUNKS,
  openSession,
  sealSession,
  SessionCookieError,
  splitCookie,
  toSessionState,
  toStored,
  type StoredSession,
} from './sessionCookie.js';

export const SESSION_COOKIE = 'osce_station';

/** One station's clients, built per request so each station gets its own spending cap. */
export interface StationClients {
  judge: JudgeClient;
  patient: PatientClient;
  safety?: SafetyClient;
  /** What this request spent, read after the turn. */
  spentUsd(): number;
}

export interface WebDeps {
  limits: WebLimits;
  secret: string;
  /** The cases a visitor may start, by id. */
  cases: Record<string, PatientCase>;
  /** Null when the site is running without models: only the sample report is served. */
  clientsFor: ((remainingUsd: number) => StationClients) | null;
  now: () => number;
  /** A finished station to show anyone without a code. */
  sampleReport: () => { caseTitle: string; report: SessionReport; transcript: ConversationTurn[] };
}

interface JsonInit extends ResponseInit {
  /** One entry per set-cookie header: the state needs several, and an object header holds only one. */
  cookies?: readonly string[];
}

function json(body: unknown, init: JsonInit = {}): Response {
  const { cookies, ...rest } = init;
  const response = new Response(JSON.stringify(body), {
    ...rest,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers ?? {}) },
  });
  for (const cookie of cookies ?? []) response.headers.append('set-cookie', cookie);
  return response;
}

function oneCookie(name: string, value: string, maxAgeSeconds: number): string {
  // Lax is enough: every call is same-site from the page, and it keeps the cookie off other sites.
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAgeSeconds}`;
}

/**
 * The state is split across numbered cookies because one cookie cannot hold a whole station's
 * evidence. Chunks the session no longer needs are expired in the same response, so a shorter
 * session can never be read with a longer one's tail still attached.
 */
function cookieHeaders(value: string, maxAgeSeconds: number): string[] {
  // splitCookie throws when the state has outgrown what a browser will carry. Letting that escape
  // took the whole server down with it and lost a turn that had already been paid for, so the caller
  // handles it: see storeOrRefuse.
  const parts = splitCookie(value);
  const headers = parts.map((part, i) => oneCookie(`${SESSION_COOKIE}_${i}`, part, maxAgeSeconds));
  for (let i = parts.length; i < MAX_COOKIE_CHUNKS; i++) headers.push(oneCookie(`${SESSION_COOKIE}_${i}`, '', 0));
  return headers;
}


function readCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  const chunks = new Map<number, string>();
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    const match = /^osce_station_(\d+)$/.exec(name ?? '');
    if (match) chunks.set(Number(match[1]), rest.join('='));
  }
  return joinCookieChunks(chunks);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function secondsLeft(patientCase: PatientCase, stored: StoredSession, now: number): number {
  return Math.max(0, patientCase.durationSeconds - Math.floor((now - stored.startedAt) / 1000));
}

async function start(request: Request, deps: WebDeps): Promise<Response> {
  const input = await body(request);
  const refusal = checkAccess(deps.limits, text(input.code));
  if (refusal) return json({ error: refusal.message, reason: refusal.reason }, { status: 403 });
  if (!deps.clientsFor) return json({ error: 'This site is running without models right now.', reason: 'offline' }, { status: 503 });

  const caseId = text(input.caseId) || Object.keys(deps.cases)[0] || '';
  const patientCase = deps.cases[caseId];
  if (!patientCase) return json({ error: 'No such case.', reason: 'unknown_case' }, { status: 404 });

  const stored = toStored(patientCase.id, deps.now(), initialSessionState(), [], 0);
  return json(
    {
      caseId: patientCase.id,
      title: patientCase.title,
      brief: patientCase.candidateBrief,
      patientName: patientCase.patient.name,
      personNoun: packFor(patientCase.pack).personNoun,
      openingLine: patientCase.patient.openingLine,
      durationSeconds: patientCase.durationSeconds,
      secondsLeft: patientCase.durationSeconds,
      reviewStatus: patientCase.reviewStatus,
      maxTurns: deps.limits.maxTurns,
      maxInputChars: deps.limits.maxInputChars,
    },
    { cookies: cookieHeaders(sealSession(stored, deps.secret), patientCase.durationSeconds + 600) },
  );
}

/**
 * The cookies for a state, or null when it will not fit. Nothing here can silently drop evidence: a
 * state that cannot be stored is reported to the candidate, with the turn they just spent still
 * shown, rather than being written back in a form the browser would reject.
 */
function storeOrRefuse(stored: StoredSession, secret: string, maxAgeSeconds: number): string[] | null {
  try {
    return cookieHeaders(sealSession(stored, secret), maxAgeSeconds);
  } catch (e) {
    if (e instanceof SessionCookieError) return null;
    throw e;
  }
}

interface Station {
  stored: StoredSession;
  patientCase: PatientCase;
}

function station(request: Request, deps: WebDeps): Station | Response {
  const cookie = readCookie(request);
  if (!cookie) return json({ error: 'This station has not been started.', reason: 'no_session' }, { status: 401 });
  let stored: StoredSession;
  try {
    stored = openSession(cookie, deps.secret);
  } catch (e) {
    const message = e instanceof SessionCookieError ? 'This station could not be resumed. Please start again.' : 'Unexpected session error.';
    return json({ error: message, reason: 'bad_session' }, { status: 400 });
  }
  const patientCase = deps.cases[stored.caseId];
  if (!patientCase) return json({ error: 'That case is no longer available.', reason: 'unknown_case' }, { status: 410 });
  return { stored, patientCase };
}

async function turn(request: Request, deps: WebDeps): Promise<Response> {
  const found = station(request, deps);
  if (found instanceof Response) return found;
  const { stored, patientCase } = found;
  if (!deps.clientsFor) return json({ error: 'This site is running without models right now.', reason: 'offline' }, { status: 503 });

  const input = text((await body(request)).input);
  const left = secondsLeft(patientCase, stored, deps.now());
  const refusal = checkTurn(deps.limits, { secondsLeft: left, turnsUsed: stored.state.turnsUsed, spentUsd: stored.spentUsd, input });
  if (refusal) return json({ error: refusal.message, reason: refusal.reason, secondsLeft: left }, { status: 429 });

  const clients = deps.clientsFor(deps.limits.sessionBudgetUsd - stored.spentUsd);
  const history: ConversationTurn[] = stored.history.map((t) => ({ student: t.student, patient: t.patient }));
  let result;
  try {
    result = await runTurn(patientCase, toSessionState(stored), input.trim(), clients.judge, clients.patient, history, clients.safety);
  } catch {
    // The station is untouched, so the candidate can simply ask again.
    return json({ error: 'Something went wrong with the model, so nothing was recorded. Please ask again.', reason: 'model_error', secondsLeft: left }, { status: 502 });
  }

  const nextHistory = appendTurn(history, input.trim(), result);
  const next = toStored(patientCase.id, stored.startedAt, result.state, nextHistory, stored.spentUsd + clients.spentUsd());
  const cookies = storeOrRefuse(next, deps.secret, patientCase.durationSeconds + 600);
  if (cookies === null) {
    // The answer was paid for, so it is shown; the state is not written back, so the station stays
    // where it was and the candidate is told to finish rather than losing the report to a 431.
    return json(
      {
        reply: result.reply,
        paused: result.safetyBlocked,
        secondsLeft: secondsLeft(patientCase, stored, deps.now()),
        turnsUsed: stored.state.turnsUsed,
        maxTurns: deps.limits.maxTurns,
        error: 'This station has run too long to keep track of. Finish now to see the report for what you have covered so far.',
        reason: 'session_too_large',
      },
      { status: 200 },
    );
  }
  return json(
    {
      reply: result.reply,
      paused: result.safetyBlocked,
      secondsLeft: secondsLeft(patientCase, next, deps.now()),
      turnsUsed: next.state.turnsUsed,
      maxTurns: deps.limits.maxTurns,
    },
    { cookies },
  );
}

/**
 * The report does not clear the session. It used to, which meant it could be fetched exactly once:
 * the clock reaching zero and the candidate pressing Finish both call this, and whichever lost the
 * race got "This station has not been started" instead of the report. If rendering then failed, a
 * whole station's evidence was gone. The session expires on its own (Max-Age is the station's length
 * plus ten minutes) and spending is already capped per station, so nothing needs the session to be
 * destroyed here; asking twice returns the same report.
 */
async function report(request: Request, deps: WebDeps): Promise<Response> {
  const found = station(request, deps);
  if (found instanceof Response) return found;
  const { stored, patientCase } = found;
  const computed = computeReport(patientCase, toSessionState(stored));
  return json({ caseTitle: patientCase.title, reviewStatus: patientCase.reviewStatus, report: computed });
}

/**
 * What a visitor may choose from. Only the station's framing: never a fact, never the rubric,
 * and never the persona, which the patient model reads but the candidate should not.
 */
function cases(deps: WebDeps): Response {
  const list = Object.values(deps.cases).map((c) => {
    const pack = packFor(c.pack);
    return {
      id: c.id,
      title: c.title,
      brief: c.candidateBrief,
      minutes: Math.round(c.durationSeconds / 60),
      reviewStatus: c.reviewStatus,
      packLabel: pack.label,
      personNoun: pack.personNoun,
    };
  });
  return json({ cases: list.sort((a, b) => a.id.localeCompare(b.id)) });
}

/** The whole API. Anything not listed is a 404, including GET on a POST route. */
export async function handleApi(request: Request, deps: WebDeps): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/cases') return cases(deps);
  if (request.method === 'POST' && path === '/api/start') return start(request, deps);
  if (request.method === 'POST' && path === '/api/turn') return turn(request, deps);
  if (request.method === 'POST' && path === '/api/report') return report(request, deps);
  if (request.method === 'GET' && path === '/api/sample') return json(deps.sampleReport());
  return json({ error: 'Not found.', reason: 'not_found' }, { status: 404 });
}
