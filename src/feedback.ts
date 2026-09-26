/**
 * The GMC's ten examiner feedback statements for the PLAB 2 / UKMLA clinical exam, quoted from
 * the GMC's own page (registration-and-licensing/join-our-registers/plab/plab-2-guide/
 * understanding-your-results, read 2026-09-26). These, plus marks in three domains, are the only
 * feedback a real candidate is given: the GMC does not publish an item-level mark scheme, and the
 * examiner picks whichever of these ten statements applies to the candidate in that station.
 *
 * Reporting against these rather than against a coverage percentage is the point. The GMC also
 * publishes a standard setting judgement of Unsatisfactory / Borderline / Satisfactory / Good, but
 * says plainly that it "does not determine whether you pass the station and is not included in the
 * results you will receive" - it exists only to calculate the station cut score. So this tool does
 * not produce one; a practice session cannot stand a candidate against a cohort, and using the
 * exam's own words for something the exam does not report would mislead.
 *
 * `assessable` says whether a typed history-taking station can say anything about a statement at
 * all. Six of the ten cannot be judged here, and the report says so rather than passing silence
 * off as a pass.
 */
export const FEEDBACK_STATEMENT_KEYS = [
  'consultation',
  'issues',
  'time',
  'findings',
  'examination',
  'diagnosis',
  'management',
  'rapport',
  'listening',
  'language',
] as const;

export type FeedbackStatementKey = (typeof FEEDBACK_STATEMENT_KEYS)[number];

export interface FeedbackStatement {
  key: FeedbackStatementKey;
  /** The GMC's label for the statement. */
  label: string;
  /** The GMC's wording, verbatim. It describes the negative: what a candidate did NOT do. */
  text: string;
  /** False when a typed history-taking station gives no evidence either way. */
  assessable: boolean;
  /** Why it cannot be judged here; empty when it can. */
  notAssessableBecause: string;
}

export const FEEDBACK_STATEMENTS: readonly FeedbackStatement[] = [
  {
    key: 'consultation',
    label: 'Consultation',
    text: 'Disorganised / unstructured consultation. Includes illogical and disordered approach to questioning.',
    assessable: true,
    notAssessableBecause: '',
  },
  {
    key: 'issues',
    label: 'Issues',
    text: 'Does not recognise the issues or priorities in the consultation (for example, the patient’s key problem or the immediate management of an acutely ill patient).',
    assessable: true,
    notAssessableBecause: '',
  },
  {
    key: 'time',
    label: 'Time',
    text: 'Shows poor time management.',
    assessable: true,
    notAssessableBecause: '',
  },
  {
    key: 'findings',
    label: 'Findings',
    text: 'Does not identify abnormal findings or results or fails to recognise their implications.',
    assessable: false,
    notAssessableBecause: 'This station has no examination findings, results or data to interpret.',
  },
  {
    key: 'examination',
    label: 'Examination',
    text: 'Does not undertake physical examination competently, or use instruments proficiently.',
    assessable: false,
    notAssessableBecause: 'Nothing is examined in a typed history-taking station.',
  },
  {
    key: 'diagnosis',
    label: 'Diagnosis',
    text: 'Does not make the correct working diagnosis or identify an appropriate range of differential possibilities.',
    assessable: false,
    notAssessableBecause: 'This station does not ask you for a diagnosis, and nothing here marks one.',
  },
  {
    key: 'management',
    label: 'Management',
    text: 'Does not develop a management plan reflecting current best practice, including follow up and safety netting.',
    assessable: false,
    notAssessableBecause:
      'Only safety netting is looked at here. A management plan is not marked, so treat this domain as unscored.',
  },
  {
    key: 'rapport',
    label: 'Rapport',
    text: 'Does not appear to develop rapport or show sensitivity for the patient’s feelings and concerns, including use of stock phrases.',
    assessable: true,
    notAssessableBecause: '',
  },
  {
    key: 'listening',
    label: 'Listening',
    text: 'Does not make adequate use of verbal & non-verbal cues. Poor active listening skills.',
    assessable: true,
    // Half of it is out of reach and the report says which half, rather than pretending otherwise.
    notAssessableBecause: '',
  },
  {
    key: 'language',
    label: 'Language',
    text: 'Does not use language or explanations that are relevant and understandable to the patient, including not checking understanding.',
    assessable: true,
    notAssessableBecause: '',
  },
];

/** The GMC's three marking domains, in its own words. */
export const DOMAIN_LABEL = {
  data_gathering: 'Data gathering, technical and assessment skills',
  management: 'Clinical management skills',
  interpersonal: 'Interpersonal skills',
} as const;

export function statement(key: FeedbackStatementKey): FeedbackStatement {
  const found = FEEDBACK_STATEMENTS.find((s) => s.key === key);
  if (!found) throw new Error(`unknown feedback statement: ${key}`);
  return found;
}
