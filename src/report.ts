import { DOMAINS, type Domain, type GlobalJudgement, type PatientCase, type SessionState } from './types.js';

export interface ItemResult {
  id: string;
  label: string;
  domain: Domain;
  critical: boolean;
  covered: boolean;
  /** 1-based turn where the item was first covered, or null. */
  turn: number | null;
  exampleQuestion: string;
}

export interface DomainScore {
  covered: number;
  total: number;
  /** Covered divided by total, unrounded; null when the case has no items in this domain. */
  ratio: number | null;
}

export interface SessionReport {
  caseId: string;
  reviewStatus: PatientCase['reviewStatus'];
  items: ItemResult[];
  domains: Record<Domain, DomainScore>;
  criticalMisses: string[];
  /** Null when the case has no concern fact. */
  concernElicited: boolean | null;
  global: GlobalJudgement;
  /** Clinical management is only partly scored in this version. */
  managementIncomplete: boolean;
  turnsUsed: number;
  interruptions: number;
  jargonCount: number;
}

export const GOOD_THRESHOLD = 0.85;
export const SATISFACTORY_THRESHOLD = 0.65;
export const BORDERLINE_THRESHOLD = 0.45;

function domainScore(items: ItemResult[], domain: Domain): DomainScore {
  const inDomain = items.filter((i) => i.domain === domain);
  const covered = inDomain.filter((i) => i.covered).length;
  return { covered, total: inDomain.length, ratio: inDomain.length === 0 ? null : covered / inDomain.length };
}

function judgementFor(ratio: number): GlobalJudgement {
  if (ratio >= GOOD_THRESHOLD) return 'Good';
  if (ratio >= SATISFACTORY_THRESHOLD) return 'Satisfactory';
  if (ratio >= BORDERLINE_THRESHOLD) return 'Borderline';
  return 'Unsatisfactory';
}

/**
 * Deterministic: the weaker of the scored domains decides, on the unrounded ratio. A domain
 * with no items is skipped; with none scored the result is Unsatisfactory. A critical miss
 * caps the result at Borderline.
 */
export function globalJudgement(
  dataGathering: number | null,
  interpersonal: number | null,
  criticalMissCount: number,
): GlobalJudgement {
  const scored = [dataGathering, interpersonal].filter((r): r is number => r !== null);
  if (scored.length === 0) return 'Unsatisfactory';
  const judgement = judgementFor(Math.min(...scored));
  const capped = criticalMissCount > 0 && (judgement === 'Good' || judgement === 'Satisfactory');
  return capped ? 'Borderline' : judgement;
}

export function computeReport(patientCase: PatientCase, state: SessionState): SessionReport {
  const items: ItemResult[] = patientCase.rubric.map((r) => {
    const turn = state.rubricHits[r.id] ?? null;
    return {
      id: r.id,
      label: r.label,
      domain: r.domain,
      critical: r.critical,
      covered: turn !== null,
      turn,
      exampleQuestion: r.exampleQuestion,
    };
  });
  const domains = Object.fromEntries(DOMAINS.map((d) => [d, domainScore(items, d)])) as Record<Domain, DomainScore>;
  const criticalMisses = items.filter((i) => i.critical && !i.covered).map((i) => i.id);
  const concernFacts = patientCase.facts.filter((f) => f.kind === 'concern');
  const concernElicited =
    concernFacts.length === 0 ? null : concernFacts.some((f) => state.unlockedFactIds.includes(f.id));
  return {
    caseId: patientCase.id,
    reviewStatus: patientCase.reviewStatus,
    items,
    domains,
    criticalMisses,
    concernElicited,
    global: globalJudgement(domains.data_gathering.ratio, domains.interpersonal.ratio, criticalMisses.length),
    managementIncomplete: true,
    turnsUsed: state.turnsUsed,
    interruptions: state.interruptions,
    jargonCount: state.jargonCount,
  };
}
