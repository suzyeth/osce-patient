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

  // Single pass: track which terms (in sorted order) matched.
  const matched = new Set<string>();

  const sanitized = reply.replace(regex, (...args: readonly unknown[]) => {
    // args = [fullMatch, group1, group2, ..., groupN, offset, string]
    // Extract groups: exactly sortedTerms.length groups, starting at index 1.
    const groups = args.slice(1, 1 + sortedTerms.length);

    for (let i = 0; i < groups.length; i++) {
      if (groups[i] !== undefined && typeof groups[i] === 'string') {
        matched.add(sortedTerms[i] as string);
        break;
      }
    }
    return REDACTION;
  });

  const leaked = normalised.filter((t) => matched.has(t));

  return { ok: matched.size === 0, leaked, sanitized };
}
