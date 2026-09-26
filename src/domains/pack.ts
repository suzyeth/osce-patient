import type { Domain, RubricItem } from '../types.js';
import type { DisclosureRules, Signposting } from '../safety.js';

/**
 * A domain pack is everything this tool knows about one kind of conversation. The engine itself -
 * how a turn runs, what unlocks a fact, what the guard redacts, what the state records - knows
 * nothing about medicine or anything else, and a pack is how a field is taught to it.
 *
 * The point of the separation is not tidiness. The mechanism is that a person only tells you what
 * you ask for properly, and that every mark can be traced to their words. That is not a medical
 * idea: it is equally true of a safeguarding interview, a grievance investigation, a user research
 * session and a journalist's interview. Keeping a field in data and a small assess function, rather
 * than in the engine, is what makes that claim checkable instead of a slogan.
 */
export interface ScoringDomain {
  id: string;
  /** Shown in the report, in the field's own words. */
  label: string;
}

/** One rubric item as the report sees it, after the session. */
export interface ItemResult {
  id: string;
  label: string;
  domain: Domain;
  critical: boolean;
  covered: boolean;
  /** 1-based turn where the item was first covered, or null. */
  turn: number | null;
  /** The learner's own words that earned it, so the mark can be checked. Null when not covered. */
  quote: string | null;
  /** Where the item comes from, or null when nothing published backs it. */
  source: string | null;
  exampleQuestion: string;
}

/**
 * What the engine can see about a session, in words that belong to no particular field. A pack
 * judges its own feedback statements from this and nothing else, which is what keeps the engine
 * free of any one field's assumptions.
 */
export interface Observations {
  items: readonly ItemResult[];
  /** Critical items the learner never reached. */
  missedCritical: readonly ItemResult[];
  /** True when the case marks any item critical at all. */
  hasCritical: boolean;
  turnsUsed: number;
  minutes: number;
  /** Roughly how many turns a session of this length has room for when spoken. */
  roomForTurns: number;
  /** Turn numbers the judge flagged. */
  interruptedTurns: readonly number[];
  jargonTurns: readonly number[];
  empathyTurns: readonly number[];
  /**
   * Whether the session ran in a sensible order, from the pack's opening and closing items.
   * `ordered` is null when there was nothing to judge, which a pack must report as not assessed
   * rather than as no concern.
   */
  order: { ordered: boolean | null; detail: string };
  /** Whether the hidden concern was reached; null when the case has none. */
  concernElicited: boolean | null;
  itemById: (id: string) => ItemResult | undefined;
  /** The learner's own words from the given turns, for quoting evidence back. */
  quotesFrom: (turns: readonly number[]) => string[];
  /** "question 3, question 7", for evidence lines. */
  list: (turns: readonly number[]) => string;
}

export interface StatementJudgement {
  /**
   * 'not_assessed' when a typed session gives no evidence either way; 'concern' when what happened
   * is the kind of thing the statement describes; 'no_concern' when it is not.
   */
  outcome: 'concern' | 'no_concern' | 'not_assessed';
  /** Plain-English reason naming the questions it rests on. Always present, whatever the outcome. */
  evidence: string;
  /** The learner's own words the judgement rests on, if any. */
  quotes: string[];
}

/**
 * One statement the report can comment on, phrased as what went wrong, the way an examiner's or a
 * reviewer's feedback list is usually phrased.
 */
export interface FeedbackStatement {
  key: string;
  label: string;
  /** The wording, verbatim from the source named below. */
  text: string;
  /**
   * 'regulator' for wording published by the body that actually assesses people in this field;
   * 'ours' for a statement we wrote from published guidance. The report must say which, because a
   * statement we wrote carries nothing like the weight of one an examiner really picks from.
   */
  authority: 'regulator' | 'ours';
  /** Where the wording comes from; shown in the report beside the statement. */
  source: string;
  /** False when a typed session gives no evidence either way. */
  assessable: boolean;
  /** Why it cannot be judged here; empty when it can. */
  notAssessableBecause: string;
  /**
   * Rubric item ids this statement's judgement reads. A case that has none of them cannot be judged
   * on this statement, and the engine reports that rather than letting the pack's assess function
   * mistake an absent item for a covered one. validateCase checks these exist.
   */
  needsItems?: readonly string[];
  /** How this field judges the statement. Required when assessable. */
  assess?: (obs: Observations) => StatementJudgement;
}

/**
 * The parts of the simulated person's prompt that belong to a field rather than to the engine. The
 * rules that stop the model inventing things are the engine's and are the same everywhere; what
 * differs is who the person is and what kind of thing they know.
 */
export interface PersonaPrompt {
  /** One sentence putting the model in role, e.g. "You are role-playing a patient in ...". */
  roleLine: string;
  /** Heading above the shareable facts, e.g. "The only facts about your health that you may share right now". */
  factsHeading: string;
  /** What the model must never make up, in this field's terms. */
  inventionBan: string;
  /** What counts as ordinary conversation rather than a question about the facts. */
  smallTalkLine: string;
}

export interface DomainPack {
  id: string;
  label: string;
  /** What the simulated person is called in this field: patient, interviewee, complainant. */
  personNoun: string;
  /** What the learner is called: candidate, interviewer, researcher. */
  learnerNoun: string;
  /** One line for the report saying what this pack does and does not claim to measure. */
  caveat: string;
  persona: PersonaPrompt;
  /**
   * What this field pauses practice on beyond self-harm, and where a pause sends someone. Self-harm
   * is checked by the engine in every field; the rest was tuned for medicine and does not transfer.
   */
  safety: { disclosure: DisclosureRules; signposting: Signposting };
  domains: readonly ScoringDomain[];
  /** The domain whose items count as gathering information, for the order check. */
  gatheringDomainId: string;
  /** The item that opens the conversation, for the order check; omit if the field has none. */
  openingItemId?: string;
  /** The item that closes it, for the order check; omit if the field has none. */
  closingItemId?: string;
  /** The content a session is expected to cover. Ours, always, with a source per item. */
  rubric: readonly RubricItem[];
  /** Where each rubric item comes from, by item id. */
  sources: Readonly<Record<string, string>>;
  statements: readonly FeedbackStatement[];
}

/**
 * Item labels are written to read as a checklist row ("Asks about coughing up blood"), which does
 * not fit inside a sentence. Quoting them keeps the report grammatical and keeps the wording exactly
 * as the candidate sees it in the list, rather than inventing a second phrasing for each item.
 */
export function quoteLabels(items: readonly ItemResult[]): string {
  return items.map((i) => `"${i.label}"`).join(', ');
}

/** Bodies whose wording may be labelled as a regulator's. Named, so the label cannot be a guess. */
const REGULATORS = /\b(GMC|NICE|RCGP|GDC|NMC|HCPC|College of Policing|ACAS)\b/;

const REGISTRY = new Map<string, DomainPack>();

export function registerPack(pack: DomainPack): DomainPack {
  if (REGISTRY.has(pack.id)) throw new Error(`domain pack already registered: ${pack.id}`);
  const ids = new Set(pack.domains.map((d) => d.id));
  const itemIds = new Set<string>();
  for (const item of pack.rubric) {
    if (itemIds.has(item.id)) throw new Error(`pack ${pack.id}: two rubric items share the id ${item.id}`);
    itemIds.add(item.id);
    if (pack.sources[item.id] === undefined) throw new Error(`pack ${pack.id}: item ${item.id} has no source`);
    if (!ids.has(item.domain)) throw new Error(`pack ${pack.id}: item ${item.id} is in unknown domain ${item.domain}`);
  }
  if (!ids.has(pack.gatheringDomainId)) throw new Error(`pack ${pack.id}: unknown gathering domain ${pack.gatheringDomainId}`);
  if (!pack.rubric.some((r) => r.domain === pack.gatheringDomainId)) {
    throw new Error(`pack ${pack.id}: its gathering domain ${pack.gatheringDomainId} has no items, so order can never be judged`);
  }
  for (const [what, id] of [['opening', pack.openingItemId], ['closing', pack.closingItemId]] as const) {
    if (id !== undefined && !pack.rubric.some((r) => r.id === id)) {
      throw new Error(`pack ${pack.id}: its ${what} item ${id} is not in its own rubric`);
    }
  }
  const keys = new Set<string>();
  for (const statement of pack.statements) {
    if (keys.has(statement.key)) throw new Error(`pack ${pack.id}: two statements share the key ${statement.key}`);
    keys.add(statement.key);
    // authority 'regulator' is the strongest thing this tool says about any wording, and the report
    // shows it to every reader. It cannot be verified from here, but it can be made hard to set by
    // accident: a regulator's wording has to name where it was published.
    if (statement.authority === 'regulator' && !REGULATORS.test(statement.source)) {
      throw new Error(
        `pack ${pack.id}: statement ${statement.key} claims authority 'regulator' but its source does not name a body: ${statement.source}`,
      );
    }
    if (statement.assessable && !statement.assess) {
      throw new Error(`pack ${pack.id}: statement ${statement.key} says it is assessable but has no assess function`);
    }
    if (!statement.assessable && statement.notAssessableBecause.trim() === '') {
      throw new Error(`pack ${pack.id}: statement ${statement.key} must say why it cannot be assessed`);
    }
  }
  REGISTRY.set(pack.id, pack);
  return pack;
}

export function packFor(id: string): DomainPack {
  const pack = REGISTRY.get(id);
  if (!pack) throw new Error(`unknown domain pack: ${id}. Registered: ${[...REGISTRY.keys()].join(', ') || 'none'}`);
  return pack;
}

export function packIds(): string[] {
  return [...REGISTRY.keys()].sort();
}

/**
 * The packs that ship with the tool. Registering a pack is permanent and has no undo, so a test that
 * registers one leaves it in the registry: an assertion about "the packs this tool has" has to ask
 * this rather than ask what is in the registry, or it passes only while it runs first.
 */
export const SHIPPED_PACK_IDS: readonly string[] = ['uk-clinical-history', 'user-research-interview'];
