/**
 * Fareez et al. 2022 transcripts are plain text, one speaker turn per paragraph, tagged "D:" for
 * the doctor and "P:" for the patient. Everything downstream cites a line number in the original
 * file, so the parser keeps them.
 */
export interface TranscriptTurn {
  speaker: 'doctor' | 'patient';
  text: string;
  /** 1-based line in the source file, for the citation in a case file. */
  line: number;
}

export interface Transcript {
  /** The file's own name, e.g. "RES0001.txt"; the citation prefix. */
  ref: string;
  turns: TranscriptTurn[];
}

const SPEAKER = /^\s*([DP])\s*:\s*(.*)$/;

/**
 * Parses a transcript. A line that does not start a turn continues the previous one, because the
 * source wraps long answers. Lines before the first speaker tag are ignored.
 */
export function parseTranscript(ref: string, text: string): Transcript {
  const turns: TranscriptTurn[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (const [index, raw] of lines.entries()) {
    const match = SPEAKER.exec(raw);
    if (match) {
      const [, tag, rest] = match as unknown as [string, string, string];
      turns.push({ speaker: tag === 'D' ? 'doctor' : 'patient', text: rest.trim(), line: index + 1 });
      continue;
    }
    const current = turns.at(-1);
    if (current && raw.trim() !== '') current.text = `${current.text} ${raw.trim()}`.trim();
  }
  return { ref, turns: turns.filter((t) => t.text !== '') };
}

/** What the patient said, which is the only side a case may quote as fact. */
export function patientTurns(transcript: Transcript): TranscriptTurn[] {
  return transcript.turns.filter((t) => t.speaker === 'patient');
}

/** "RES0001.txt#L12", the reference stored with every fact. */
export function citation(transcript: Transcript, line: number): string {
  return `${transcript.ref}#L${line}`;
}

/** Spacing and quote marks differ between the transcript and a model's copy of it. */
function normalise(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface QuoteCheck {
  ok: boolean;
  /** The line the quote was actually found on, when it was found. */
  line: number | null;
  problem: string | null;
}

/**
 * The gate that keeps invented facts out: a quote must appear, word for word, in something the
 * patient said, on the line the fact claims. Only spacing, case and quote marks are forgiven.
 */
export function checkQuote(transcript: Transcript, quote: string, claimedLine: number): QuoteCheck {
  const wanted = normalise(quote);
  if (wanted.length === 0) return { ok: false, line: null, problem: 'the quote is empty' };
  const claimed = transcript.turns.find((t) => t.line === claimedLine);
  // Short answers are real ("Yeah.", "No, never."), but a fragment that short could match anywhere,
  // so it only counts when it is the whole turn on the line the fact cites.
  if (wanted.length < 8) {
    const whole = claimed && claimed.speaker === 'patient' && normalise(claimed.text) === wanted;
    return whole
      ? { ok: true, line: claimedLine, problem: null }
      : { ok: false, line: null, problem: 'the quote is too short unless it is the whole answer on that line' };
  }
  if (claimed && claimed.speaker === 'patient' && normalise(claimed.text).includes(wanted)) {
    return { ok: true, line: claimedLine, problem: null };
  }
  const elsewhere = patientTurns(transcript).find((t) => normalise(t.text).includes(wanted));
  if (elsewhere) return { ok: false, line: elsewhere.line, problem: `the quote is on line ${elsewhere.line}, not ${claimedLine}` };
  const doctorSaid = transcript.turns.find((t) => t.speaker === 'doctor' && normalise(t.text).includes(wanted));
  if (doctorSaid) return { ok: false, line: doctorSaid.line, problem: `the doctor said this, not the patient (line ${doctorSaid.line})` };
  return { ok: false, line: null, problem: 'the quote is not in the transcript' };
}
