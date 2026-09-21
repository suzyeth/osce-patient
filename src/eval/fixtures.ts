import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PatientCase } from '../types.js';

/** Candidate lines with the rubric items a careful examiner would tick for each, judged one at a time. */
export const JudgeLinesSchema = z.object({
  caseId: z.string().min(1),
  /** Who wrote the labels. These are author labels, not the human-agreement set. */
  labelledBy: z.string().min(1),
  lines: z
    .array(
      z.object({
        text: z.string().min(1),
        expected: z.array(z.string()),
        /** paraphrase: another way to ask a rubric item; off_topic and injection expect nothing. */
        kind: z.enum(['paraphrase', 'off_topic', 'injection']),
      }),
    )
    .min(1),
});
export type JudgeLines = z.infer<typeof JudgeLinesSchema>;

/** The Plan 1 blind set: lines that must not be blocked, ambiguous ones, and real disclosures. */
export const SafetySetSchema = z.object({
  candidate: z.array(z.string().min(1)).min(1),
  borderline: z.array(z.string().min(1)),
  disclosure: z.array(z.string().min(1)).min(1),
});
export type SafetySet = z.infer<typeof SafetySetSchema>;

/** Case-independent attempts to get locked facts out without asking the right questions. */
export const AttackSetSchema = z.object({
  attacks: z
    .array(z.object({ id: z.string().min(1), category: z.string().min(1), text: z.string().min(1) }))
    .min(1),
});
export type AttackSet = z.infer<typeof AttackSetSchema>;

/** Questions about things the case file says nothing about, to measure invented answers. */
export const OffCaseProbesSchema = z.object({
  caseId: z.string().min(1),
  questions: z.array(z.string().min(1)).min(1),
});
export type OffCaseProbes = z.infer<typeof OffCaseProbesSchema>;

export type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

/** Reads a JSON fixture and checks its shape, turning every problem into one readable message. */
export function loadFixture<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Loaded<T> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    const reason = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (e as Error).message;
    return { ok: false, message: `Cannot read ${path}: ${reason}` };
  }
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, message: `Invalid JSON in ${path}: ${(e as Error).message}` };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    return { ok: false, message: [`${path} does not match the expected format:`, ...issues].join('\n') };
  }
  return { ok: true, value: parsed.data };
}

/** A fixture written for one case must name that case and only use its rubric ids. */
export function checkAgainstCase(fixture: { caseId: string; lines?: JudgeLines['lines'] }, patientCase: PatientCase): string[] {
  const errors: string[] = [];
  if (fixture.caseId !== patientCase.id) {
    errors.push(`fixture is for case ${fixture.caseId}, not ${patientCase.id}`);
  }
  const known = new Set(patientCase.rubric.map((r) => r.id));
  for (const [i, line] of (fixture.lines ?? []).entries()) {
    for (const id of line.expected) {
      if (!known.has(id)) errors.push(`line ${i + 1} expects unknown rubric item "${id}"`);
    }
    if (line.kind === 'paraphrase' && line.expected.length === 0) {
      errors.push(`line ${i + 1} is a paraphrase but expects no rubric item`);
    }
    if (line.kind !== 'paraphrase' && line.expected.length > 0) {
      errors.push(`line ${i + 1} is ${line.kind} but expects rubric items`);
    }
  }
  return errors;
}
