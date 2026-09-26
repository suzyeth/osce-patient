/**
 * What the simulated person may say when the case has nothing to say.
 *
 * Measured three times on eval/fixtures/off-case.demo-cough.json, the prompt alone does not hold this
 * line. Asked about something the case never mentions, the model answered with content the case
 * cannot support 70% of the time; telling it the list is not a summary and giving it these exact words
 * brought that to 55%; changing the ban on "no" into a reason and a consequence took it back to 65%,
 * and changed the shape of the failure for the worse - instead of a bare "No." it began decorating the
 * denial ("No chest pain. Just this stubborn cough.", "My wife's fine, kids are grown and live
 * elsewhere"), which is a fabricated history a candidate would write down.
 *
 * Twenty graded answers cannot separate variants two answers apart, so tuning the wording further
 * would be tuning inside the noise.
 *
 * Enforcing it in code is the right answer and is not possible yet. respondGuarded can replace a reply
 * that is not one of these, and does when asked to, but deciding WHICH turns to ask that of needs a
 * signal the engine does not have. "Nothing credited and no fact in reach" looked like it, and it is
 * not: "How are you?" is exactly that shape, and hedging at it would make the patient look broken.
 * Telling an off-case question from small talk needs the judge to say so, which means one more field
 * in its output and re-measuring the judge. That is the next step, not another prompt.
 */
export const OFF_CASE_ANSWERS: readonly string[] = [
  "I'm not sure",
  "I haven't noticed anything like that",
  "I don't know, nobody has ever told me",
];

/** What replaces a reply that would have asserted something the case cannot support. */
export const OFF_CASE_FALLBACK = "I'm not sure.";

/** Sent back to the model once before the fallback is used. */
export const OFF_CASE_WARNING =
  '\n\nNote: your previous answer stated something that is not in your list of facts. You have no ' +
  `information about it either way. Reply with exactly one of these and nothing else: "${OFF_CASE_ANSWERS.join('", "')}".`;

/** Punctuation, case and curly quotes removed, so wording can be compared to the permitted answers. */
function bare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a reply says only that the person does not know. A hedge with anything added to it is not
 * one: "No chess pain. Just this stubborn cough." and "I'm not sure, but my wife is fine" both assert
 * something, and the second is the failure that decorating the denial produced.
 */
export function isOffCaseAnswer(reply: string): boolean {
  const said = bare(reply);
  if (said === '') return false;
  return OFF_CASE_ANSWERS.some((answer) => {
    const permitted = bare(answer);
    // Allow a small amount of hedging around it ("I'm not sure, sorry") but nothing that carries
    // content: at most two extra words, none of which is a negation.
    if (!said.includes(permitted)) return false;
    const extra = said.replace(permitted, ' ').split(' ').filter((w) => w !== '');
    return extra.length <= 2 && !extra.some((w) => ['no', 'not', 'never', 'none', 'nothing'].includes(w));
  });
}
