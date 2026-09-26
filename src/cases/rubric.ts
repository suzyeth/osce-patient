import type { RubricItem } from '../types.js';

/**
 * The content a history-taking station asks a candidate to cover, in the order they would cover it.
 *
 * This list is ours. It is not any exam's marking sheet, and no exam marks item by item like this.
 * The GMC publishes only three marking domains and ten examiner feedback statements for the PLAB 2
 * / UKMLA clinical exam, and says item-level mark schemes are not published. We wrote these items
 * by reading, for each one, what a published UK source actually asks for; RUBRIC_SOURCES below
 * gives the source per item, and the report must show it rather than implying a GMC checklist.
 *
 * Sources used, all openly published:
 * - GMC, PLAB 2 marking domains and the ten feedback statements (how-will-you-be-tested,
 *   understanding-your-results).
 * - GMC, Outcomes for graduates 2018, 11a (medical history including family and social history),
 *   11b (ideas, concerns, expectations) and 18a (medication history and allergies).
 * - GMC's one published sample station (8-minute headache telephone consultation), which lists
 *   what a candidate must demonstrate to pass.
 * - Calgary-Cambridge guide (Silverman, Kurtz & Draper, Skills for Communicating with Patients,
 *   2nd ed, 2005) for the opening, the systems review and the closing.
 * - Safety netting: first described by Roger Neighbour (The Inner Consultation, 1987, per BJGP
 *   2019); the GMC's management feedback statement says "including follow up and safety netting".
 *   NICE NG12 1.14.6 (as numbered since April 2026) also uses it, but NG12 is a suspected-cancer
 *   guideline and that recommendation covers people with symptoms of raised risk who do not meet the
 *   threshold for referral, not every consultation.
 *
 * Deliberately NOT cited: SOCRATES. It is widely taught for pain, but the origin usually given for
 * it could not be verified in any primary source, so it is not used here as an authority.
 *
 * Not every item applies to every station: GMC's own 8-minute sample station does not ask for
 * family history, a systems review, smoking or safety netting. Marking a candidate down for
 * missing those in a focused station would misrepresent the exam, which is why the report reports
 * coverage and never turns it into a pass or fail.
 *
 * A case adds its own red flags on top; nothing here is case-specific.
 */
export const STANDARD_RUBRIC: readonly RubricItem[] = [
  {
    id: 'intro_consent',
    domain: 'interpersonal',
    label: 'Introduces self and explains the purpose of the conversation',
    critical: false,
    exampleQuestion: "Hello, I'm one of the doctors. Is it okay if I ask you some questions today?",
    offlineCues: ['my name is', "i'm one of the doctors", 'is it okay if', 'happy for me to'],
  },
  {
    id: 'open_question',
    domain: 'interpersonal',
    label: 'Opens with an open question and lets the patient speak',
    critical: false,
    exampleQuestion: 'What brings you in today?',
    offlineCues: ['what brings', 'tell me about', 'how can i help', 'what can i do for you'],
  },
  {
    id: 'onset_duration',
    domain: 'data_gathering',
    label: 'Asks when it started and how it has changed',
    critical: false,
    exampleQuestion: 'When did this start, and has it changed since?',
    offlineCues: ['when did', 'how long', 'since when', 'getting worse'],
  },
  {
    id: 'character_severity',
    domain: 'data_gathering',
    label: 'Asks what it is like and how bad it is',
    critical: false,
    // No published UK source asks for a score out of ten, so the example does not ask for one;
    // "out of ten" stays as a cue because candidates do say it.
    exampleQuestion: 'What does it feel like, and how bad does it get?',
    offlineCues: ['what does it feel', 'how bad', 'out of ten', 'describe the pain'],
  },
  {
    id: 'associated_symptoms',
    domain: 'data_gathering',
    label: 'Asks about associated symptoms',
    critical: false,
    exampleQuestion: 'Have you noticed anything else along with it?',
    offlineCues: ['anything else', 'along with', 'other symptoms', 'have you noticed'],
  },
  {
    id: 'past_medical',
    domain: 'data_gathering',
    label: 'Takes a past medical history',
    critical: false,
    exampleQuestion: 'Do you have any medical conditions, or have you had any operations?',
    offlineCues: ['medical conditions', 'past medical', 'any operations', 'diagnosed with'],
  },
  {
    id: 'medications_allergies',
    domain: 'data_gathering',
    label: 'Asks about medicines and allergies',
    critical: false,
    exampleQuestion: 'Are you taking any medicines, and do you have any allergies?',
    offlineCues: ['medication', 'medicines', 'tablets', 'allergic', 'allergies'],
  },
  {
    id: 'family_history',
    domain: 'data_gathering',
    label: 'Asks about family history',
    critical: false,
    exampleQuestion: 'Does anything like this run in your family?',
    offlineCues: ['family history', 'in your family', 'run in the family', 'your parents'],
  },
  {
    id: 'social_smoking_alcohol',
    domain: 'data_gathering',
    label: 'Takes a smoking and alcohol history',
    critical: false,
    exampleQuestion: 'Do you smoke, and how much alcohol do you drink in a week?',
    offlineCues: ['smoke', 'cigarette', 'vape', 'alcohol', 'drink'],
  },
  {
    id: 'social_life',
    domain: 'data_gathering',
    label: 'Asks about work, home and daily life',
    critical: false,
    exampleQuestion: 'What do you do for work, and who is at home with you?',
    offlineCues: ['for work', 'your job', 'at home with', 'who do you live', 'day to day'],
  },
  {
    id: 'systems_review',
    domain: 'data_gathering',
    label: 'Screens the systems relevant to the complaint',
    critical: false,
    exampleQuestion: 'Any weight loss, fevers or night sweats?',
    offlineCues: ['weight loss', 'fevers', 'night sweats', 'appetite'],
  },
  {
    id: 'ice_concerns',
    domain: 'interpersonal',
    label: "Explores the patient's ideas, concerns and expectations",
    critical: false,
    exampleQuestion: 'Is there anything in particular you are worried this might be?',
    offlineCues: ['worried', 'worry', 'concern', 'what do you think is', 'hoping for today'],
  },
  {
    id: 'closing',
    domain: 'interpersonal',
    label: 'Summarises, checks understanding and invites questions',
    critical: false,
    exampleQuestion: 'Can I summarise what you have told me? Do you have any questions?',
    offlineCues: ['summarise', 'summarize', 'to recap', 'any questions', 'have i got that right'],
  },
  {
    id: 'safety_netting',
    domain: 'management',
    label: 'Says what to do if it gets worse',
    critical: false,
    exampleQuestion: 'If it gets worse, or you feel much more unwell, call 111 or come straight back.',
    offlineCues: ['if it gets worse', 'come back', 'call 111', 'go to a&e', 'straight back'],
  },
];

/**
 * Where each item comes from, quoted or closely paraphrased from the source, for the report and for
 * anyone who wants to argue with an item. "framework" marks an item with no regulator source: it
 * rests only on the Calgary-Cambridge guide, and is the weakest kind of item here.
 */
export const RUBRIC_SOURCES: Readonly<Record<string, string>> = {
  intro_consent: 'Calgary-Cambridge: "Introduces self, role and nature of interview; obtain consent if necessary" (framework; the guide says consent only "if necessary")',
  open_question: 'GMC PLAB 2 interpersonal domain: "how you use open and closed questioning"; Calgary-Cambridge: "Listens attentively to the opening statement, without interrupting"',
  onset_duration: 'GMC sample station: "including occurrences, location, duration, triggers"',
  character_severity: 'GMC sample station: "location, duration, triggers"; character and severity are standard for pain but the sample station does not ask for a score out of ten (framework)',
  associated_symptoms: 'GMC sample station: "including occurrences, location, duration, triggers, associated symptoms"',
  past_medical: 'GMC sample station: "Take a medical history of any medication or trauma"',
  medications_allergies: 'GMC Outcomes for graduates 18a: "establish an accurate medication history... and establish medication allergies"',
  family_history: 'GMC Outcomes for graduates 11a: "including family and social history" (not asked for in the published 8-minute sample station)',
  social_smoking_alcohol: 'GMC sample station: "appropriate lifestyle history (eg alcohol, diet, sex, sleep)" (smoking appears in the MLA content map on the management side, not here)',
  social_life: 'GMC Outcomes for graduates 11a: "including family and social history"; MLA content map: "social factors (eg employment and fitness for work, housing)"',
  systems_review: 'Calgary-Cambridge content guide: "relevant systems review" only (framework; no regulator source, and no GMC station asks for it)',
  ice_concerns: 'GMC Outcomes for graduates 11b: "take into account their ideas concerns, expectations, values and preferences"',
  closing: 'GMC PLAB 2 language feedback statement: "including not checking understanding"; Calgary-Cambridge: "Summarizes session briefly and clarifies plan of care"',
  safety_netting: 'GMC PLAB 2 management feedback statement: "including follow up and safety netting". NICE NG12 1.14.6 (numbering as of April 2026) says the same for a defined suspected-cancer group, not for every consultation',
};

export const STANDARD_RUBRIC_IDS: readonly string[] = STANDARD_RUBRIC.map((r) => r.id);

/**
 * Wording that usually means a doctor must act the same day. A model filing one of these as
 * ordinary history is the mistake this catches; a person then decides. These are prompts for a
 * human reader, not a clinical rule, and the list is deliberately short and literal.
 */
const RED_FLAG_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(cough(ing|ed)?[^.]{0,20}(up )?blood|blood[^.]{0,15}(in|when) (my )?(sputum|phlegm|cough))\b/i, 'coughing up blood'],
  [/\b(calf|leg)\b[^.]{0,30}\b(sore|pain|painful|swollen|swelling|tender)\b/i, 'a painful or swollen leg'],
  [/\b(swollen|swelling)\b[^.]{0,20}\b(calf|leg|ankle)\b/i, 'a swollen leg'],
  [/\b(passed out|blacked out|faint(ed|ing)?|collapsed)\b/i, 'fainting or collapse'],
  [/\bchest (pain|tightness)[^.]{0,25}(at rest|lying down|doing nothing)\b/i, 'chest pain at rest'],
  [/\b(weight loss|lost [^.]{0,12}(stone|kilos|kg|pounds))\b[^.]{0,40}\b(night sweats|fever)\b/i, 'weight loss with night sweats'],
  [/\bnight sweats\b[^.]{0,40}\bweight loss\b/i, 'weight loss with night sweats'],
  [/\brash\b[^.]{0,40}\b(does ?n[o']t (fade|blanch)|glass)\b/i, 'a rash that does not fade'],
  [/\b(sudden|suddenly)\b[^.]{0,20}\b(weak(ness)?|numb(ness)?|slurred|vision went)\b/i, 'sudden weakness or numbness'],
  [/\b(thoughts of|planned to) (harm|kill|end)\b/i, 'thoughts of self-harm'],
  [/\b(numb(ness)?|tingling)\b[^.]{0,40}\b(saddle|between my legs|bottom|groin|back passage)\b/i, 'numbness around the saddle area'],
  [/\b(lost control|leaking|accident|can ?n[o']t (hold|control|feel))\b[^.]{0,30}\b(bladder|bowels?|wee|urine|poo)\b/i, 'loss of bladder or bowel control'],
  [/\b(black|tarry)\b[^.]{0,20}\b(stools?|poo|motions?)\b/i, 'black or tarry stools'],
  [/\b(stools?|poo|motions?)\b[^.]{0,25}\b(black|tarry)\b/i, 'black or tarry stools'],
  [/\b(vomit(ing|ed)?|throwing up|threw up)\b[^.]{0,20}\bblood\b/i, 'vomiting blood'],
  [/\bblood\b[^.]{0,20}\b(in|when i)\b[^.]{0,15}\b(stool|poo|vomit|urine|wee)\b/i, 'blood in the stool or urine'],
];

/** Diagnoses a patient would rarely name unprompted; worth a second look in the review. */
const DIAGNOSIS_WORDS = /\b(pulmonary embolism|embolism|myocardial infarction|infarction|deep vein thrombosis|dvt|carcinoma|malignancy|angina|copd)\b/i;

/** The rubric item a red flag becomes, so a case cannot be built without one when the words are there. */
const RED_FLAG_ITEMS: Readonly<Record<string, { id: string; label: string; exampleQuestion: string; cues: string[] }>> = {
  'coughing up blood': { id: 'rf_haemoptysis', label: 'Asks about coughing up blood', exampleQuestion: 'Have you coughed up any blood?', cues: ['blood', 'coughing up'] },
  'a painful or swollen leg': { id: 'rf_leg', label: 'Asks about a painful or swollen leg', exampleQuestion: 'Have you had any pain or swelling in your calf?', cues: ['calf', 'leg pain', 'swollen'] },
  'a swollen leg': { id: 'rf_leg', label: 'Asks about a painful or swollen leg', exampleQuestion: 'Have you had any pain or swelling in your calf?', cues: ['calf', 'leg pain', 'swollen'] },
  'fainting or collapse': { id: 'rf_syncope', label: 'Asks about fainting or blacking out', exampleQuestion: 'Have you fainted or blacked out at any point?', cues: ['faint', 'passed out', 'blacked out'] },
  'chest pain at rest': { id: 'rf_rest_pain', label: 'Asks whether the pain comes on at rest', exampleQuestion: 'Does the pain come on when you are resting?', cues: ['at rest', 'resting', 'lying down'] },
  'weight loss with night sweats': { id: 'rf_constitutional', label: 'Asks about weight loss, fevers and night sweats', exampleQuestion: 'Have you lost weight, or had fevers or night sweats?', cues: ['weight loss', 'night sweats', 'fevers'] },
  'a rash that does not fade': { id: 'rf_rash', label: 'Asks whether the rash fades under a glass', exampleQuestion: 'Does the rash fade when you press a glass against it?', cues: ['rash', 'glass', 'fade'] },
  'sudden weakness or numbness': { id: 'rf_neuro', label: 'Asks about sudden weakness or numbness', exampleQuestion: 'Have you had any sudden weakness, numbness or trouble speaking?', cues: ['weakness', 'numbness', 'slurred'] },
  'thoughts of self-harm': { id: 'rf_self_harm', label: 'Asks about thoughts of self-harm', exampleQuestion: 'Have you had any thoughts of harming yourself?', cues: ['harm yourself', 'end your life'] },
  'numbness around the saddle area': { id: 'rf_cauda_equina', label: 'Asks about saddle numbness and bladder or bowel control', exampleQuestion: 'Any numbness between your legs, or trouble controlling your bladder or bowels?', cues: ['numbness', 'saddle', 'bladder', 'bowel'] },
  'loss of bladder or bowel control': { id: 'rf_cauda_equina', label: 'Asks about saddle numbness and bladder or bowel control', exampleQuestion: 'Any numbness between your legs, or trouble controlling your bladder or bowels?', cues: ['numbness', 'saddle', 'bladder', 'bowel'] },
  'black or tarry stools': { id: 'rf_gi_bleed', label: 'Asks about black stools or vomiting blood', exampleQuestion: 'Have your stools been black or tarry, or have you vomited any blood?', cues: ['black stool', 'tarry', 'vomited blood'] },
  'vomiting blood': { id: 'rf_gi_bleed', label: 'Asks about black stools or vomiting blood', exampleQuestion: 'Have your stools been black or tarry, or have you vomited any blood?', cues: ['black stool', 'tarry', 'vomited blood'] },
  'blood in the stool or urine': { id: 'rf_gi_bleed', label: 'Asks about black stools or vomiting blood', exampleQuestion: 'Have your stools been black or tarry, or have you vomited any blood?', cues: ['black stool', 'tarry', 'vomited blood'] },
};

/** The rubric item for a red flag the hints found, or null when there is no standard one. */
export function redFlagItemFor(reason: string): RubricItem | null {
  const found = RED_FLAG_ITEMS[reason];
  return found ? redFlagItem(found.id, found.label, found.exampleQuestion, found.cues) : null;
}

/** Text that reads like a red flag, with the plain-English reason, for the review sheet. */
export function redFlagHint(text: string): string | null {
  for (const [pattern, reason] of RED_FLAG_HINTS) if (pattern.test(text)) return reason;
  return null;
}

/** True when the patient's own words name a diagnosis rather than a symptom. */
export function namesDiagnosis(text: string): boolean {
  return DIAGNOSIS_WORDS.test(text);
}

/** A red flag the case adds: always critical, always data gathering, asked about by name. */
export function redFlagItem(id: string, label: string, exampleQuestion: string, offlineCues: readonly string[]): RubricItem {
  return { id, domain: 'data_gathering', label, critical: true, exampleQuestion, offlineCues: [...offlineCues] };
}

/**
 * The rubric for one case: the standard items, plus its red flags placed after the symptom
 * questions, where a candidate would ask them.
 */
export function rubricFor(redFlags: readonly RubricItem[]): RubricItem[] {
  const before = STANDARD_RUBRIC.slice(0, 5);
  const after = STANDARD_RUBRIC.slice(5);
  return [...before, ...redFlags, ...after];
}
