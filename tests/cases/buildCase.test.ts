import { describe, it, expect } from 'vitest';
import { buildCase, reviewSheet, type BuiltCase } from '../../src/cases/buildCase.js';
import { buildExtractionMessages, extractDraftCase, ExtractionError, type DraftCase } from '../../src/cases/extract.js';
import { parseTranscript } from '../../src/cases/transcript.js';
import type { Chat, ChatRequest } from '../../src/nebius/chat.js';
import { MODELS } from '../../src/nebius/config.js';

const SAMPLE = [
  'D: What brings you in today?',
  '',
  "P: I've had a cough for about six weeks and it won't shift.",
  '',
  'D: Have you coughed up any blood?',
  '',
  'P: Last week there was a streak of blood in it, which frightened me.',
  '',
  'D: Do you smoke?',
  '',
  'P: Twenty a day since I was eighteen, I know, I know.',
  '',
  'D: Is there anything you are worried it might be?',
  '',
  "P: My dad died of lung cancer, so that's what's in my head.",
  '',
  'D: Any weight loss?',
  '',
  'P: Maybe half a stone, my belt is looser.',
].join('\n');

const transcript = parseTranscript('RES0001.txt', SAMPLE);

const draft: DraftCase = {
  title: 'Persistent cough in a smoker',
  patient: { name: 'Alan Price', age: 58, persona: 'Retired bus driver, downplays things, a bit gruff.', openingLine: "Morning, doctor. It's this cough." },
  presentingProblem: 'a cough that will not go away',
  facts: [
    { text: "I've had a cough for about six weeks and it won't shift.", kind: 'presenting', rubricItemId: 'open_question', quote: "I've had a cough for about six weeks", line: 3, guardedTerms: [] },
    { text: 'It started about six weeks ago.', kind: 'history', rubricItemId: 'onset_duration', quote: 'about six weeks and it won', line: 3, guardedTerms: ['six weeks'] },
    { text: 'Last week I coughed up a streak of blood.', kind: 'red_flag', rubricItemId: 'haemoptysis', quote: 'a streak of blood in it', line: 7, guardedTerms: ['blood'] },
    { text: 'I smoke twenty a day and have since I was eighteen.', kind: 'history', rubricItemId: 'social_smoking_alcohol', quote: 'Twenty a day since I was eighteen', line: 11, guardedTerms: ['twenty a day', 'eighteen'] },
    { text: "My dad died of lung cancer and I'm frightened it's that.", kind: 'concern', rubricItemId: 'ice_concerns', quote: 'My dad died of lung cancer', line: 15, guardedTerms: ['lung cancer'] },
  ],
  redFlags: [{ id: 'haemoptysis', label: 'Asks about coughing up blood', exampleQuestion: 'Have you coughed up any blood?' }],
};

const built = (over: Partial<DraftCase> = {}) => buildCase({ ...draft, ...over }, transcript, 'res-cough');

describe('buildCase', () => {
  it('builds a case whose facts all carry a checked quote and a line reference', () => {
    const result = built() as BuiltCase;
    expect('patientCase' in result).toBe(true);
    expect(result.rejected).toEqual([]);
    expect(result.patientCase.facts).toHaveLength(5);
    for (const fact of result.patientCase.facts) {
      expect(fact.source.dataset).toBe('fareez2022');
      expect(fact.source.ref).toMatch(/^RES0001\.txt#L\d+$/);
    }
    // The red flag became a critical rubric item, placed among the symptom questions.
    const item = result.patientCase.rubric.find((r) => r.id === 'haemoptysis');
    expect(item).toMatchObject({ critical: true, domain: 'data_gathering' });
    expect(result.patientCase.rubric.map((r) => r.id).indexOf('haemoptysis')).toBe(5);
  });

  it('throws away a fact the patient never said, and says why', () => {
    const invented = { ...draft.facts[0]!, text: 'I also get chest pain at night.', quote: 'I also get chest pain at night', line: 3 };
    const result = built({ facts: [...draft.facts, invented] }) as BuiltCase;
    expect(result.patientCase.facts).toHaveLength(5);
    expect(result.rejected).toEqual([{ fact: invented, reason: 'the quote is not in the transcript' }]);
  });

  it('throws away a quote taken from the doctor, or from the wrong line', () => {
    const fromDoctor = { ...draft.facts[1]!, quote: 'Have you coughed up any blood', line: 5 };
    const wrongLine = { ...draft.facts[3]!, line: 3 };
    const result = built({ facts: [draft.facts[0]!, fromDoctor, wrongLine] }) as BuiltCase;
    expect(result.rejected.map((r) => r.reason)).toEqual([
      expect.stringContaining('the doctor said this'),
      expect.stringContaining('the quote is on line 11, not 3'),
    ]);
  });

  it('drops a fact attached to a rubric item that does not exist', () => {
    const stray = { ...draft.facts[1]!, rubricItemId: 'made_up_item' };
    const result = built({ facts: [draft.facts[0]!, stray] }) as BuiltCase;
    expect(result.rejected[0]?.reason).toBe('no rubric item called "made_up_item"');
  });

  it('drops a guarded term the brief already gives away, and says so', () => {
    const result = built() as BuiltCase;
    // The presenting complaint already says "six weeks", so the duration fact cannot guard it.
    expect(result.patientCase.facts.find((f) => f.rubricItemId === 'onset_duration')?.guardedTerms).toEqual([]);
    expect(result.warnings.join(' ')).toContain('"six weeks" is already in what the candidate is told');
  });

  it("keeps only guarded terms that are in the fact's own words", () => {
    const noisy = { ...draft.facts[2]!, guardedTerms: ['blood', 'pneumonia', 'a'] };
    const result = built({ facts: [draft.facts[0]!, noisy] }) as BuiltCase;
    expect(result.patientCase.facts[1]?.guardedTerms).toEqual(['blood']);
  });

  it('drops a guarded term that belongs to more than one fact', () => {
    const alsoWeekly = { ...draft.facts[3]!, text: 'It has been like this for the last week or so.' };
    const shared = { ...draft.facts[2]!, guardedTerms: ['blood', 'Last week'] };
    const result = built({ facts: [draft.facts[0]!, shared, alsoWeekly] }) as BuiltCase;
    expect(result.patientCase.facts.find((f) => f.kind === 'red_flag')?.guardedTerms).toEqual(['blood']);
    expect(result.warnings.join(' ')).toContain('appears in another fact too');
  });

  it('says when a locked fact is already narrated in the persona', () => {
    const leaky = { ...draft.patient, persona: 'A retired bus driver who coughed up a streak of blood last week.' };
    const result = built({ patient: leaky }) as BuiltCase;
    expect(result.warnings.join(' ')).toContain('which belongs to the locked fact');
  });

  it('says when a red flag is filed as ordinary history, and when the patient names a diagnosis', () => {
    const asHistory = { ...draft.facts[2]!, kind: 'history' as const };
    const diagnosis = { ...draft.facts[4]!, text: 'I think I have a pulmonary embolism.' };
    const result = built({ facts: [draft.facts[0]!, asHistory, diagnosis] }) as BuiltCase;
    const warnings = result.warnings.join(' ');
    expect(warnings).toContain('mentions coughing up blood, which usually needs its own red-flag item');
    expect(warnings).toContain('naming a diagnosis');
  });

  it('keeps exactly one presenting complaint', () => {
    const second = { ...draft.facts[3]!, kind: 'presenting' as const };
    const result = built({ facts: [draft.facts[0]!, second] }) as BuiltCase;
    expect(result.patientCase.facts.filter((f) => f.kind === 'presenting')).toHaveLength(1);
    expect(result.patientCase.facts[1]?.kind).toBe('history');
  });

  it('fails when nothing is left to build on', () => {
    const result = built({ facts: [{ ...draft.facts[0]!, quote: 'nothing like this was ever said', line: 3 }] });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('no presenting complaint') });
  });

  it('gives a concern fact a trust threshold, so rapport can bring it out', () => {
    const result = built() as BuiltCase;
    expect(result.patientCase.facts.find((f) => f.kind === 'concern')?.minTrust).toBe(60);
  });
});

describe('reviewSheet', () => {
  it('puts every fact beside the words it came from, and lists what was dropped', () => {
    const invented = { ...draft.facts[0]!, text: 'I have night sweats.', quote: 'I have night sweats', line: 3 };
    const result = built({ facts: [...draft.facts, invented] }) as BuiltCase;
    const sheet = reviewSheet(result, transcript, ['{"text":"No."}: text: String must contain at least 4 character(s)']);
    expect(sheet).toContain('| [ ] | I smoke twenty a day and have since I was eighteen. | Twenty a day since I was eighteen | 11 |');
    expect(sheet).toContain('| I have night sweats. | the quote is not in the transcript |');
    expect(sheet).toContain('Entries this version could not read');
    expect(sheet).toContain('unreviewed');
    expect(sheet).toContain('Fareez et al. 2022, CC0');
  });
});

describe('extractDraftCase', () => {
  function fakeChat(replies: string[]) {
    const requests: ChatRequest[] = [];
    const chat: Chat = async (request) => {
      requests.push(request);
      const content = replies[Math.min(requests.length - 1, replies.length - 1)]!;
      return { content, finishReason: 'stop', usage: { label: request.label, model: request.model, inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 0 } };
    };
    return { chat, requests };
  }
  const options = { model: MODELS.super, maxTokens: 4000, thinking: false };

  it('sends the numbered transcript and the rubric ids, and returns the draft', async () => {
    const { chat, requests } = fakeChat([JSON.stringify(draft)]);
    const { draft: result, malformed } = await extractDraftCase(chat, transcript, options);
    expect(result.title).toBe(draft.title);
    expect(malformed).toEqual([]);
    expect(requests[0]?.label).toBe('extract');
    const [system, user] = requests[0]!.messages;
    expect(system!.content).toContain('social_smoking_alcohol');
    expect(user!.content).toContain('3\tPATIENT:');
    expect(user!.content).toContain('1\tdoctor:');
  });

  it('repairs once, then gives up with a readable error', async () => {
    const good = fakeChat(['not json', JSON.stringify(draft)]);
    expect((await extractDraftCase(good.chat, transcript, options)).draft.title).toBe(draft.title);
    expect(good.requests).toHaveLength(2);
    const bad = fakeChat(['{"title": "x"}']);
    await expect(extractDraftCase(bad.chat, transcript, options)).rejects.toBeInstanceOf(ExtractionError);
  });

  it('keeps the good facts when one entry is unusable', async () => {
    const withJunk = { ...draft, facts: [...draft.facts, { text: 'No.', kind: 'history', rubricItemId: 'systems_review', quote: 'x', line: 0 }] };
    const { chat } = fakeChat([JSON.stringify(withJunk)]);
    const { draft: result, malformed } = await extractDraftCase(chat, transcript, options);
    expect(result.facts).toHaveLength(draft.facts.length);
    expect(malformed).toHaveLength(1);
    expect(malformed[0]?.reason).toContain('line');
  });

  it('refuses a transcript with almost nothing from the patient', async () => {
    const thin = parseTranscript('X.txt', 'D: Hello\nP: Hi\n');
    const { chat } = fakeChat([JSON.stringify(draft)]);
    await expect(extractDraftCase(chat, thin, options)).rejects.toThrow(/too few patient turns/);
  });

  it('never asks the model to invent: the prompt says copy, not paraphrase', () => {
    const [system] = buildExtractionMessages(transcript);
    expect(system!.content).toContain('copied exactly');
    expect(system!.content).toContain('thrown away');
  });
});
