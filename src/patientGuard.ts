import type { PatientCase, SessionState } from './types.js';
import { isPublic } from './gates.js';

export interface GuardResult {
  ok: boolean;
  leaked: string[];
  sanitized: string;
}

const REDACTION = '...';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalise terms: trim, drop empty, dedupe by lowercase + normalised spacing.
 * Keeps the first spelling of each unique term (case-insensitive, whitespace-insensitive).
 */
function normaliseTerms(terms: readonly string[]): string[] {
  const seenKey = new Map<string, string>();
  for (const raw of terms) {
    const term = raw.trim();
    if (term) {
      // Key: lowercase with runs of whitespace collapsed to single space.
      const key = term.toLowerCase().replace(/\s+/g, ' ');
      if (!seenKey.has(key)) {
        seenKey.set(key, term);
      }
    }
  }
  return Array.from(seenKey.values());
}

function buildMatcher(sortedTerms: readonly string[]): RegExp {
  const alternatives = sortedTerms.map((term) => {
    const escaped = escapeRegExp(term);
    // Replace runs of whitespace with \s+ for flexible spacing in the regex.
    const flexible = escaped.replace(/\s+/g, '\\s+');
    return `(${flexible})`;
  });

  const pattern = String.raw`(?<![\p{L}\p{N}_])` +
    `(?:${alternatives.join('|')})` +
    String.raw`(?![\p{L}\p{N}_])`;

  return new RegExp(pattern, 'giu');
}

/** Guarded terms of every fact that is still locked, deduplicated, in case-file order. */
export function forbiddenTerms(patientCase: PatientCase, state: SessionState): string[] {
  const allTerms: string[] = [];
  for (const fact of patientCase.facts) {
    if (isPublic(fact) || state.unlockedFactIds.includes(fact.id)) continue;
    allTerms.push(...fact.guardedTerms);
  }
  return normaliseTerms(allTerms);
}

interface Redaction {
  sanitized: string;
  matched: Set<string>;
}

/** One pass over the text: every match becomes REDACTION, and the matched terms are recorded. */
function redact(text: string, regex: RegExp, sortedTerms: readonly string[]): Redaction {
  const matched = new Set<string>();
  const sanitized = text.replace(regex, (...args: readonly unknown[]) => {
    // args = [fullMatch, group1, ..., groupN, offset, string]: one group per term, from index 1.
    const index = args.slice(1, 1 + sortedTerms.length).findIndex((group) => typeof group === 'string');
    if (index >= 0) matched.add(sortedTerms[index] as string);
    return REDACTION;
  });
  return { sanitized, matched };
}

/**
 * Folds fullwidth and other compatibility forms (NFKC) and drops zero-width characters and soft
 * hyphens, so "ｃａｎｃｅｒ" and "can\u200Bcer" are matched like "cancer".
 */
function foldReply(reply: string): string {
  return reply.normalize('NFKC').replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '');
}

/**
 * Second line of defence: the patient never sees locked facts, but a model can still
 * guess. Single-pass scan for locked terms with whole-word matching (any case),
 * redacting all matches and reporting which were found.
 * Terms sorted longest-first to handle overlaps (e.g. 'lung cancer' before 'cancer').
 * Whitespace runs in terms are matched flexibly (multiple spaces, tabs, newlines).
 */
export function guardReply(reply: string, forbidden: readonly string[]): GuardResult {
  const normalised = normaliseTerms(forbidden);

  if (normalised.length === 0) {
    return { ok: true, leaked: [], sanitized: reply };
  }

  // Sort by length descending (longest first, to match 'lung cancer' before 'cancer').
  const sortedTerms = [...normalised].sort((a, b) => b.length - a.length);
  const regex = buildMatcher(sortedTerms);

  // Keep the original wording (so "2²" or "…" next to a redaction keep their meaning) only when
  // nothing is left once the redacted text is folded. Otherwise redact the folded text, so a hidden
  // copy such as a zero-width "bl-ood" next to a plain "blood" never stays on screen.
  const original = redact(reply, regex, sortedTerms);
  const residue = redact(foldReply(original.sanitized), regex, sortedTerms).matched.size;
  const chosen = residue === 0 ? original : redact(foldReply(reply), regex, sortedTerms);
  const leaked = normalised.filter((term) => chosen.matched.has(term));
  return { ok: chosen.matched.size === 0, leaked, sanitized: chosen.sanitized };
}
