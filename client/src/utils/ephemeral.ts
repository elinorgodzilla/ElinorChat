import type { TEphemeralAgent } from 'librechat-data-provider';

/** Only search can cross the composer persistence and submission boundaries. */
export function projectSearchState(agent?: TEphemeralAgent | null): TEphemeralAgent | null {
  return typeof agent?.web_search === 'boolean' ? { web_search: agent.web_search } : null;
}
