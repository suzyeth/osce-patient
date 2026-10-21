// Types for reportModel.js, which the browser loads as plain JavaScript and the tests import.

export interface LogEntry {
  turn: number | null;
  candidate: string | null;
  reply: string;
  paused: boolean;
}

export type CriticalSummary = { kind: 'none-defined' | 'none-missed' | 'missed'; labels: string[] };

export interface ReportSummary {
  covered: number;
  total: number;
  critical: CriticalSummary;
  concern: 'elicited' | 'not-elicited' | null;
}

export function openingEntry(reply: string): LogEntry;
export function recordTurn(
  log: readonly LogEntry[],
  entry: { turnsUsed: number; candidate: string; reply: string; paused: boolean },
): LogEntry[];
export function fromSampleTranscript(transcript: readonly { student: string; patient: string }[]): LogEntry[];
export function linkableTurn(
  log: readonly LogEntry[],
  item: { covered: boolean; turn: number | null; quote: string | null },
): number | null;
export function summarise(report: {
  items: readonly { covered: boolean; critical: boolean; label: string }[];
  concernElicited: boolean | null;
}): ReportSummary;
export const STATEMENT_WORDING: Readonly<{ concern: string; no_concern: string; not_assessed: string }>;
export function orderStatements<T extends { outcome: string }>(statements: readonly T[]): T[];
