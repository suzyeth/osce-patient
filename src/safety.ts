/**
 * This is an education tool with fictional patients. If a user appears to describe their
 * own real symptoms, we stop and signpost instead of answering (keeps the product outside
 * "symptom checker" territory under MHRA guidance).
 *
 * Precision first: a false block costs an exam candidate time, and the judge's semantic
 * selfDisclosure flag backs this up.
 */
const SYMPTOM = String.raw`(?:pains?|aches?|aching|headaches?|migraines?|dizz(?:y|iness)|faint|breathless|short of breath|palpitations|nause(?:a|ous)|vomiting|sick|bleeding|blood|lumps?|rash|fevers?|temperature|numb(?:ness)?|tingling|tired|exhausted|depressed|anxious|suicidal|cough(?:ing)?|swollen|swelling)`;

// "I've been ...ing", "I've got", "I keep having", "I'm feeling", "I feel".
const EXPERIENCE = String.raw`\bI(?:'?ve| have) been \w+ing\b|\bI'?ve got\b|\bI keep (?:having|getting)\b|\bI(?:'?m| am) (?:having|getting|feeling)\b|\bI feel\b`;

const PATTERNS: readonly RegExp[] = [
  /\bmy (?:own )?(?:real )?symptoms\b/i,
  /\bshould I (?:see|go to|call|ring) (?:a|my) (?:doctor|GP)\b/i,
  /\bshould I go to (?:A&E|hospital)\b/i,
  /\bwhat do you think I(?:'?ve)? (?:have|got)\b/i,
  /\bwhat(?:'?s| is) wrong with me\b/i,
  /\bam I (?:ill|sick|dying)\b/i,
  // First-person experience, then a symptom within six words, never reaching past "you"/"your".
  new RegExp(String.raw`(?:${EXPERIENCE})(?:\s+(?!(?:you|your)\b)\S+){0,6}?\s+${SYMPTOM}\b`, 'i'),
];

export const SAFETY_MESSAGE =
  "This is a practice tool with a fictional patient, so it can't give advice about your own health. " +
  "If you're unwell, contact NHS 111 or your GP, or call 999 in an emergency.";

function normaliseApostrophes(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'");
}

export function looksLikeSelfDisclosure(input: string): boolean {
  const text = normaliseApostrophes(input);
  return PATTERNS.some((p) => p.test(text));
}
