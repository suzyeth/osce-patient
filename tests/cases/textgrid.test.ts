import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { cleanUtterance, parseConsultation, parseTextGrid } from '../../src/cases/textgrid.js';
import { checkQuote, patientTurns } from '../../src/cases/transcript.js';

const grid = (name: string, rows: Array<[number, string]>) =>
  [
    'File type = "ooTextFile"',
    'Object class = "TextGrid"',
    '',
    'xmin = 0 ',
    'xmax = 100 ',
    'tiers? <exists> ',
    'size = 1 ',
    'item []: ',
    '    item [1]:',
    '        class = "IntervalTier" ',
    `        name = "${name}" `,
    '        xmin = 0 ',
    '        xmax = 100 ',
    `        intervals: size = ${rows.length} `,
    ...rows.flatMap(([start, text], i) => [
      `        intervals [${i + 1}]:`,
      `            xmin = ${start} `,
      `            xmax = ${start + 1} `,
      `            text = "${text}" `,
    ]),
  ].join('\n');

describe('cleanUtterance', () => {
  it('drops the transcriber marks but keeps the words', () => {
    expect(cleanUtterance('<UNSURE>Oh</UNSURE> <UNSURE>hey</UNSURE>, um, I have had diarrhea')).toBe('Oh hey, um, I have had diarrhea');
    expect(cleanUtterance('I took some <UNIN/> for it')).toBe('I took some ... for it');
    expect(cleanUtterance('  spaced   out  ')).toBe('spaced out');
  });
});

describe('parseTextGrid', () => {
  it('keeps the spoken intervals in order and numbers them, dropping the silences', () => {
    const text = grid('Patient', [
      [0, ''],
      [3.9, 'Hello, how are you?'],
      [4.9, ''],
      [12.5, 'I have had this cough for weeks.'],
    ]);
    expect(parseTextGrid(text)).toEqual([
      { start: 3.9, text: 'Hello, how are you?', index: 1 },
      { start: 12.5, text: 'I have had this cough for weeks.', index: 2 },
    ]);
  });
});

describe('parseConsultation', () => {
  const doctor = grid('Doctor', [
    [0, 'Hello, I am one of the doctors.'],
    [10, 'When did it start?'],
    [11, 'Take your time.'],
  ]);
  const patient = grid('Patient', [
    [5, 'Morning.'],
    [15, 'About three days ago.'],
  ]);

  it('reads both files into one conversation, in the order it was said', () => {
    const transcript = parseConsultation('day1_consultation01', doctor, patient);
    expect(transcript.turns.map((t) => [t.speaker, t.text])).toEqual([
      ['doctor', 'Hello, I am one of the doctors.'],
      ['patient', 'Morning.'],
      // Two doctor intervals in a row become one turn.
      ['doctor', 'When did it start? Take your time.'],
      ['patient', 'About three days ago.'],
    ]);
  });

  it('cites the interval a run of words begins at, so a quote can be checked', () => {
    const transcript = parseConsultation('day1_consultation01', doctor, patient);
    const first = patientTurns(transcript)[1]!;
    // Turn four of the merged conversation: doctor, patient, doctor, patient.
    expect(first.line).toBe(4);
    expect(checkQuote(transcript, 'About three days ago.', first.line).ok).toBe(true);
    expect(checkQuote(transcript, 'When did it start?', first.line).ok).toBe(false);
  });
});

const REAL = 'data/raw/primock57/transcripts/day1_consultation01_patient.TextGrid';

describe.skipIf(!existsSync(REAL))('a real PriMock57 consultation', () => {
  it('parses both sides and the patient speaks in their own words', () => {
    const transcript = parseConsultation(
      'day1_consultation01',
      readFileSync(REAL.replace('_patient', '_doctor'), 'utf8'),
      readFileSync(REAL, 'utf8'),
    );
    expect(transcript.turns.length).toBeGreaterThan(20);
    const said = patientTurns(transcript);
    expect(said.length).toBeGreaterThan(10);
    expect(said.some((t) => t.text.toLowerCase().includes('diarrhea'))).toBe(true);
    // No transcriber marks survive into anything a case could quote.
    for (const turn of transcript.turns) expect(turn.text).not.toMatch(/<UNSURE>|<UNIN/);
  });
});
