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

/** Guarded terms of every fact that is still locked, deduplicated case-insensitively, in case-file order. */
export function forbiddenTerms(patientCase: PatientCase, state: SessionState): string[] {
  // Dedupe by lowercase key, keeping first spelling encountered.
  const seenLower = new Map<string, string>();
  for (const fact of patientCase.facts) {
    if (isPublic(fact) || state.unlockedFactIds.includes(fact.id)) continue;
    for (const raw of fact.guardedTerms) {
      const term = raw.trim();
      if (term) {
        const lower = term.toLowerCase();
        if (!seenLower.has(lower)) {
          seenLower.set(lower, term);
        }
      }
    }
  }
  return Array.from(seenLower.values());
}

/**
 * Second line of defence: the patient never sees locked facts, but a model can still
 * guess. Single-pass scan for locked terms with whole-word matching (any case),
 * redacting all matches and reporting which were found.
 * Terms sorted longest-first to handle overlaps (e.g. 'lung cancer' before 'cancer').
 * Whitespace runs in terms are matched flexibly (multiple spaces, tabs, newlines).
 */
export function guardReply(reply: string, forbidden: readonly string[]): GuardResult {
  // Trim and dedupe case-insensitively, keeping first spelling of each lowercase variant.
  const dedupedMap = new Map<string, string>();
  const dedupedList: string[] = [];

  for (const raw of forbidden) {
    const term = raw.trim();
    if (term) {
      const lower = term.toLowerCase();
      if (!dedupedMap.has(lower)) {
        dedupedMap.set(lower, term);
        dedupedList.push(term);
      }
    }
  }

  // If no usable terms, return clean.
  if (dedupedList.length === 0) {
    return { ok: true, leaked: [], sanitized: reply };
  }

  // Sort by length descending (longest first, to match 'lung cancer' before 'cancer').
  const sortedTerms = [...dedupedList].sort((a, b) => b.length - a.length);

  // Build combined regex: one capturing group per term, wrapped in lookarounds.
  const alternatives = sortedTerms.map((term) => {
    const escaped = escapeRegExp(term);
    // Replace runs of whitespace with \s+ to match flexible spacing.
    const flexible = escaped.replace(/\s+/g, '\\s+');
    return `(${flexible})`;
  });

  const pattern = String.raw`(?<![\p{L}\p{N}_])` +
    `(?:${alternatives.join('|')})` +
    String.raw`(?![\p{L}\p{N}_])`;

  const regex = new RegExp(pattern, 'giu');

  // Single pass: track which terms (sorted) matched, then report in input order.
  const leakedSet = new Set<string>();

  const sanitized = reply.replace(regex, (...args: readonly unknown[]) => {
    // args = [fullMatch, group1, group2, ..., groupN, offset, string]
    // Extract groups (skip last two: offset and string).
    const groups = args.slice(1, -2);

    for (let i = 0; i < groups.length; i++) {
      if (groups[i] !== undefined && typeof groups[i] === 'string') {
        leakedSet.add(sortedTerms[i] as string);
        break;
      }
    }
    return REDACTION;
  });

  // Build leaked array in the order of the input forbidden, deduped.
  const leaked: string[] = [];
  const processedLower = new Set<string>();

  for (const raw of forbidden) {
    const term = raw.trim();
    if (term) {
      const lower = term.toLowerCase();
      if (!processedLower.has(lower)) {
        for (const matched of leakedSet) {
          if (matched.toLowerCase() === lower) {
            leaked.push(matched);
            processedLower.add(lower);
            break;
          }
        }
      }
    }
  }

  return { ok: leakedSet.size === 0, leaked, sanitized };
}
