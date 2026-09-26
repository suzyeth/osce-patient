import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { packFor, packIds, registerPack, SHIPPED_PACK_IDS, type DomainPack } from '../../src/domains/index.js';
import { computeReport } from '../../src/report.js';
import { formatReport } from '../../src/formatReport.js';
import { initialSessionState } from '../../src/state.js';
import { runTurn } from '../../src/orchestrator.js';
import { offlineJudge, offlinePatient } from '../../src/offline.js';
import { parseCase } from '../../src/types.js';
import { NO_EXTRA_DISCLOSURE_RULES } from '../../src/safety.js';
import { buildPatientContext } from '../../src/patientContext.js';

const research = parseCase(JSON.parse(readFileSync(new URL('../../cases/research-checkout.json', import.meta.url), 'utf8')));

const minimal = (over: Partial<DomainPack> = {}): DomainPack => ({
  id: `test-${Math.random().toString(36).slice(2)}`,
  label: 'Test',
  personNoun: 'person',
  learnerNoun: 'learner',
  caveat: 'A test pack.',
  persona: { roleLine: 'You are someone.', factsHeading: 'What you may share', inventionBan: 'Invent nothing.', smallTalkLine: 'Small talk is fine.' },
  safety: { disclosure: NO_EXTRA_DISCLOSURE_RULES, signposting: { practiceOnly: 'This is a test. ' } },
  domains: [{ id: 'asking', label: 'Asking' }],
  gatheringDomainId: 'asking',
  rubric: [{ id: 'a', domain: 'asking', label: 'Asks', critical: false, exampleQuestion: 'Well?', offlineCues: ['well'] }],
  sources: { a: 'somewhere published' },
  statements: [],
  ...over,
});

describe('registering a domain pack', () => {
  it('lists the packs that ship with the tool', () => {
    // Containment, not equality: other tests register packs of their own and there is no way to
    // unregister one, so equality here would pass only while this test happened to run first.
    for (const id of SHIPPED_PACK_IDS) expect(packIds()).toContain(id);
    expect(SHIPPED_PACK_IDS).toEqual(['uk-clinical-history', 'user-research-interview']);
  });

  it('refuses an item in a domain the pack does not declare', () => {
    const bad = minimal({ rubric: [{ id: 'a', domain: 'nope', label: 'Asks', critical: false, exampleQuestion: 'Well?', offlineCues: [] }] });
    expect(() => registerPack(bad)).toThrow(/unknown domain nope/);
  });

  it('refuses a statement that claims to be assessable but cannot judge itself', () => {
    const bad = minimal({
      statements: [{ key: 's', label: 'S', text: 'Did not.', authority: 'ours', source: 'x', assessable: true, notAssessableBecause: '' }],
    });
    expect(() => registerPack(bad)).toThrow(/no assess function/);
  });

  it('refuses a statement that is not assessable and does not say why', () => {
    const bad = minimal({
      statements: [{ key: 's', label: 'S', text: 'Did not.', authority: 'ours', source: 'x', assessable: false, notAssessableBecause: '  ' }],
    });
    expect(() => registerPack(bad)).toThrow(/must say why/);
  });

  it('refuses a claim of a regulator whose source names no body', () => {
    const bad = minimal({
      statements: [
        {
          key: 's',
          label: 'S',
          text: 'Did not.',
          authority: 'regulator',
          source: 'we made this up',
          assessable: false,
          notAssessableBecause: 'not judged here',
        },
      ],
    });
    expect(() => registerPack(bad)).toThrow(/does not name a body/);
    // And the same statement is fine once its source names one.
    expect(() =>
      registerPack(
        minimal({
          statements: [
            {
              key: 's',
              label: 'S',
              text: 'Did not.',
              authority: 'regulator',
              source: 'GMC, Understanding your results',
              assessable: false,
              notAssessableBecause: 'not judged here',
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('refuses the rest of what it used to wave through', () => {
    const item = (id: string, domain = 'asking') => ({ id, domain, label: 'Asks', critical: false, exampleQuestion: 'Well?', offlineCues: [] });
    expect(() => registerPack(minimal({ rubric: [item('a'), item('a')], sources: { a: 'published' } }))).toThrow(/share the id/);
    expect(() => registerPack(minimal({ sources: {} }))).toThrow(/has no source/);
    expect(() => registerPack(minimal({ openingItemId: 'nope' }))).toThrow(/opening item nope is not in its own rubric/);
    expect(() =>
      registerPack(minimal({ domains: [{ id: 'asking', label: 'Asking' }, { id: 'empty', label: 'Empty' }], gatheringDomainId: 'empty' })),
    ).toThrow(/has no items, so order can never be judged/);
  });

  it('refuses the same id twice', () => {
    const pack = minimal();
    registerPack(pack);
    expect(() => registerPack(pack)).toThrow(/already registered/);
  });

  it('names a source for every item it ships', () => {
    for (const id of SHIPPED_PACK_IDS) {
      const pack = packFor(id);
      for (const item of pack.rubric) expect(pack.sources[item.id], `${id}/${item.id}`).toBeTruthy();
    }
  });
});

describe('the engine is not a medical tool', () => {
  it('marks a research interview against the research pack, not the clinical one', () => {
    const r = computeReport(research, initialSessionState());
    expect(r.packId).toBe('user-research-interview');
    expect(r.personNoun).toBe('interviewee');
    expect(r.domains.map((d) => d.id)).toEqual(['gathering', 'rapport', 'analysis']);
    // Nothing clinical leaks in from the other pack.
    expect(JSON.stringify(r)).not.toMatch(/GMC|patient|safety netting/i);
  });

  it('says plainly that its feedback statements are ours, because no body publishes any', () => {
    const r = computeReport(research, initialSessionState());
    expect(r.statements.every((s) => s.authority === 'ours')).toBe(true);
    expect(formatReport(r)).toContain('Nobody publishes a feedback list');
    expect(formatReport(r)).toContain('Our wording, from: Rob Fitzpatrick');
  });

  it('will not score the two habits typing cannot rehearse', () => {
    const r = computeReport(research, initialSessionState());
    const silence = r.statements.find((s) => s.key === 'silence');
    expect(silence?.outcome).toBe('not_assessed');
    expect(silence?.evidence).toContain('no pauses');
    expect(r.statements.find((s) => s.key === 'pitching')?.outcome).toBe('not_assessed');
  });

  it('flags the missed evidence of cost as the critical miss for this field', () => {
    const r = computeReport(research, { ...initialSessionState(), turnsUsed: 1 });
    expect(r.criticalMisses).toEqual(['cost_of_problem']);
    const evidence = r.statements.find((s) => s.key === 'evidence');
    expect(evidence?.outcome).toBe('concern');
    expect(evidence?.evidence).toContain('an opinion, not evidence');
    // The checklist wording is quoted, not bent into a sentence, so the report stays grammatical.
    expect(evidence?.evidence).toContain('You did not cover "Finds what the problem has already cost them"');
  });

  it('does not tell a research interviewee they are a patient', () => {
    const prompt = buildPatientContext(research, initialSessionState());
    expect(prompt).toContain('taking part in a research interview about their own work');
    expect(prompt).toContain('The only things about your work and your situation that you may share right now');
    // Whole words: the persona itself says she is "slightly impatient", which is not a leak.
    for (const word of ['patient', 'doctor', 'symptom', 'health', 'consultation']) {
      expect(prompt.toLowerCase().split(/[^a-z]+/), word).not.toContain(word);
    }
    // The rules that stop the model inventing things are the engine's, so they are still there.
    expect(prompt).toContain('It is not a summary');
    expect(prompt).toContain('Never invent numbers, dates, names, amounts of money');
  });

  it('does not stop a research interview with a medical rule, but still stops self-harm', async () => {
    const judge = offlineJudge();
    const patient = offlinePatient();
    // The review found this exact line stopped: it reads as a symptom to a clinical rule list, and
    // it is an ordinary way to open an interview. The real question in it must survive.
    const ordinary = await runTurn(
      research,
      initialSessionState(),
      'My back is killing me, anyway - walk me through what you did.',
      judge,
      patient,
    );
    expect(ordinary.safetyBlocked).toBe(false);
    expect(ordinary.state.rubricHits.walk_through).toBe(1);

    // Self-harm is the engine's business in every field, so it still pauses.
    const distress = await runTurn(research, initialSessionState(), "I've been having thoughts of ending it all.", judge, patient);
    expect(distress.safetyBlocked).toBe(true);
    expect(distress.reply).toContain('Samaritans free on 116 123');
    // And the pause says what this tool is, in this field's words.
    expect(distress.reply).toContain('fictional person');
    expect(distress.reply).not.toContain('patient');
  });

  it('stops the same line in the clinical field, where it is a disclosure', async () => {
    const clinical = parseCase(JSON.parse(readFileSync(new URL('../../cases/demo-cough.json', import.meta.url), 'utf8')));
    const r = await runTurn(clinical, initialSessionState(), "I've been having a lot of pain in my back for weeks.", offlineJudge(), offlinePatient());
    expect(r.safetyBlocked).toBe(true);
    expect(r.reply).toContain('fictional patient');
  });

  it('runs a whole non-clinical turn through the same engine, gating and all', async () => {
    const judge = offlineJudge();
    const patient = offlinePatient();
    const before = initialSessionState();
    // A question that hits no rubric item unlocks nothing: the gate does not care what field it is.
    const idle = await runTurn(research, before, 'Nice shop.', judge, patient);
    expect(idle.newlyUnlocked).toEqual([]);

    // Asking what the problem has already cost unlocks exactly the fact behind that item.
    const asked = await runTurn(research, before, 'Have you spent anything trying to fix it?', judge, patient);
    expect(asked.newlyUnlocked).toEqual(['f_cost']);
    expect(asked.state.rubricHits.cost_of_problem).toBe(1);

    const r = computeReport(research, asked.state);
    expect(r.criticalMisses).toEqual([]);
    expect(r.items.find((i) => i.id === 'cost_of_problem')?.quote).toBe('Have you spent anything trying to fix it?');
  });
});
