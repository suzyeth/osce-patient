/**
 * This is an education tool with fictional patients. If a user appears to describe their
 * own real symptoms, we stop and signpost instead of answering (keeps the product outside
 * "symptom checker" territory under MHRA guidance).
 *
 * Division of labour: this regex is a high-precision core that runs before any model call
 * and in offline mode. Recall on free-form wording belongs to the judge's semantic
 * selfDisclosure flag. Three rounds of held-out probing showed that broad first-person
 * patterns keep blocking ordinary candidate phrasing, and a false block costs exam time.
 * So every first-person symptom pattern is anchored on both sides: an explicit first-person
 * phrase before the symptom, and only a clause end or a short list of words after it.
 * Quoted speech is ignored, because candidates reflect and quote what patients say.
 */
const SYMPTOM_NOUNS = String.raw`(?:pains?|aches?|headaches?|migraines?|dizziness|palpitations|nausea|vomiting|bleeding|blood|lumps?|rash(?:es)?|fevers?|temperature|numbness|tingling|cough|swelling|sore throat|diarrh(?:o)?ea|cramps?|breathlessness|shortness of breath|nosebleeds?)`;
// After a first-person opener, "blood" and "temperature" are usually measurements or procedures
// ("I've got blood in both bottles", "I keep getting a temperature on the tympanic"). Blood in
// the user's own body is still caught by the "in/on/from my <body part>" pattern.
const OWN_SYMPTOM_NOUNS = String.raw`(?:pains?|aches?|headaches?|migraines?|dizziness|palpitations|nausea|vomiting|bleeding|lumps?|rash(?:es)?|fevers?|numbness|tingling|cough|swelling|sore throat|diarrh(?:o)?ea|cramps?|breathlessness|shortness of breath|nosebleeds?)`;
const SYMPTOM_ADJECTIVES = String.raw`(?:dizzy|faint|sick|nauseous|breathless|unwell|ill|tired|exhausted|hopeless|depressed|anxious|suicidal|feverish|shaky)`;
// The examiner's own hands and fingers are excluded: "tell me when my hand hurts".
const BODY = String.raw`(?:head|chest|back|stomach|tummy|belly|abdomen|throat|neck|breasts?|armpits?|groin|arms?|legs?|knees?|feet|foot|ankles?|ears?|eyes?|nose|mouth|gums|lips?|teeth|tooth|heart|side|joints?|skin|bladder|bowels?|stool|urine|poo|pee|wee|sputum|phlegm|period)`;
const MODIFIER = String.raw`(?:a|an|some|really|very|so|quite|bad|terrible|awful|sharp|severe|constant|horrible|little|bit of|lot of|${BODY})`;

const CLAUSE_END = String.raw`(?=\s*(?:[,.!?;]|$))`;
const SENTENCE_END = String.raw`(?=\s*(?:[.!?;]|$))`;
// Words that keep talking about having the symptom: time, repetition, or where on "my" body.
const ONGOING = String.raw`for|since|every|all|again|lately|recently|today|tonight|now|right now|myself|too|as well|that won't|which won't`;
// After a strong opener or "my <symptom>": a clause end, ongoing words, "in/on", "and", "is",
// "keeps", or "be"/"a" for questions like "Could my chest pain be my heart?" and
// "Is my headache a brain tumour?".
const AFTER = String.raw`(?:${CLAUSE_END}|(?=\s+(?:${ONGOING}|in|on|at|when|and|is|keeps|be|a)\b))`;
// A real time phrase. "all over the trunk", "every time I've seen this drug" and "a lump for
// you to feel" are not durations.
const DURATION = String.raw`(?:since|lately|recently|today|tonight|all (?:day|night|week|morning|the time)|every (?:day|night|morning|week|month)|for (?:days|weeks|months|years|ages|a while)|for (?:(?:the )?(?:past|last) |about |over |nearly |almost )?(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|a few|few|several|many|a couple of)(?:\s+\w+)?\s+(?:days?|weeks?|months?|years?|while))`;
// After "I've got" or "I've had", which examiners also use to narrate findings ("I've got a
// lump now.", "I've got swelling as well, both ankles"): only a duration or "in/on/from my
// <body part>". A bare "I've got a lump." is left to the judge.
const AFTER_WEAK = String.raw`(?:(?=\s+${DURATION}\b)|(?=\s+(?:in|on|from) my ${BODY}\b))`;
// After a strong opener: a clause end, a duration, words that keep talking about having it,
// or "in/on/at/from my <body part>" ("bleeding at the cannula site" is a procedure).
const AFTER_STRONG = String.raw`(?:${CLAUSE_END}|(?=\s+(?:${DURATION}|again|now|right now|myself|too|as well|that won't|which won't|when|and|is|keeps)\b)|(?=\s+(?:in|on|at|from) my ${BODY}\b))`;

// Only patients say these about themselves.
const STRONG_OPENER = String.raw`I(?:'?ve| have) been (?:having|getting)|I keep (?:having|getting)|I(?:'?m| am) having`;
const WEAK_OPENER = String.raw`I(?:'?ve| have) got|I(?:'?ve| have) had`;

// Symptom wording in the first person. Skipped in recaps ("So I've got chest pain so far, is that right?").
const FIRST_PERSON_SYMPTOM: readonly RegExp[] = [
  // "I keep getting headaches, is that bad?", "I'm having palpitations right now".
  new RegExp(String.raw`\b(?:${STRONG_OPENER})\s+(?:${MODIFIER}\s+){0,3}${OWN_SYMPTOM_NOUNS}\b${AFTER_STRONG}`, 'i'),
  // "I've got a lump in my neck", "I've had chest pain for three days".
  new RegExp(String.raw`\b(?:${WEAK_OPENER})\s+(?:${MODIFIER}\s+){0,3}${OWN_SYMPTOM_NOUNS}\b${AFTER_WEAK}`, 'i'),
  // "I feel really sick today", "I'm feeling dizzy", "I've been feeling dizzy lately".
  new RegExp(
    String.raw`\bI(?:'?ve been| have been|'?m| am)? ?(?:feel|feeling|felt) (?:(?:really|very|so|quite|a bit|a little|pretty|extremely|always)\s+)*${SYMPTOM_ADJECTIVES}\b(?:${CLAUSE_END}|(?=\s+(?:today|lately|recently|all the time|when|at night|and|since|for (?:days|weeks|months|ages|a while))\b))`,
    'i',
  ),
  // "I'm really dizzy and can't stand up".
  new RegExp(String.raw`\bI(?:'?m| am) (?:really |so |very )?(?:dizzy|faint|breathless|nauseous)\b${AFTER}`, 'i'),
  // "My chest hurts", "my knee has been swollen for a week".
  new RegExp(
    String.raw`\bmy ${BODY}\s+(?:hurts|aches|is (?:sore|painful|swollen|bleeding|killing me)|has been (?:hurting|aching|swollen|bleeding|killing me))\b(?!\s+(?:you|to)\b)`,
    'i',
  ),
  // "my sore throat", "Could my chest pain be my heart?"; not "excuse my cough".
  new RegExp(String.raw`(?<!\b(?:excuse|pardon)\s)\bmy (?:${BODY}\s+)?${SYMPTOM_NOUNS}\b${AFTER}`, 'i'),
  // "blood in my stool", "a lump I found in my breast", "blood when I pee"; not a candidate
  // pointing at themselves ("the pain in my chest area, like this").
  new RegExp(
    String.raw`\b${SYMPTOM_NOUNS}(?:\s+[\w'-]+){0,3}?\s+(?:in|on|from) my ${BODY}\b(?!\s+(?:area|like this|here)\b)|\b${SYMPTOM_NOUNS} when I (?:pee|wee|poo|cough|breathe|eat|swallow)\b`,
    'i',
  ),
];
const RECAP = /\b(?:so far|is that (?:right|correct)|to recap|to summari[sz]e|let me summari[sz]e|just to check)\b/i;

// Asking for advice about the speaker's own health.
const EXPLICIT: readonly RegExp[] = [
  /\bmy (?:own )?(?:real )?symptoms\b/i,
  new RegExp(String.raw`\bshould I (?:see|go to|call|ring) (?:a|my) (?:doctor|GP)\b(?:${CLAUSE_END}|(?=\s+(?:about|for me)\b))`, 'i'),
  new RegExp(String.raw`\bshould I go to (?:the )?(?:A&E|hospital)${CLAUSE_END}`, 'i'),
  /\bwhat do you think I(?:'?ve)? (?:have|got)\b/i,
  /\bwhat do I have\s*(?:[?!]|$)/i,
  new RegExp(String.raw`\bwhat(?:'?s| is) wrong with me\b${CLAUSE_END}`, 'i'),
  /\bam I (?:ill|sick|dying)\b/i,
  new RegExp(String.raw`\bwhat (?:should|can) I take\b(?:${CLAUSE_END}|(?=\s+for (?:it|this|that|the pain)\b))`, 'i'),
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

// Quoted speech: at most 200 characters on one line, so a stray quote cannot hide the rest of
// a message and the scan stays linear. A single quote opens only after a space, "(" or the
// start (not the informal "'til", "'cause", "'em"), and closes only before punctuation, a space
// or the end, so apostrophes inside words ("I've", "won't") are left alone.
const DOUBLE_QUOTED = /"[^"\n]{1,200}"/g;
const SINGLE_QUOTED = /(?<=^|[\s(])'(?!(?:til|cause|cos|em|bout|round|n)\b)(?:[^'\n]|'(?=[a-z])){1,200}?'(?=[\s,.!?;:)]|$)/gi;

/** Drops a quoted span only when it is several words (speech), not a single scare-quoted word. */
function dropSpeech(span: string): string {
  return /\s/.test(span) ? ' ' : span;
}

/**
 * Straightens quotes and drops quoted speech, so "You said 'I've got a lump in my neck'" and
 * 'Some patients say "I want to die"' are not read as the user's own words.
 */
function normalise(s: string): string {
  return s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(DOUBLE_QUOTED, dropSpeech)
    .replace(SINGLE_QUOTED, dropSpeech);
}

export function looksLikeSelfDisclosure(input: string): boolean {
  const text = normalise(input);
  if (SELF_HARM.some((p) => p.test(text)) || EXPLICIT.some((p) => p.test(text))) return true;
  if (RECAP.test(text)) return false;
  return FIRST_PERSON_SYMPTOM.some((p) => p.test(text));
}
