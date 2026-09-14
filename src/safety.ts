/**
 * This is an education tool with fictional patients. If a user appears to describe their
 * own real symptoms, we stop and signpost instead of answering (keeps the product outside
 * "symptom checker" territory under MHRA guidance).
 *
 * Precision first: a false block costs an exam candidate time, and the judge's semantic
 * selfDisclosure flag backs this up. Every pattern needs first-person wording tied to a
 * symptom; wording about "you", "your", "the pain" or "any bleeding" is never matched.
 */
const SYMPTOM_WORDS = String.raw`(?:pains?|aches?|aching|headaches?|migraines?|dizz(?:y|iness)|faint|pass(?:ing)? out|breathless|short of breath|palpitations|nause(?:a|ous)|vomiting|sick|bleeding|blood|lumps?|rash|fevers?|temperature|numb(?:ness)?|tingling|tired|exhausted|depressed|anxious|suicidal|cough(?:ing)?|swollen|swelling|sore throat)`;

// "blood test", "temperature chart" and similar are equipment or results, not symptoms.
const SYMPTOM = String.raw`${SYMPTOM_WORDS}\b(?!\s+(?:pressure|tests?|results?|cuff|machine|chart|probe|forms?|samples?|count)\b)`;

// First-person openers: "I've been ...ing", "I've got/had/noticed", "I have", "I get",
// "I keep having", "I'm feeling", "I feel".
const OPENER = String.raw`\bI(?:'?ve| have) been \w+ing\b|\bI(?:'?ve| have) (?:got|had|noticed)\b|\bI have\b|\bI get\b|\bI keep (?:having|getting)\b|\bI(?:'?m| am) (?:having|getting|feeling)\b|\bI feel\b`;

// Words a candidate uses to talk ABOUT a symptom ("the pain", "any bleeding", "your cough").
// The gap between opener and symptom may not cross them, or any punctuation.
const STOP = String.raw`you|your|the|that|this|these|those|any|some|about|whether|if|like|to|of|on|for|with|over|into|around|regarding|results|note|sense|picture|impression|questions?`;
const GAP = String.raw`(?:\s+(?!(?:${STOP})\b)[\w'-]+){0,6}?\s+`;

const EXPERIENCE = new RegExp(String.raw`(?:${OPENER})${GAP}${SYMPTOM}`, 'i');

// Recaps repeat the patient's words in the first person ("So I've got chest pain so far, is that right?").
const RECAP = /\b(?:so far|is that (?:right|correct)|to recap|to summari[sz]e|let me summari[sz]e|just to check)\b/i;

const EXPLICIT: readonly RegExp[] = [
  /\bmy (?:own )?(?:real )?symptoms\b/i,
  /\bshould I (?:see|go to|call|ring) (?:a|my) (?:doctor|GP)\b/i,
  /\bshould I go to (?:the )?(?:A&E|hospital)\b/i,
  /\bwhat do you think I(?:'?ve)? (?:have|got)\b/i,
  /\bwhat(?:'?s| is) wrong with me\b(?=\s*(?:[?.!,]|$))/i,
  /\bam I (?:ill|sick|dying)\b/i,
  // Self-harm is always first person here; a doctor asks about "yourself".
  /\b(?:kill|killing|hurt|hurting|harm|harming) myself\b|\bI want to die\b|\bend(?:ing)? my (?:own )?life\b/i,
  /\bI(?:'?m| am| feel| felt|'?ve felt| have felt|'?ve been feeling| have been feeling)\s+(?:\w+\s+)?suicidal\b/i,
];

const FIRST_PERSON_STATE: readonly RegExp[] = [
  // "I've been coughing for weeks": the -ing word is itself the symptom.
  /\bI(?:'?ve| have) been (?:coughing|vomiting|bleeding|wheezing|fainting|throwing up|in (?:a lot of |so much )?pain)\b/i,
  // "I'm really dizzy", "I'm in pain".
  /\bI(?:'?m| am) (?:(?:really|so|very|quite|feeling|a bit|a little)\s+)*(?:dizzy|faint|breathless|nauseous|unwell|ill|in pain|bleeding)\b/i,
  // "My chest hurts".
  /\bmy (?:[\w'-]+\s+){0,2}?(?:hurts|aches|is (?:sore|painful|swollen|bleeding|killing me))\b/i,
  // "my sore throat", "my chest pain", but not "in my experience ...".
  new RegExp(String.raw`\bmy (?:(?!(?:experience|opinion|view|understanding|notes)\b)[\w'-]+\s+)?${SYMPTOM}`, 'i'),
  // "a lump I found on my breast".
  new RegExp(String.raw`${SYMPTOM_WORDS}(?:\s+[\w'-]+){0,3}?\s+(?:in|on) my\b(?!\s+(?:experience|opinion|view|practice|clinic|notes|mind)\b)`, 'i'),
  // "I think I might have a heart attack", "I feel like I'm going to pass out".
  new RegExp(String.raw`\bI (?:think|worry|feel like) I(?:'?m| am| might| may| could)? (?:be |going to |about to )?(?:have |having |had )?(?:a )?(?:heart attack|stroke|${SYMPTOM})`, 'i'),
];

export const SAFETY_MESSAGE =
  "This is a practice tool with a fictional patient, so it can't give advice about your own health. " +
  "If you're unwell, contact NHS 111 or your GP, or call 999 in an emergency. " +
  "If you're struggling or thinking about harming yourself, you can call Samaritans free on 116 123.";

function normaliseApostrophes(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'");
}

export function looksLikeSelfDisclosure(input: string): boolean {
  const text = normaliseApostrophes(input);
  if (EXPLICIT.some((p) => p.test(text))) return true;
  if (FIRST_PERSON_STATE.some((p) => p.test(text))) return true;
  return EXPERIENCE.test(text) && !RECAP.test(text);
}
