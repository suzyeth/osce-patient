import type { Fact, PatientCase } from './types.js';
import { guardReply } from './patientGuard.js';
import { buildPatientContext } from './patientContext.js';
import { initialSessionState, INITIAL_TRUST, MAX_TRUST_DELTA } from './state.js';

export interface CaseIssues {
  errors: string[];
  warnings: string[];
}

/** Same matcher as the runtime output guard, so authoring checks and redaction agree. */
function containsTerm(text: string, term: string): boolean {
  return guardReply(text, [term]).leaked.length > 0;
}

function duplicateRubricIds(c: PatientCase): string[] {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const r of c.rubric) {
    if (seen.has(r.id)) errors.push(`duplicate rubric id: ${r.id}`);
    seen.add(r.id);
  }
  return errors;
}

function factReferenceErrors(c: PatientCase): string[] {
  const rubricIds = new Set(c.rubric.map((r) => r.id));
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const f of c.facts) {
    if (seen.has(f.id)) errors.push(`duplicate fact id: ${f.id}`);
    seen.add(f.id);
    if (!rubricIds.has(f.rubricItemId)) errors.push(`fact ${f.id} points to unknown rubric item ${f.rubricItemId}`);
  }
  return errors;
}

/** A blank offline cue matches every question, and a blank guarded term protects nothing. */
function blankEntryErrors(c: PatientCase): string[] {
  const cues = c.rubric
    .filter((r) => r.offlineCues.some((cue) => cue.trim() === ''))
    .map((r) => `rubric item ${r.id} has a blank offline cue, which would match every question`);
  const terms = c.facts
    .filter((f) => f.guardedTerms.some((t) => t.trim() === ''))
    .map((f) => `fact ${f.id} has a blank guarded term`);
  return [...cues, ...terms];
}

/** The global judgement is scored on data gathering and interpersonal skills, so both need items. */
function scoredDomainErrors(c: PatientCase): string[] {
  return (['data_gathering', 'interpersonal'] as const)
    .filter((d) => !c.rubric.some((r) => r.domain === d))
    .map((d) => `rubric has no ${d} items, so the global judgement cannot score it`);
}

/**
 * A concern the starting trust plus one turn of rapport can reach unlocks on the first turn.
 * The offline judge always adds some trust, and the model judge can add up to MAX_TRUST_DELTA.
 */
function earlyConcernErrors(c: PatientCase): string[] {
  const firstTurnReach = INITIAL_TRUST + MAX_TRUST_DELTA;
  return c.facts
    .filter((f) => f.kind === 'concern' && f.minTrust !== undefined && f.minTrust <= firstTurnReach)
    .map(
      (f) =>
        `concern fact ${f.id} has minTrust ${f.minTrust}, which the starting trust of ${INITIAL_TRUST} plus one turn (up to +${MAX_TRUST_DELTA}) can reach, so it can unlock on the first turn`,
    );
}

/**
 * Worst case for a locked fact: every other fact unlocked, at every trust level. If one of its
 * guarded terms is anywhere in the patient prompt (persona, fixed instructions, another fact),
 * the patient model can say it before the candidate has earned it.
 */
function promptLeakErrors(c: PatientCase): string[] {
  const errors: string[] = [];
  for (const locked of c.facts.filter((f) => f.kind !== 'presenting')) {
    const unlockedFactIds = c.facts.filter((f) => f.id !== locked.id).map((f) => f.id);
    const leaked = new Set<string>();
    for (let trust = 0; trust <= 100; trust += 1) {
      const prompt = buildPatientContext(c, { ...initialSessionState(), trust, unlockedFactIds });
      for (const term of guardReply(prompt, locked.guardedTerms).leaked) leaked.add(term);
    }
    for (const term of leaked) {
      errors.push(`guarded term "${term}" of ${locked.id} is in the patient prompt while ${locked.id} is locked`);
    }
  }
  return errors;
}

const OVERLAP_WORDS = 4;

interface TextSource {
  label: string;
  text: string;
  factId?: string;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Every run of OVERLAP_WORDS words with at least two longer words, so "and I am the" is ignored. */
function phrases(text: string): string[] {
  const w = words(text);
  const out: string[] = [];
  for (let i = 0; i + OVERLAP_WORDS <= w.length; i += 1) {
    const window = w.slice(i, i + OVERLAP_WORDS);
    if (window.filter((x) => x.length >= 4).length >= 2) out.push(window.join(' '));
  }
  return out;
}

/**
 * Guarded terms only catch exact words. If a locked fact's own wording also appears in text the
 * patient can see while it is locked, the patient can say it before it is earned: "a streak of
 * blood" in the presenting complaint gives away a red flag guarded only by "haemoptysis".
 * Paraphrases ("a malignant growth") are not caught here; Plan 2's case pipeline checks those.
 */
function contentOverlapErrors(c: PatientCase): string[] {
  const sources: TextSource[] = [
    { label: 'the persona', text: c.patient.persona },
    { label: 'the opening line', text: c.patient.openingLine },
    { label: 'the candidate brief', text: c.candidateBrief },
    ...c.facts.map((f) => ({ label: `fact ${f.id}`, text: f.text, factId: f.id })),
  ];
  const errors: string[] = [];
  for (const locked of c.facts.filter((f) => f.kind !== 'presenting')) {
    const own = new Set(phrases(locked.text));
    for (const source of sources.filter((s) => s.factId !== locked.id)) {
      const shared = phrases(source.text).find((p) => own.has(p));
      if (shared) {
        errors.push(`text of ${locked.id} shares "${shared}" with ${source.label}, so the patient could say it while ${locked.id} is locked`);
      }
    }
  }
  return errors;
}

/** Public text outside the patient prompt: the opening line the patient speaks and the candidate brief. */
function openingTextErrors(c: PatientCase): string[] {
  const text = [c.patient.openingLine, c.candidateBrief].join('\n');
  return c.facts
    .filter((f) => f.kind !== 'presenting')
    .flatMap((f) =>
      f.guardedTerms
        .filter((term) => containsTerm(text, term))
        .map((term) => `guarded term "${term}" of ${f.id} appears in the opening line or candidate brief`),
    );
}

function factWarnings(c: PatientCase, f: Fact): string[] {
  const warnings: string[] = [];
  if (f.kind === 'concern' && f.minTrust === undefined) {
    warnings.push(`concern fact ${f.id} has no minTrust, so it only unlocks when asked`);
  }
  if (f.kind === 'red_flag' && !c.rubric.find((r) => r.id === f.rubricItemId)?.critical) {
    warnings.push(`red flag fact ${f.id} is scored by a non-critical rubric item`);
  }
  if (f.kind !== 'presenting' && f.guardedTerms.length === 0) {
    warnings.push(`fact ${f.id} has no guarded terms, so the output guard cannot protect it`);
  }
  if (f.kind !== 'concern' && f.minTrust !== undefined) {
    warnings.push(`minTrust on non-concern fact ${f.id} has no effect`);
  }
  if (f.kind !== 'presenting' && f.guardedTerms.length > 0 && !f.guardedTerms.some((t) => containsTerm(f.text, t))) {
    warnings.push(`none of the guarded terms of ${f.id} appear in its own text, so the guard may not catch the patient repeating it`);
  }
  if (f.kind === 'presenting' && f.guardedTerms.length > 0) {
    warnings.push(`guarded terms on presenting fact ${f.id} have no effect, because presenting facts are always public`);
  }
  return warnings;
}

/** Authoring checks that the schema cannot express. Errors block use; warnings are advice. */
export function validateCase(c: PatientCase): CaseIssues {
  const errors = [
    ...duplicateRubricIds(c),
    ...factReferenceErrors(c),
    ...blankEntryErrors(c),
    ...scoredDomainErrors(c),
    ...earlyConcernErrors(c),
    ...promptLeakErrors(c),
    ...contentOverlapErrors(c),
    ...openingTextErrors(c),
  ];
  const warnings = c.facts.flatMap((f) => factWarnings(c, f));
  if (c.rubric.some((r) => r.critical) && !c.facts.some((f) => f.kind === 'red_flag')) {
    warnings.push('case has a critical rubric item but no red flag fact');
  }
  return { errors, warnings };
}
