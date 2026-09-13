import { describe, it, expect } from 'vitest';
import { looksLikeSelfDisclosure, SAFETY_MESSAGE } from '../src/safety.js';

describe('looksLikeSelfDisclosure', () => {
  it.each([
    'I have been having chest pains myself, what do I have?',
    'Should I see a doctor about my symptoms?',
    "I've been feeling dizzy lately",
    'I’ve been feeling dizzy lately',
    'Ive been having chest pain',
    'Am I dying?',
    'I keep getting headaches, is that bad?',
    'What do you think I have?',
    'I feel really sick today',
    "I've got a lump in my neck, should I worry?",
    "I'm having palpitations right now",
    "I've been coughing up blood myself",
  ])('flags: %s', (s) => {
    expect(looksLikeSelfDisclosure(s)).toBe(true);
  });

  // Ordinary candidate phrasing must never trigger the block.
  it.each([
    'Have you been having any chest pain?',
    "I'm sorry to hear that.",
    'What brings you in today?',
    'Do you smoke?',
    'Is it okay if I ask you some questions?',
    'I have been having a look through your notes.',
    "I've been getting some information from the nurse.",
    "I've been feeling that we should check your chest.",
    'Should I call the doctor on duty to see you?',
    'Let me summarise my understanding of your symptoms.',
    'What do I have here, let me check your records.',
    'Am I right in thinking the cough started after a cold?',
    'I feel we should do a chest X-ray to be safe.',
    'I have a few more questions about the cough.',
    'I understand you have been coughing up blood.',
    "I've been having a think about your cough.",
    "I've got some questions about your chest pain.",
    'I feel your cough needs a chest X-ray.',
  ])('allows: %s', (s) => {
    expect(looksLikeSelfDisclosure(s)).toBe(false);
  });

  it('points to NHS 111 in the safety message', () => {
    expect(SAFETY_MESSAGE).toContain('NHS 111');
  });
});
