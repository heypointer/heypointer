import type { FlowSuggestion, Walkthrough, WalkthroughStep } from './types';

const ACTIONS = ['click', 'type', 'select', 'navigate', 'observe'];
/** Same limits as the contract: at most 5 suggestions, titles up to 200 characters. */
export const MAX_SUGGESTIONS = 5;
export const MAX_SUGGESTION_TITLE = 200;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';

function parseStep(raw: unknown, i: number): WalkthroughStep {
  if (!isObj(raw)) throw new Error(`step ${i} is not an object`);
  const { id, title, instruction, target, action, requiresConfirmation, evidence } = raw;
  if (!isStr(id) || !isStr(title) || !isStr(instruction)) throw new Error(`step ${i} missing id/title/instruction`);
  if (!isStr(action) || !ACTIONS.includes(action)) throw new Error(`step ${i} has invalid action`);
  if (!isObj(target) || !Array.isArray(target.selectors) || !target.selectors.every(isStr)) {
    throw new Error(`step ${i} has invalid target`);
  }
  if (typeof requiresConfirmation !== 'boolean') throw new Error(`step ${i} missing requiresConfirmation`);
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error(`step ${i} has no evidence`);
  return raw as unknown as WalkthroughStep;
}

/**
 * "Did you mean" guides. Titles are untrusted text: keep only well-formed entries, trim them, drop
 * over-long titles and duplicates, and cap the list. A bad suggestion never breaks the reply it rides on.
 */
function parseSuggestions(raw: unknown): FlowSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FlowSuggestion[] = [];
  for (const item of raw) {
    if (!isObj(item) || !isStr(item.workflowId) || !isStr(item.title)) continue;
    const title = item.title.trim();
    if (!item.workflowId || !title || title.length > MAX_SUGGESTION_TITLE || seen.has(title)) continue;
    seen.add(title);
    out.push({ workflowId: item.workflowId, title });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

/** Defensive client-side check: a step without evidence is never rendered. */
export function parseWalkthrough(raw: unknown): Walkthrough {
  if (!isObj(raw)) throw new Error('walkthrough is not an object');
  if (raw.status !== 'ok' && raw.status !== 'insufficient_evidence') throw new Error('invalid walkthrough status');
  if (!isStr(raw.id) || !isStr(raw.goal) || !Array.isArray(raw.steps)) throw new Error('walkthrough missing id/goal/steps');
  const steps = raw.steps.map(parseStep);
  if (raw.status === 'ok' && steps.length === 0) throw new Error('ok walkthrough has no steps');
  if (raw.status === 'insufficient_evidence' && steps.length > 0) throw new Error('insufficient_evidence walkthrough must have no steps');
  const wt = { ...(raw as unknown as Walkthrough), steps };
  // Suggestions only make sense when the server could not cover the goal.
  const suggestions = raw.status === 'insufficient_evidence' ? parseSuggestions(raw.suggestions) : [];
  if (suggestions.length) wt.suggestions = suggestions;
  else delete wt.suggestions;
  return wt;
}
