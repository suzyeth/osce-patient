import { readFileSync } from 'node:fs';
import { PatientCaseSchema, type PatientCase } from '../types.js';

export type LoadResult = { ok: true; patientCase: PatientCase } | { ok: false; message: string };

function readText(path: string): string | { ok: false; message: string } {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    const reason = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (e as Error).message;
    return { ok: false, message: `Cannot read case file ${path}: ${reason}` };
  }
}

function parseJson(path: string, text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    // Some Windows editors save a byte-order mark, which JSON.parse rejects.
    return { ok: true, value: JSON.parse(text.replace(/^\uFEFF/, '')) as unknown };
  } catch (e) {
    return { ok: false, message: `Invalid JSON in ${path}: ${(e as Error).message}` };
  }
}

/** Reads and parses a case file, turning file, JSON and schema problems into one readable message. */
export function loadCaseFile(path: string): LoadResult {
  const text = readText(path);
  if (typeof text !== 'string') return text;
  const json = parseJson(path, text);
  if (!json.ok) return json;
  const parsed = PatientCaseSchema.safeParse(json.value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    return { ok: false, message: [`Case file ${path} does not match the case format:`, ...issues].join('\n') };
  }
  return { ok: true, patientCase: parsed.data };
}
