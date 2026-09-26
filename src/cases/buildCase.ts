import { parseCase, type Fact, type PatientCase, type RubricItem } from '../types.js';
import { validateCase } from '../validateCase.js';
import type { DraftCase, DraftFact } from './extract.js';
import { knownIds } from './extract.js';
import { namesDiagnosis, redFlagHint, redFlagItem, redFlagItemFor, rubricFor } from './rubric.js';
import { checkQuote, citation, type Transcript } from './transcript.js';

/** Why a proposed fact did not make it into the case. Every rejection is reported, never hidden. */
export interface RejectedFact {
  fact: DraftFact;
  reason: string;
}

export interface BuiltCase {
  patientCase: PatientCase;
  rejected: RejectedFact[];
  /** Things a person should look at: dropped guarded terms, missed red flags, checker warnings. */
  warnings: string[];
}

export interface BuildFailure {
  ok: false;
  message: string;
  rejected: RejectedFact[];
}

const DURATION_SECONDS = 480;
const CONCERN_MIN_TRUST = 60;

/**
 * Everything a candidate reads or hears before asking anything: the brief, the persona, the
 * opening line and the presenting complaint. A guarded term that appears there protects nothing,
 * and the Plan 1 case checker rejects the case for it, so such terms are dropped and reported.
 */
function publicText(draft: DraftCase): string {
  const presenting = draft.facts.filter((f) => f.kind === 'presenting').map((f) => f.text);
  return [draft.presentingProblem, draft.patient.persona, draft.patient.openingLine, ...presenting].join(' ').toLowerCase();
}

/**
 * A guarded term only works if it belongs to one fact alone: the case checker refuses a term that
 * shows up in the patient's prompt while its own fact is locked, and any other fact's words can be
 * in that prompt. Everything dropped is reported rather than quietly removed.
 */
function guardedTermsIn(fact: DraftFact, all: readonly DraftFact[], exposed: string, notes: string[]): string[] {
  const text = fact.text.toLowerCase();
  const elsewhere = all.filter((f) => f !== fact).map((f) => f.text.toLowerCase());
  const own = fact.guardedTerms.map((t) => t.trim()).filter((t) => t.length > 2 && text.includes(t.toLowerCase()));
  const kept: string[] = [];
  for (const term of own) {
    const lower = term.toLowerCase();
    if (exposed.includes(lower)) {
      notes.push(`"${term}" is already in what the candidate is told before asking, so it cannot be guarded`);
    } else if (elsewhere.some((other) => other.includes(lower))) {
      notes.push(`"${term}" appears in another fact too, so guarding it would hide that one as well`);
    } else {
      kept.push(term);
    }
  }
  return [...new Set(kept)];
}

function factId(fact: DraftFact, index: number): string {
  const base = fact.rubricItemId.replace(/[^a-z0-9_]/gi, '').slice(0, 20) || 'fact';
  return `f_${base}_${index + 1}`;
}

/**
 * Turns a draft into a case, keeping only facts whose quote is really in the transcript, on the
 * line they claim, said by the patient. This is the step that makes an invented fact impossible
 * to publish: the model's word is never enough.
 */
export function buildCase(draft: DraftCase, transcript: Transcript, caseId: string): BuiltCase | BuildFailure {
  const rejected: RejectedFact[] = [];
  const notes: string[] = [];
  const exposed = publicText(draft);
  const ids = knownIds(draft);
  const kept: Array<{ draft: DraftFact; fact: Fact }> = [];

  for (const [index, fact] of draft.facts.entries()) {
    if (!ids.has(fact.rubricItemId)) {
      rejected.push({ fact, reason: `no rubric item called "${fact.rubricItemId}"` });
      continue;
    }
    const quote = checkQuote(transcript, fact.quote, fact.line);
    if (!quote.ok) {
      rejected.push({ fact, reason: quote.problem ?? 'the quote could not be checked' });
      continue;
    }
    kept.push({
      draft: fact,
      fact: {
        id: factId(fact, index),
        kind: fact.kind,
        rubricItemId: fact.rubricItemId,
        text: fact.text,
        guardedTerms: guardedTermsIn(fact, draft.facts, exposed, notes),
        ...(fact.kind === 'concern' ? { minTrust: CONCERN_MIN_TRUST } : {}),
        source: { dataset: 'fareez2022', ref: citation(transcript, fact.line), quote: fact.quote },
      },
    });
  }

  const presenting = kept.filter((k) => k.fact.kind === 'presenting');
  if (presenting.length === 0) return { ok: false, message: 'no presenting complaint survived the quote check', rejected };
  // Exactly one presenting fact: the rest become ordinary history.
  for (const extra of presenting.slice(1)) extra.fact = { ...extra.fact, kind: 'history' };

  // Red flags are not left to the model: a fact whose words match the red-flag list becomes one,
  // with the standard item for it. The model's own red flags are kept too. Every promotion is
  // reported, because a person still has to agree it is one.
  const promoted = new Map<string, RubricItem>();
  for (const entry of kept) {
    const reason = redFlagHint(entry.fact.text);
    if (!reason) continue;
    const item = redFlagItemFor(reason);
    if (!item) continue;
    if (entry.fact.kind !== 'red_flag' || entry.fact.rubricItemId !== item.id) {
      notes.push(`${entry.fact.id} mentions ${reason}, so it became the red-flag item "${item.label}"; check that this case really needs it`);
    }
    entry.fact = { ...entry.fact, kind: 'red_flag', rubricItemId: item.id };
    promoted.set(item.id, item);
  }

  const fromModel = draft.redFlags
    .filter((r) => kept.some((k) => k.fact.rubricItemId === r.id) && !promoted.has(r.id))
    .map((r) => redFlagItem(r.id, r.label, r.exampleQuestion, [r.label.toLowerCase().replace(/^asks about\s+/, '')]));
  const rubric: RubricItem[] = rubricFor([...promoted.values(), ...fromModel]);

  const candidateBrief = [
    `You are a doctor in a GP surgery. ${draft.patient.name}, ${draft.patient.age}, has come in about ${draft.presentingProblem}.`,
    'Take a focused history. You have 8 minutes.',
  ].join(' ');

  const patientCase = parseCase({
    id: caseId,
    title: draft.title,
    candidateBrief,
    durationSeconds: DURATION_SECONDS,
    reviewStatus: 'unreviewed',
    patient: draft.patient,
    rubric,
    facts: kept.map((k) => k.fact),
  });

  // The persona and the opening line reach the patient model before anything is asked, so a locked
  // fact's wording there hands it over for free. Both sides are reduced to their longer words, so
  // "coughed up a streak of blood" still matches "coughed a streak of blood last week".
  const keyWords = (text: string) => text.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 3);
  const upFront = keyWords(`${draft.patient.persona} ${draft.patient.openingLine}`).join(' ');
  for (const { fact } of kept) {
    if (fact.kind === 'presenting') continue;
    const words = keyWords(fact.text);
    for (let i = 0; i + 2 < words.length; i += 1) {
      const run = words.slice(i, i + 3).join(' ');
      if (upFront.includes(run)) {
        notes.push(`the persona or opening line says "${run}", which belongs to the locked fact ${fact.id}`);
        break;
      }
    }
  }

  for (const { fact } of kept) {
    if (namesDiagnosis(fact.text)) {
      notes.push(`${fact.id} has the patient naming a diagnosis; keep it only if the transcript really does, and consider rewording it as a symptom`);
    }
  }

  const { errors, warnings } = validateCase(patientCase);
  if (errors.length) return { ok: false, message: `the built case does not validate:\n  ${errors.join('\n  ')}`, rejected };
  return { patientCase, rejected, warnings: [...notes, ...warnings] };
}

/**
 * The sheet a person checks: every fact beside the words it came from, so the check needs no
 * medical knowledge, only a reading of the transcript.
 */
export function reviewSheet(built: BuiltCase, transcript: Transcript, unusable: readonly string[] = []): string {
  const lines = [
    `# Review sheet: ${built.patientCase.id}`,
    '',
    `Source: ${transcript.ref} (Fareez et al. 2022, CC0). Case is marked **unreviewed**: no clinician has seen it.`,
    '',
    `Patient: ${built.patientCase.patient.name}, ${built.patientCase.patient.age}. ${built.patientCase.patient.persona}`,
    '',
    `Brief: ${built.patientCase.candidateBrief}`,
    '',
    '## Check each fact against the words it came from',
    '',
    'Tick when the fact says nothing the quote does not say. Cross anything added, sharpened or guessed.',
    '',
    '| | Fact the patient may say | Their words in the transcript | Line |',
    '|---|---|---|---|',
  ];
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  for (const fact of built.patientCase.facts) {
    const line = fact.source.ref.split('#L')[1] ?? '?';
    lines.push(`| [ ] | ${cell(fact.text)} | ${cell(fact.source.quote)} | ${line} |`);
  }
  lines.push('', '## What the tool threw away', '');
  if (built.rejected.length === 0) {
    lines.push('Nothing: every proposed fact was found in the transcript.');
  } else {
    lines.push('| Proposed fact | Why it was dropped |', '|---|---|');
    for (const { fact, reason } of built.rejected) lines.push(`| ${cell(fact.text)} | ${reason} |`);
  }
  if (unusable.length) {
    lines.push('', '## Entries this version could not read', '');
    for (const note of unusable) lines.push(`- ${note}`);
  }
  if (built.warnings.length) {
    lines.push('', '## Worth a second look', '');
    for (const warning of built.warnings) lines.push(`- ${warning}`);
  }
  lines.push(
    '',
    '## Still to do by hand',
    '',
    '- [ ] Add the concern (ideas, concerns, expectations) if the transcript has none, and mark it as authored.',
    '- [ ] Check the red flags against an NHS page and add the link to the case notes.',
    '- [ ] Read the opening line aloud: does it sound like a person?',
  );
  return lines.join('\n') + '\n';
}
