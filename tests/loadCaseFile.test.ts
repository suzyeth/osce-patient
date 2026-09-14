import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCaseFile } from '../src/cli/loadCaseFile.js';
import { loadDemoRaw } from './loadCase.js';

const dir = mkdtempSync(join(tmpdir(), 'osce-case-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function write(name: string, text: string): string {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

describe('loadCaseFile', () => {
  it('loads a valid case', () => {
    const r = loadCaseFile(write('ok.json', JSON.stringify(loadDemoRaw())));
    expect(r.ok && r.patientCase.id).toBe('demo-cough');
  });

  it('loads a case saved with a UTF-8 byte-order mark', () => {
    const r = loadCaseFile(write('bom.json', '\uFEFF' + JSON.stringify(loadDemoRaw())));
    expect(r.ok && r.patientCase.id).toBe('demo-cough');
  });

  it('reports a missing file without a stack trace', () => {
    const r = loadCaseFile(join(dir, 'missing.json'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain('file not found');
  });

  it('reports invalid JSON', () => {
    const r = loadCaseFile(write('bad.json', '{ "id": '));
    expect(!r.ok && r.message).toContain('Invalid JSON in');
  });

  it('lists schema problems as one line per field', () => {
    const r = loadCaseFile(write('zero.json', JSON.stringify({ ...loadDemoRaw(), durationSeconds: 0 })));
    expect(!r.ok && r.message).toContain('does not match the case format');
    expect(!r.ok && r.message).toContain('durationSeconds:');
  });
});
