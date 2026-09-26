import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { packFor, packIds, registerPack, type DomainPack } from '../../src/domains/index.js';
import { computeReport } from '../../src/report.js';
import { formatReport } from '../../src/formatReport.js';
import { initialSessionState } from '../../src/state.js';
import { runTurn } from '../../src/orchestrator.js';
import { offlineJudge, offlinePatient } from '../../src/offline.js';
import { parseCase } from '../../src/types.js';

const research = parseCase(JSON.parse(readFileSync(new URL('../../cases/research-checkout.json', import.meta.url), 'utf8')));

const minimal = (over: Partial<DomainPack> = {}): DomainPack => ({
  id: `test-${Math.random().toString(36).slice(2)}`,
  label: 'Test',
  personNoun: 'person',
  learnerNoun: 'learner',
  caveat: 'A test pack.',
  domains: [{ id: 'asking', label: 'Asking' }],
  gatheringDomainId: 'asking',
  rubric: [{ id: 'a', domain: 'asking', label: 'Asks', critical: false, exampleQuestion: 'Well?', offlineCues: ['well'] }],
  sources: { a: 'somewhere published' },
  statements: [],
  ...over,
});

describe('registering a domain pack', () => {
  it('lists the packs that ship with the tool', () => {
    expect(packIds()).toEqual(['uk-clinical-history', 'user-research-interview']);
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

  it('refuses the same id twice', () => {
    const pack = minimal();
    registerPack(pack);
    expect(() => registerPack(pack)).toThrow(/already registered/);
  });

  it('names a source for every item it ships', () => {
    for (const id of packIds()) {
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
    const r = computeReport(research, initialSessionState());
    expect(r.criticalMisses).toEqual(['cost_of_problem']);
    const evidence = r.statements.find((s) => s.key === 'evidence');
    expect(evidence?.outcome).toBe('concern');
    expect(evidence?.evidence).toContain('an opinion, not evidence');
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
