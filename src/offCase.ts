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
 * So the engine enforces it. The judge says whether a line asked for information a case file would
 * hold (asksAboutFacts), which is what separates a question the case cannot answer from small talk;
 * on the first kind, a reply that is not one of these is asked for again and then replaced. Measured
 * after that: 0% unsupported, with 13 of 20 replies caught and asked again, so the model still asserts
 * something on most of these questions and it no longer reaches the candidate.
 *
 * "Nothing credited and no fact in reach" is not enough on its own, and the first wording of the judge
 * field was not either. It called "How are you today?" a question about the patient, which is true and
 * useless: the patient then answered small talk with "I'm not sure" and suppressed the opening it would
 * otherwise have given. The instruction now asks for information a case file would record and names
 * greetings as not that, which the smoke test covers because that is how it will show if it breaks.
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
