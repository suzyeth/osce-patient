import type { Transcript, TranscriptTurn } from './transcript.js';

/**
 * PriMock57 (Babylon Health, CC BY 4.0) ships one Praat TextGrid per speaker per consultation:
 * a doctor file and a patient file, each a list of timed intervals. This reads the pair back into
 * one ordered conversation, so the same pipeline can build a case from it.
 *
 * A citation points at the interval a quote came from, e.g. "day1_consultation01_patient#i42",
 * because a TextGrid has no meaningful line numbers to a reader.
 */
export interface Interval {
  start: number;
  text: string;
  /** 1-based index among the non-empty intervals of that file. */
  index: number;
}

const XMIN = /^\s*xmin\s*=\s*([\d.]+)/;
const TEXT = /^\s*text\s*=\s*"([\s\S]*)"\s*$/;

/** Transcriber marks: <UNSURE>word</UNSURE> for a guess, <UNIN/> for something unintelligible. */
export function cleanUtterance(text: string): string {
  return text
    .replace(/<UNSURE>([\s\S]*?)<\/UNSURE>/g, '$1')
    .replace(/<UNIN\s*\/>/g, '...')
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The spoken intervals of one TextGrid, in order, with the silences dropped. */
export function parseTextGrid(text: string): Interval[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const intervals: Interval[] = [];
  let start: number | null = null;
  for (const line of lines) {
    const xmin = XMIN.exec(line);
    if (xmin) {
      start = Number(xmin[1]);
      continue;
    }
    const said = TEXT.exec(line);
    if (said && start !== null) {
      const spoken = cleanUtterance(said[1] ?? '');
      if (spoken !== '') intervals.push({ start, text: spoken, index: intervals.length + 1 });
      start = null;
    }
  }
  return intervals;
}

/**
 * One consultation from its two files. Turns are ordered by when they were said, and consecutive
 * turns from the same speaker are joined, so the result reads like the Fareez transcripts.
 */
export function parseConsultation(ref: string, doctorText: string, patientText: string): Transcript {
  const sides: Array<{ speaker: TranscriptTurn['speaker']; interval: Interval }> = [
    ...parseTextGrid(doctorText).map((interval) => ({ speaker: 'doctor' as const, interval })),
    ...parseTextGrid(patientText).map((interval) => ({ speaker: 'patient' as const, interval })),
  ].sort((a, b) => a.interval.start - b.interval.start);

  const turns: TranscriptTurn[] = [];
  for (const { speaker, interval } of sides) {
    const last = turns.at(-1);
    // Turns are numbered across the merged conversation, not per file: the two files each start
    // at one, so a per-file index would point at two different places at once.
    if (last && last.speaker === speaker) last.text = `${last.text} ${interval.text}`.trim();
    else turns.push({ speaker, text: interval.text, line: turns.length + 1 });
  }
  return { ref, turns };
}
