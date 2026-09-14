/**
 * This is an education tool with fictional patients. If a user appears to describe their
 * own real symptoms, we stop and signpost instead of answering (keeps the product outside
 * "symptom checker" territory under MHRA guidance).
 *
 * Division of labour: this regex is a high-precision core that runs before any model call
 * and in offline mode. Recall on free-form wording belongs to the judge's semantic
 * selfDisclosure flag. Three rounds of held-out probing showed that broad first-person
 * patterns keep blocking ordinary candidate phrasing, and a false block costs exam time.
 * So every pattern here is anchored on both sides: an explicit first-person phrase before
 * the symptom, and only a clause end or a short list of words after it.
 */
const SYMPTOM_NOUNS = String.raw`(?:pains?|aches?|headaches?|migraines?|dizziness|palpitations|nausea|vomiting|bleeding|blood|lumps?|rash(?:es)?|fevers?|temperature|numbness|tingling|cough|swelling|sore throat|diarrh(?:o)?ea|cramps?|breathlessness|shortness of breath|nosebleeds?)`;
const SYMPTOM_ADJECTIVES = String.raw`(?:dizzy|faint|sick|nauseous|breathless|unwell|ill|tired|exhausted|hopeless|depressed|anxious|suicidal|feverish|shaky)`;
// The examiner's own hands and fingers are excluded: "tell me when my hand hurts".
const BODY = String.raw`(?:head|chest|back|stomach|tummy|belly|abdomen|throat|neck|breasts?|armpits?|groin|arms?|legs?|knees?|feet|foot|ankles?|ears?|eyes?|nose|mouth|gums|lips?|teeth|tooth|heart|side|joints?|skin|bladder|bowels?|stool|urine|poo|pee|wee|sputum|phlegm|period)`;
const MODIFIER = String.raw`(?:a|an|some|really|very|so|quite|bad|terrible|awful|sharp|severe|constant|horrible|little|bit of|lot of|${BODY})`;

// What may follow a symptom: a clause end, or words that keep talking about having it.
// Anything else ("cough medicine", "headache diary", "discharge letter") cancels the match.
const AFTER = String.raw`(?=\s*(?:[,.!?;]|$)|\s+(?:in|on|for|since|when|every|at|all|again|lately|recently|today|tonight|now|right now|and|is|keeps|myself|too|as well|that won't|which won't|be|a)\b)`;
const CLAUSE_END = String.raw`(?=\s*(?:[,.!?;]|$))`;

const HAVE_OPENER = String.raw`I(?:'?ve| have) been (?:having|getting)|I keep (?:having|getting)|I(?:'?m| am) having|I(?:'?ve| have) got|I(?:'?ve| have) had`;

// Symptom wording in the first person. Skipped in recaps ("So I've got chest pain so far, is that right?").
const FIRST_PERSON_SYMPTOM: readonly RegExp[] = [
  // "I've got a lump in my neck", "I keep getting headaches", "I'm having palpitations right now".
  new RegExp(String.raw`\b(?:${HAVE_OPENER})\s+(?:${MODIFIER}\s+){0,3}${SYMPTOM_NOUNS}\b${AFTER}`, 'i'),
  // "I feel really sick today", "I've been feeling dizzy lately".
  new RegExp(
    String.raw`\bI(?:'?ve been| have been)? ?(?:feel|feeling|felt) (?:(?:really|very|so|quite|a bit|a little|pretty|extremely|always)\s+)*${SYMPTOM_ADJECTIVES}\b(?=\s*(?:[,.!?;]|$)|\s+(?:today|lately|recently|all the time|when|at night|and|since|for (?:days|weeks|months|ages|a while))\b)`,
    'i',
  ),
  // "I'm really dizzy and can't stand up".
  new RegExp(String.raw`\bI(?:'?m| am) (?:really |so |very )?(?:dizzy|faint|breathless|nauseous)\b${AFTER}`, 'i'),
  // "My chest hurts", "my knee has been swollen for a week".
  new RegExp(
    String.raw`\bmy ${BODY}\s+(?:hurts|aches|is (?:sore|painful|swollen|bleeding|killing me)|has been (?:hurting|aching|swollen|bleeding|killing me))\b(?!\s+(?:you|to)\b)`,
    'i',
  ),
  // "my sore throat", "Could my chest pain be my heart?".
  new RegExp(String.raw`(?<!\b(?:excuse|pardon)\s)\bmy (?:${BODY}\s+)?${SYMPTOM_NOUNS}\b${AFTER}`, 'i'),
  // "blood in my stool", "a lump I found in my breast", "blood when I pee".
  new RegExp(
    String.raw`\b${SYMPTOM_NOUNS}(?:\s+[\w'-]+){0,3}?\s+(?:in|on|from) my ${BODY}\b|\b${SYMPTOM_NOUNS} when I (?:pee|wee|poo|cough|breathe|eat|swallow)\b`,
    'i',
  ),
];
const RECAP = /\b(?:so far|is that (?:right|correct)|to recap|to summari[sz]e|let me summari[sz]e|just to check)\b/i;

// Asking for advice about the speaker's own health.
const EXPLICIT: readonly RegExp[] = [
  /\bmy (?:own )?(?:real )?symptoms\b/i,
  new RegExp(String.raw`\bshould I (?:see|go to|call|ring) (?:a|my) (?:doctor|GP)\b(?=\s*(?:[,.!?;]|$)|\s+(?:about|for me)\b)`, 'i'),
  new RegExp(String.raw`\bshould I go to (?:the )?(?:A&E|hospital)${CLAUSE_END}`, 'i'),
  /\bwhat do you think I(?:'?ve)? (?:have|got)\b/i,
  /\bwhat do I have\s*(?:[?!]|$)/i,
  /\bwhat(?:'?s| is) wrong with me\b(?=\s*(?:[?.!,]|$))/i,
  /\bam I (?:ill|sick|dying)\b/i,
  /\bwhat (?:should|can) I take\b(?=\s*(?:[?.!,]|$)|\s+for (?:it|this|that|the pain)\b)/i,
  /\bI(?:'?ve| have) been (?:coughing|vomiting|bleeding|wheezing|fainting|throwing up|in (?:a lot of |so much )?pain)\b/i,
  /\bI(?:'?m| am) in (?:a lot of |so much )?pain\b(?!\s+(?:team|clinic|service|management|medicine|department)\b)/i,
  /\bI can(?:'?t|not) (?:breathe|stop (?:coughing|vomiting|bleeding|shaking|crying))\b/i,
  /\bI(?:'?m| am) (?:\d+ weeks |still |now |maybe |possibly )?pregnant\b/i,
  /\bI(?:'?m| am) (?:worried|scared|afraid|frightened) (?:that )?I (?:might |may |could )?(?:have|have got|'ve got|am having|'m having) (?:a )?(?:cancer|heart attack|stroke|tumour|tumor|blood clot)\b/i,
  /\bI (?:think|feel like) I(?:'?m| am| might| may| could)? (?:be |going to |about to )?(?:have |having )?(?:a )?(?:heart attack|panic attack|stroke|pass out|faint|be sick)\b/i,
  // Someone the user cares for, plus a request for advice.
  /\bmy (?:child|son|daughter|baby|kid|husband|wife|partner|mum|mom|mother|dad|father)\b[^.?!]{0,60}\b(?:what should I do|should I (?:take|give|call|go))\b/i,
];

// Self-harm and suicide, first person only; a doctor asks about "you" and "yourself".
const SELF_HARM: readonly RegExp[] = [
  /\bI want to (?:die|kill myself|end (?:it all|my life))\b/i,
  /\bI(?:'?m| am) (?:going to|gonna) (?:kill|hurt|harm) myself\b/i,
  /\bI(?:'?ve| have)? ?(?:been )?(?:self[- ]harming|hurting myself|harming myself|cutting myself)\b/i,
  new RegExp(String.raw`\bI (?:don'?t|do not) want to (?:live|be alive|be here)(?:\s+any ?more)?${CLAUSE_END}`, 'i'),
  /\bI(?:'?ve| have)? ?(?:been )?(?:having |had )?thoughts? (?:of|about) (?:ending it all|ending my life|killing myself|suicide)\b/i,
  /\bI(?:'?ve| have)? (?:took|taken) (?:too many (?:pills|tablets|paracetamol)|an overdose|all my (?:pills|tablets|medication))\b/i,
  /\bI(?:'?m| am|'?ve felt| have felt|'?ve been feeling| have been feeling| feel| felt) (?:\w+\s+)?suicidal\b/i,
  // "myself" and "I" make these first person; a doctor asks about "yourself".
  /\b(?:thinking|thought|think) (?:about|of) (?:killing|hurting|harming) myself\b/i,
  /\bI (?:cut|burned|burnt|hurt|harmed) myself\b/i,
  /\b(?:feel like|want to) (?:hurt(?:ing)?|harm(?:ing)?|cut(?:ting)?) myself\b/i,
  /\bI(?:'?ve| have)? (?:planned|decided) (?:how|when) (?:I'?m going to |I am going to |to )?(?:end it|kill myself|die)\b/i,
  /\bI(?:'?ve| have)? (?:took|taken) (?:a load of|loads of|lots of|too much|a lot of|all the|a bottle of|a packet of|a box of) (?:paracetamol|pills|tablets|co-codamol|codeine|my (?:pills|tablets|medication))\b/i,
  /\bI(?:'?m| am) (?:worried|scared|afraid) I (?:might|will|could) overdose\b/i,
  /\bmaking myself sick\b/i,
];

export const SAFETY_MESSAGE =
  "This is a practice tool with a fictional patient, so it can't give advice about your own health. " +
  "If you're unwell, contact NHS 111 or your GP, or call 999 in an emergency. " +
  "If you're struggling or thinking about harming yourself, you can call Samaritans free on 116 123.";

/** Straightens apostrophes and drops quoted speech ("some patients say 'I want to die'"). */
function normalise(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/"[^"]*"/g, ' ');
}

export function looksLikeSelfDisclosure(input: string): boolean {
  const text = normalise(input);
  if (SELF_HARM.some((p) => p.test(text)) || EXPLICIT.some((p) => p.test(text))) return true;
  if (RECAP.test(text)) return false;
  return FIRST_PERSON_SYMPTOM.some((p) => p.test(text));
}
