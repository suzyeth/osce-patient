/**
 * Importing this module registers every domain pack. Anything that looks a pack up by id should
 * import packFor from here, not from pack.js, so the registry is never read before it is filled.
 */
import './ukClinicalHistory.js';
import './userResearchInterview.js';

export { packFor, packIds, registerPack, type DomainPack, type FeedbackStatement, type Observations, type StatementJudgement } from './pack.js';
export { UK_CLINICAL_HISTORY } from './ukClinicalHistory.js';
export { USER_RESEARCH_INTERVIEW } from './userResearchInterview.js';
