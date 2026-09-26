import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { checkQuote, citation, parseTranscript, patientTurns } from '../../src/cases/transcript.js';

const SAMPLE = [
  'D: What brings you in today?',
  '',
  "P: I've had this cough for about six weeks now.",
  'It started after a cold.',
  '',
  'D: Any blood?',
  '',
  'P: Last week there was a streak of blood.',
].join('\n');

const t = parseTranscript('RES0001.txt', SAMPLE);

describe('parseTranscript', () => {
  it('reads speaker turns and keeps the line each one starts on', () => {
    expect(t.turns).toEqual([
      { speaker: 'doctor', text: 'What brings you in today?', line: 1 },
      { speaker: 'patient', text: "I've had this cough for about six weeks now. It started after a cold.", line: 3 },
      { speaker: 'doctor', text: 'Any blood?', line: 6 },
      { speaker: 'patient', text: 'Last week there was a streak of blood.', line: 8 },
    ]);
  });

  it('joins wrapped lines into the turn above and drops empty ones', () => {
    const wrapped = parseTranscript('X.txt', 'P: One\ntwo\n\nthree\n');
    expect(wrapped.turns).toEqual([{ speaker: 'patient', text: 'One two three', line: 1 }]);
  });

  it('ignores anything before the first speaker tag, and handles Windows line endings', () => {
    const messy = parseTranscript('X.txt', 'Transcript of visit\r\n\r\nD: Hello\r\nP: Hi\r\n');
    expect(messy.turns.map((x) => x.speaker)).toEqual(['doctor', 'patient']);
    expect(messy.turns[1]).toMatchObject({ text: 'Hi', line: 4 });
  });

  it('gives the patient side and a citation', () => {
    expect(patientTurns(t)).toHaveLength(2);
    expect(citation(t, 3)).toBe('RES0001.txt#L3');
  });
});

describe('checkQuote', () => {
  it('accepts a quote the patient really said on that line', () => {
    expect(checkQuote(t, 'about six weeks now', 3)).toEqual({ ok: true, line: 3, problem: null });
  });

  it('forgives spacing, case and curly quotes, since a model retypes them', () => {
    expect(checkQuote(t, "I’ve  had this   COUGH for about six weeks", 3).ok).toBe(true);
  });

  it('refuses a quote from the wrong line, and says where it really is', () => {
    expect(checkQuote(t, 'a streak of blood', 3)).toMatchObject({ ok: false, line: 8, problem: 'the quote is on line 8, not 3' });
  });

  it('refuses words the doctor said, not the patient', () => {
    expect(checkQuote(t, 'What brings you in today', 1)).toMatchObject({ ok: false, problem: expect.stringContaining('the doctor said this') });
  });

  it('refuses anything not in the transcript, which is how an invented fact is caught', () => {
    expect(checkQuote(t, 'I also have chest pain at night', 3)).toEqual({ ok: false, line: null, problem: 'the quote is not in the transcript' });
  });

  it('refuses a short fragment, but accepts a short answer that is the whole turn', () => {
    expect(checkQuote(t, 'cough', 3)).toMatchObject({ ok: false, problem: expect.stringContaining('too short') });
    const short = parseTranscript('X.txt', 'D: Any blood?\n\nP: Yeah.\n');
    expect(checkQuote(short, 'Yeah.', 3)).toEqual({ ok: true, line: 3, problem: null });
    expect(checkQuote(short, 'Yeah', 1)).toMatchObject({ ok: false });
  });
});

// The raw datasets are not in the repository (data/raw is ignored), so this runs only when the
// download has been done; everything above proves the parser on its own.
const REAL = 'data/raw/transcripts/RES0001.txt';

describe.skipIf(!existsSync(REAL))('a real Fareez transcript', () => {
  it('parses, and the patient speaks in the first turns', () => {
    const real = parseTranscript('RES0001.txt', readFileSync(REAL, 'utf8'));
    expect(real.turns.length).toBeGreaterThan(40);
    expect(real.turns[0]?.speaker).toBe('doctor');
    const first = patientTurns(real)[0]!;
    expect(first.text.length).toBeGreaterThan(20);
    // Every patient turn can be cited, and its own words check out.
    expect(checkQuote(real, first.text.slice(0, 40), first.line).ok).toBe(true);
  });
});
