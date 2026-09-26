import { quoteLabels, registerPack, type DomainPack, type FeedbackStatement, type Observations, type StatementJudgement } from './pack.js';
import { DOMAIN_LABEL, FEEDBACK_STATEMENTS } from '../feedback.js';
import { RUBRIC_SOURCES, STANDARD_RUBRIC } from '../cases/rubric.js';

const GMC_SOURCE = 'GMC, Understanding your results (PLAB 2 guide), read 2026-09-26';

/** Judged from the order the items were covered in; see sessionOrder in report.ts. */
const consultation = (obs: Observations): StatementJudgement => ({
  outcome: obs.order.ordered ? 'no_concern' : 'concern',
  evidence: obs.order.detail,
  quotes: [],
});

const issues = (obs: Observations): StatementJudgement => {
  if (obs.missedCritical.length > 0) {
    return {
      outcome: 'concern',
      evidence: `You did not cover ${quoteLabels(obs.missedCritical)}. In this case that is what decides what has to happen to the patient next.`,
      quotes: [],
    };
  }
  return {
    outcome: 'no_concern',
    evidence: obs.hasCritical
      ? 'You asked about everything in this case that would change what happens next.'
      : 'This case has no single overriding priority, so there was nothing here to miss.',
    quotes: [],
  };
};

const time = (obs: Observations): StatementJudgement =>
  obs.turnsUsed > obs.roomForTurns
    ? {
        outcome: 'concern',
        evidence: `You asked ${obs.turnsUsed} questions. ${obs.minutes} minutes of talking leaves room for roughly ${obs.roomForTurns}, so in the exam this consultation would not have fitted. Typing here is not timed, so this is about how much you asked, not how fast you speak.`,
        quotes: [],
      }
    : {
        outcome: 'no_concern',
        evidence: `You asked ${obs.turnsUsed} questions, within the ${obs.roomForTurns} or so that ${obs.minutes} minutes of talking allows. Typing here is not timed, so this says nothing about your pace when speaking.`,
        quotes: [],
      };

const rapport = (obs: Observations): StatementJudgement => {
  if (obs.concernElicited === false) {
    return {
      outcome: 'concern',
      evidence:
        'You did not find out what the patient was worried about. That is the part of rapport a typed station can see; warmth of voice and manner is not.',
      quotes: [],
    };
  }
  if (obs.empathyTurns.length === 0) {
    return {
      outcome: 'concern',
      evidence:
        'Nothing you wrote acknowledged how the patient felt. The exam judges this partly from voice and manner, which a typed station cannot see at all.',
      quotes: [],
    };
  }
  return {
    outcome: 'no_concern',
    evidence: `You acknowledged how the patient felt at ${obs.list(obs.empathyTurns)}.${
      obs.concernElicited === true ? ' You also found out what they were worried about.' : ''
    } Warmth of voice and manner is not visible here.`,
    quotes: obs.quotesFrom(obs.empathyTurns),
  };
};

const listening = (obs: Observations): StatementJudgement =>
  obs.interruptedTurns.length > 0
    ? {
        outcome: 'concern',
        evidence: `You moved on before the patient had finished at ${obs.list(obs.interruptedTurns)}. Non-verbal cues are the other half of this statement and cannot be judged from typing.`,
        quotes: obs.quotesFrom(obs.interruptedTurns),
      }
    : {
        outcome: 'no_concern',
        evidence:
          'You let the patient finish, and picked up what they said. Non-verbal cues are the other half of this statement and cannot be judged from typing.',
        quotes: [],
      };

const language = (obs: Observations): StatementJudgement => {
  const problems: string[] = [];
  if (obs.jargonTurns.length > 0) {
    problems.push(`you used medical words the patient may not know at ${obs.list(obs.jargonTurns)}`);
  }
  const closing = obs.itemById('closing');
  if (closing && !closing.covered) problems.push('you did not check the patient had understood, or invite their questions');
  return problems.length > 0
    ? {
        outcome: 'concern',
        evidence: `In this consultation ${problems.join(', and ')}. Speaking too quickly is also part of this statement and cannot be judged from typing.`,
        quotes: obs.quotesFrom(obs.jargonTurns),
      }
    : {
        outcome: 'no_concern',
        evidence:
          'You kept to plain words and checked the patient had understood. Speaking too quickly is also part of this statement and cannot be judged from typing.',
        quotes: [],
      };
};

const ASSESS: Readonly<Record<string, (obs: Observations) => StatementJudgement>> = {
  consultation,
  issues,
  time,
  rapport,
  listening,
  language,
};

const statements: FeedbackStatement[] = FEEDBACK_STATEMENTS.map((s) => ({
  ...s,
  authority: 'regulator' as const,
  source: GMC_SOURCE,
  assess: ASSESS[s.key],
}));

/**
 * UK clinical history taking: the reference pack, and the only one whose feedback statements are a
 * regulator's own words. The content list is still ours; sources says where each item came from and
 * marks the three that rest on a teaching framework alone.
 */
export const UK_CLINICAL_HISTORY: DomainPack = registerPack({
  id: 'uk-clinical-history',
  label: 'UK clinical history taking',
  personNoun: 'patient',
  learnerNoun: 'candidate',
  caveat:
    'The GMC marks each station in three domains and the examiner picks from ten set feedback statements. It publishes no item-by-item mark scheme, so the content list here is ours, with its source shown against each item. Clinical management is not scored in this version; only safety netting is looked at.',
  persona: {
    roleLine: 'You are role-playing a patient in a medical history-taking practice session.',
    factsHeading: 'The only facts about your health that you may share right now',
    inventionBan: 'Never invent symptoms, test results, names, medicines or diagnoses.',
    smallTalkLine:
      'Questions that are not about your health (how you are today, whether it is alright to ask you things, whether you have any questions at the end) are ordinary conversation: answer those as the person described above would.',
  },
  domains: [
    { id: 'data_gathering', label: DOMAIN_LABEL.data_gathering },
    { id: 'management', label: DOMAIN_LABEL.management },
    { id: 'interpersonal', label: DOMAIN_LABEL.interpersonal },
  ],
  gatheringDomainId: 'data_gathering',
  openingItemId: 'open_question',
  closingItemId: 'closing',
  rubric: STANDARD_RUBRIC,
  sources: RUBRIC_SOURCES,
  statements,
});
