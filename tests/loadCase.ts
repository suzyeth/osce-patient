import { readFileSync } from 'node:fs';
import { parseCase, type PatientCase } from '../src/types.js';

const DEMO = new URL('../cases/demo-cough.json', import.meta.url);

/** Raw JSON of the demo case, for tests that need to break it. */
export function loadDemoRaw(): Record<string, unknown> {
  return JSON.parse(readFileSync(DEMO, 'utf8')) as Record<string, unknown>;
}

export function loadDemoCase(): PatientCase {
  return parseCase(loadDemoRaw());
}
