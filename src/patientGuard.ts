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

function wholeWord(term: string): RegExp {
  // Use lookarounds instead of \b to handle terms with punctuation.
  // String.raw preserves backslashes so \p{...} reaches the regex engine intact.
  // The 'u' flag enables \p{...} for Unicode character classes.
  // The 'i' flag makes matching case-insensitive.
  const escaped = escapeRegExp(term);
  const pattern = String.raw`(?<![\p{L}\p{N}_])` + escaped + String.raw`(?![\p{L}\p{N}_])`;
  return new RegExp(pattern, 'giu');
}

/** Guarded terms of every fact that is still locked, deduplicated, in case-file order. */
export function forbiddenTerms(patientCase: PatientCase, state: SessionState): string[] {
  const seen = new Set<string>();
  for (const fact of patientCase.facts) {
    if (isPublic(fact) || state.unlockedFactIds.includes(fact.id)) continue;
    for (const raw of fact.guardedTerms) {
      const term = raw.trim();
      if (term) seen.add(term);
    }
  }
  return [...seen];
}

/**
 * Second line of defence: the patient never sees locked facts, but a model can still
 * guess. Any locked term in the reply is reported and redacted (whole word, any case).
 */
export function guardReply(reply: string, forbidden: readonly string[]): GuardResult {
  const leaked: string[] = [];
  let sanitized = reply;
  for (const raw of forbidden) {
    const term = raw.trim();
    if (!term) continue;
    if (wholeWord(term).test(sanitized)) {
      leaked.push(term);
      sanitized = sanitized.replace(wholeWord(term), REDACTION);
    }
  }
  return { ok: leaked.length === 0, leaked, sanitized };
}
