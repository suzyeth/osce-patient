import type { PatientClient, PatientInput } from '../llm.js';
import type { Chat, ChatMessage, ModelOptions } from './chat.js';

const HISTORY_TURNS = 8;
const PATIENT_TEMPERATURE = 0.7;

// Chat-template markers (<|im_start|> and the like) in candidate text could forge a system turn.
const TEMPLATE_MARKER = /<\||\|>/g;

function asCandidateText(text: string): string {
  return text.replace(TEMPLATE_MARKER, ' ');
}

/**
 * The patient model sees only what buildPatientContext allows (persona and unlocked facts), the
 * recent conversation, and a hint naming the facts that answer this question.
 */
export function buildPatientMessages(input: PatientInput): ChatMessage[] {
  const hint = input.relevantFacts.length
    ? `\n\nFor this answer, the facts that matter are:\n${input.relevantFacts.map((f) => `- ${f}`).join('\n')}`
    : '';
  const history = input.history.slice(-HISTORY_TURNS).flatMap((turn): ChatMessage[] => [
    { role: 'user', content: asCandidateText(turn.student) },
    { role: 'assistant', content: turn.patient },
  ]);
  return [{ role: 'system', content: input.context + hint }, ...history, { role: 'user', content: asCandidateText(input.studentInput) }];
}

export function createNemotronPatient(chat: Chat, options: ModelOptions): PatientClient {
  const { model, maxTokens, thinking } = options;
  return {
    async respond(input: PatientInput): Promise<string> {
      const result = await chat({
        label: 'patient',
        model,
        messages: buildPatientMessages(input),
        maxTokens,
        temperature: PATIENT_TEMPERATURE,
        thinking,
      });
      // An empty reply (for example every token spent on reasoning) is retried by the orchestrator.
      return result.content.trim();
    },
  };
}
