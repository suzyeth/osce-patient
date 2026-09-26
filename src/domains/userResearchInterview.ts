import { registerPack, type DomainPack, type FeedbackStatement, type Observations, type StatementJudgement } from './pack.js';
import type { RubricItem } from '../types.js';

/**
 * A discovery / user research interview: the second pack, and the proof that the engine is not a
 * medical tool with a general name. Nothing in the engine changed to add it. What changed is this
 * file: the domains, the content list, the order check and how each feedback statement is judged.
 *
 * It is deliberately a field with no regulator. That makes two things honest and visible:
 *  - Every statement here is marked authority 'ours', not 'regulator'. The report says so. In
 *    clinical history taking the ten statements are the GMC's own words; here there is no
 *    equivalent body publishing a feedback list, and pretending otherwise would be the exact
 *    dishonesty this tool exists to avoid.
 *  - What a typed session cannot see is different from the clinical pack, not a copy of it. The
 *    thing this pack most wants to teach - sitting in silence until the person keeps talking - is
 *    precisely what typing cannot rehearse, and the report says that rather than scoring it.
 *
 * Sources for the content list and the statements are named per item. They are attributions to
 * published work, not verbatim quotations, except where the text says otherwise.
 */
const SOURCES: Readonly<Record<string, string>> = {
  intro_purpose:
    'UK Government Digital Service, Service Manual, user research: explain the purpose of the session before starting',
  consent_recording:
    'UK GDPR consent expectations and standard research ethics practice: participation is voluntary, the person may stop at any time, and recording is agreed before it starts',
  warm_up: 'Steve Portigal, Interviewing Users (Rosenfeld Media): open broadly before narrowing',
  open_question: 'Rob Fitzpatrick, The Mom Test (2013): talk about their life, not your idea',
  recent_specific:
    'Rob Fitzpatrick, The Mom Test (2013): ask about specific things that already happened rather than generalities',
  walk_through: 'Steve Portigal, Interviewing Users: ask the person to walk through what they actually did, step by step',
  current_workaround: 'Rob Fitzpatrick, The Mom Test (2013): find what they already do about the problem today',
  cost_of_problem:
    'Rob Fitzpatrick, The Mom Test (2013): a problem someone has spent time or money on is a problem that is real',
  who_else_involved: 'Steve Portigal, Interviewing Users: establish who else is involved in the work being described',
  last_time_failed:
    'Rubin & Rubin, Qualitative Interviewing: ask for the concrete occasion, including when things went wrong',
  emotion_probe: 'Steve Portigal, Interviewing Users: follow the feeling, not only the facts',
  unprompted_priority: 'Rob Fitzpatrick, The Mom Test (2013): let them tell you what matters instead of ranking your list for you',
  closing_anything_else: 'Steve Portigal, Interviewing Users: ask what you did not think to ask before ending',
  next_steps: 'UK Government Digital Service, Service Manual, user research: tell the participant what happens with what they said',
};

const item = (
  id: string,
  domain: string,
  label: string,
  exampleQuestion: string,
  offlineCues: string[],
  critical = false,
): RubricItem => ({ id, domain, label, critical, exampleQuestion, offlineCues });

const RUBRIC: readonly RubricItem[] = [
  item('intro_purpose', 'rapport', 'Explains who you are and what the session is for', "Thanks for your time. I'm trying to understand how you do this today, not to show you anything.", ['what this is for', 'trying to understand', 'my name is', "i'm working on"]),
  item('consent_recording', 'rapport', 'Says it is voluntary, and agrees recording before starting', 'Is it alright if I take notes? You can stop at any point, or skip anything.', ['is it alright if', 'take notes', 'recording', 'you can stop', 'skip anything']),
  item('warm_up', 'rapport', 'Starts wide before narrowing down', 'Tell me about your work in general first.', ['tell me about your', 'in general', 'day to day', 'your role']),
  item('open_question', 'gathering', 'Opens on their world, not on your idea', 'How do you handle this at the moment?', ['how do you', 'what do you currently', 'walk me through', 'tell me about']),
  item('recent_specific', 'gathering', 'Asks about a specific recent occasion', 'When did this last happen? Tell me about that time.', ['last time', 'most recent', 'when did that happen', 'that time']),
  item('walk_through', 'gathering', 'Has them walk through what they actually did', 'What did you do first, and then what?', ['what did you do', 'step by step', 'and then what', 'walk me through']),
  item('current_workaround', 'gathering', 'Finds what they already do about it', 'What do you do about it today?', ['what do you do about', 'how do you get around', 'workaround', 'instead']),
  item('cost_of_problem', 'gathering', 'Finds what the problem has already cost them', 'Have you tried anything to fix it, or spent anything on it?', ['have you tried', 'spent', 'how long does that take', 'cost you'], true),
  item('who_else_involved', 'gathering', 'Establishes who else is involved', 'Who else is part of this?', ['who else', 'anyone else', 'your team', 'who decides']),
  item('last_time_failed', 'gathering', 'Asks about an occasion when it went wrong', 'When did it last go wrong?', ['went wrong', 'gone wrong', 'a problem', "didn't work"]),
  item('emotion_probe', 'rapport', 'Follows something they clearly felt strongly about', 'You sounded frustrated by that. What was that like?', ['sounded', 'how did that feel', 'what was that like', 'frustrating']),
  item('unprompted_priority', 'analysis', 'Lets them say what matters most, unprompted', 'Of everything you have told me, what gets in your way most?', ['what matters most', 'biggest', 'gets in your way', 'most important to you']),
  item('closing_anything_else', 'analysis', 'Asks what you did not think to ask', 'Is there anything I should have asked and did not?', ['anything else', 'should have asked', 'anything i missed', 'anything you expected']),
  item('next_steps', 'analysis', 'Says what happens next with what they told you', 'I will write this up and share it with the team; nothing goes out with your name on it.', ['what happens next', 'write this up', 'share it with', 'get back to you']),
];

/** No published feedback list exists for research interviews, so every statement here is ours. */
const statement = (
  key: string,
  label: string,
  text: string,
  source: string,
  assess: (obs: Observations) => StatementJudgement,
): FeedbackStatement => ({ key, label, text, authority: 'ours', source, assessable: true, notAssessableBecause: '', assess });

const unassessable = (key: string, label: string, text: string, source: string, because: string): FeedbackStatement => ({
  key,
  label,
  text,
  authority: 'ours',
  source,
  assessable: false,
  notAssessableBecause: because,
});

const STATEMENTS: readonly FeedbackStatement[] = [
  statement(
    'structure',
    'Structure',
    'Jumped between topics, or narrowed down before understanding the person’s situation.',
    'Steve Portigal, Interviewing Users: open broadly, then go deeper',
    (obs) => ({ outcome: obs.order.ordered ? 'no_concern' : 'concern', evidence: obs.order.detail, quotes: [] }),
  ),
  statement(
    'evidence',
    'Evidence',
    'Left the interview without one concrete thing the person has already done, spent or lost because of the problem.',
    'Rob Fitzpatrick, The Mom Test (2013): commitment and past behaviour, not compliments',
    (obs) => {
      if (obs.missedCritical.length === 0) {
        return {
          outcome: 'no_concern',
          evidence: 'You found out what this problem has already cost them, which is the difference between a real problem and a polite one.',
          quotes: [],
        };
      }
      const missed = obs.missedCritical.map((i) => i.label.toLowerCase()).join('; ');
      return {
        outcome: 'concern',
        evidence: `You did not establish ${missed}. Without it you have an opinion, not evidence: people are willing to agree that a problem is annoying without ever having done anything about it.`,
        quotes: [],
      };
    },
  ),
  statement(
    'specifics',
    'Specifics',
    'Accepted a generality, or asked what the person would do rather than what they did do.',
    'Rob Fitzpatrick, The Mom Test (2013): specifics in the past, not generics or opinions about the future',
    (obs) => {
      const wanted = ['recent_specific', 'walk_through', 'last_time_failed'];
      const missed = wanted.map((id) => obs.itemById(id)).filter((i) => i && !i.covered);
      if (missed.length === 0) {
        return {
          outcome: 'no_concern',
          evidence: 'You pinned the conversation to particular occasions rather than to what usually happens.',
          quotes: [],
        };
      }
      return {
        outcome: 'concern',
        evidence: `You did not get to ${missed.map((i) => i?.label.toLowerCase()).join('; ')}. What someone says they usually do is a summary they have made up; what they did last Tuesday is data.`,
        quotes: [],
      };
    },
  ),
  statement(
    'talking',
    'Talking',
    'Talked too much, or filled the interview rather than letting the person fill it.',
    'Rob Fitzpatrick, The Mom Test (2013): listen more than you talk',
    (obs) =>
      obs.turnsUsed > obs.roomForTurns
        ? {
            outcome: 'concern',
            evidence: `You asked ${obs.turnsUsed} questions in a session with room for about ${obs.roomForTurns}. A high question count usually means short answers: you were driving instead of following. Note that typing here is not timed, so this counts questions, not minutes.`,
            quotes: [],
          }
        : {
            outcome: 'no_concern',
            evidence: `You asked ${obs.turnsUsed} questions, within the ${obs.roomForTurns} or so this session had room for. Typing here is not timed, so this counts questions, not minutes.`,
            quotes: [],
          },
  ),
  statement(
    'interrupting',
    'Interrupting',
    'Moved on before the person had finished, or asked the next question instead of following the last answer.',
    'Steve Portigal, Interviewing Users: follow what they said, and let silence do the work',
    (obs) =>
      obs.interruptedTurns.length > 0
        ? {
            outcome: 'concern',
            evidence: `You moved on before they had finished at ${obs.list(obs.interruptedTurns)}. In an interview this is expensive: the sentence you cut off is usually the one you came for.`,
            quotes: obs.quotesFrom(obs.interruptedTurns),
          }
        : {
            outcome: 'no_concern',
            evidence: 'You let them finish and followed what they said.',
            quotes: [],
          },
  ),
  statement(
    'feelings',
    'Feelings',
    'Walked past something the person clearly felt strongly about.',
    'Steve Portigal, Interviewing Users: follow the feeling, not only the facts',
    (obs) => {
      if (obs.concernElicited === false) {
        return {
          outcome: 'concern',
          evidence:
            'You did not find out what actually bothers them about this. It was in the case, and it only comes out if someone asks.',
          quotes: [],
        };
      }
      return obs.empathyTurns.length > 0
        ? {
            outcome: 'no_concern',
            evidence: `You picked up on how they felt at ${obs.list(obs.empathyTurns)}, which is usually where the real reason is.`,
            quotes: obs.quotesFrom(obs.empathyTurns),
          }
        : {
            outcome: 'concern',
            evidence:
              'Nothing you wrote acknowledged how they felt about any of this. People rarely volunteer the reason behind a complaint unless the complaint is taken seriously first.',
            quotes: [],
          };
    },
  ),
  statement(
    'jargon',
    'Jargon',
    'Used your own or your product’s vocabulary instead of theirs.',
    'Steve Portigal, Interviewing Users: use the participant’s own words',
    (obs) =>
      obs.jargonTurns.length > 0
        ? {
            outcome: 'concern',
            evidence: `You used words that are yours rather than theirs at ${obs.list(obs.jargonTurns)}. Once you supply the vocabulary you can no longer tell whether they had the concept.`,
            quotes: obs.quotesFrom(obs.jargonTurns),
          }
        : { outcome: 'no_concern', evidence: 'You stayed in their vocabulary.', quotes: [] },
  ),
  statement(
    'closing',
    'Closing',
    'Ended without asking what you failed to ask, or without saying what happens next.',
    'UK Government Digital Service, Service Manual, user research, and Portigal on closing an interview',
    (obs) => {
      const missed = ['closing_anything_else', 'next_steps'].map((id) => obs.itemById(id)).filter((i) => i && !i.covered);
      return missed.length === 0
        ? { outcome: 'no_concern', evidence: 'You left room for what you had not thought of, and told them what happens with what they said.', quotes: [] }
        : {
            outcome: 'concern',
            evidence: `You ended without ${missed.map((i) => i?.label.toLowerCase()).join('; ')}.`,
            quotes: [],
          };
    },
  ),
  statement(
    'consent',
    'Consent',
    'Started asking before explaining the purpose, or without agreeing that it was alright to go ahead.',
    'UK Government Digital Service, Service Manual, user research, and standard research ethics practice',
    (obs) => {
      const missed = ['intro_purpose', 'consent_recording'].map((id) => obs.itemById(id)).filter((i) => i && !i.covered);
      return missed.length === 0
        ? { outcome: 'no_concern', evidence: 'You said what the session was for and checked it was alright before asking about their work.', quotes: [] }
        : {
            outcome: 'concern',
            evidence: `You did not ${missed.map((i) => i?.label.toLowerCase()).join('; ')}. This is the one item on the list that is not a technique: it is the condition for the rest.`,
            quotes: [],
          };
    },
  ),
  // The two things this pack most wants to teach, and typing cannot rehearse either of them.
  unassessable(
    'silence',
    'Silence',
    'Filled every pause instead of waiting, so the person never went past their first answer.',
    'Steve Portigal, Interviewing Users: silence is a technique',
    'Typing has no pauses to sit in. This is the single most useful interviewing habit and a typed session cannot practise it at all.',
  ),
  unassessable(
    'pitching',
    'Pitching',
    'Started selling or explaining your own idea, so the person began reacting to you instead of describing their life.',
    'Rob Fitzpatrick, The Mom Test (2013): a pitch turns an interview into a compliment',
    'Judging this needs to know what you are building, which this session is not told.',
  ),
];

/**
 * The pack. Note that nothing above is clinical, and nothing in the engine had to change to accept
 * it: the same gating, the same guard, the same quote-anchored report.
 */
export const USER_RESEARCH_INTERVIEW: DomainPack = registerPack({
  id: 'user-research-interview',
  label: 'Discovery and user research interviews',
  personNoun: 'interviewee',
  learnerNoun: 'interviewer',
  caveat:
    'No body assesses research interviews, so unlike the clinical pack every feedback statement here is ours, written from published interviewing guidance and attributed per statement. It is a practice aid, not an assessment, and it cannot see the two habits that matter most: using silence, and not pitching.',
  domains: [
    { id: 'gathering', label: 'Finding out what they actually do' },
    { id: 'rapport', label: 'Making it safe to be honest' },
    { id: 'analysis', label: 'Closing and making sense of it' },
  ],
  gatheringDomainId: 'gathering',
  openingItemId: 'open_question',
  closingItemId: 'closing_anything_else',
  rubric: RUBRIC,
  sources: SOURCES,
  statements: STATEMENTS,
});
