import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import { applyModelSpecEphemeralAgent } from '../endpoints';
import { projectSearchState } from '../ephemeral';
import { setTimestamp } from '../timestamps';

const modelSpec: TModelSpec = {
  name: 'search',
  label: 'Search',
  preset: { endpoint: 'openAI' },
  webSearch: true,
  executeCode: true,
  fileSearch: true,
  memory: true,
  artifacts: true,
  mcpServers: ['stale-server'],
};

function persist(prefix: string, id: string, value: string) {
  const key = `${prefix}${id}`;
  localStorage.setItem(key, value);
  setTimestamp(key);
}

describe('search state projection', () => {
  beforeEach(() => localStorage.clear());

  it.each([true, false])('retains boolean %s and drops all other fields', (web_search) => {
    expect(
      projectSearchState({
        web_search,
        execute_code: true,
        file_search: true,
        memory: true,
        skills: true,
        artifacts: 'default',
        mcp: ['stale'],
      }),
    ).toEqual({ web_search });
  });

  it.each([undefined, null, {}, { execute_code: true }])(
    'discards absent or invalid search state: %j',
    (value) => expect(projectSearchState(value)).toBeNull(),
  );

  it('rejects a persisted non-boolean search value', () => {
    expect(projectSearchState(JSON.parse('{"web_search":"false"}'))).toBeNull();
  });

  it.each([true, false])('applies only search from a new spec (%s)', (webSearch) => {
    const updateEphemeralAgent = jest.fn();
    persist(LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_, Constants.NEW_CONVO, String(!webSearch));
    applyModelSpecEphemeralAgent({
      modelSpec: { ...modelSpec, webSearch },
      updateEphemeralAgent,
    });
    expect(updateEphemeralAgent).toHaveBeenCalledWith(Constants.NEW_CONVO, {
      web_search: webSearch,
    });
  });

  it('defaults omitted search to false', () => {
    const updateEphemeralAgent = jest.fn();
    applyModelSpecEphemeralAgent({
      modelSpec: { ...modelSpec, webSearch: undefined },
      updateEphemeralAgent,
    });
    expect(updateEphemeralAgent).toHaveBeenCalledWith(Constants.NEW_CONVO, { web_search: false });
  });

  it.each([true, false])('restores existing search override %s without legacy tools', (value) => {
    const convoId = 'existing';
    const updateEphemeralAgent = jest.fn();
    persist(LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_, convoId, String(value));
    persist(LocalStorageKeys.LAST_CODE_TOGGLE_, convoId, 'true');
    persist(LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_, convoId, 'true');
    persist(LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_, convoId, '"default"');
    persist(LocalStorageKeys.LAST_MEMORY_TOGGLE_, convoId, 'true');
    persist(LocalStorageKeys.LAST_SKILLS_TOGGLE_, convoId, 'true');
    localStorage.setItem(`${LocalStorageKeys.LAST_MCP_}${convoId}`, '["stale"]');
    applyModelSpecEphemeralAgent({
      convoId,
      modelSpec: { ...modelSpec, webSearch: !value },
      updateEphemeralAgent,
    });
    expect(updateEphemeralAgent).toHaveBeenCalledWith(convoId, { web_search: value });
  });

  it.each(['broken json', '"false"', 'null', '{}', '[]', '1'])(
    'ignores invalid persisted search %s',
    (value) => {
      const updateEphemeralAgent = jest.fn();
      persist(LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_, 'existing', value);
      applyModelSpecEphemeralAgent({ convoId: 'existing', modelSpec, updateEphemeralAgent });
      expect(updateEphemeralAgent).toHaveBeenCalledWith('existing', { web_search: true });
    },
  );

  it('uses spec defaults when storage has been cleared', () => {
    const updateEphemeralAgent = jest.fn();
    applyModelSpecEphemeralAgent({ convoId: 'existing', modelSpec, updateEphemeralAgent });
    expect(updateEphemeralAgent).toHaveBeenCalledWith('existing', { web_search: true });
  });

  it('ignores absent specs and callbacks', () => {
    const updateEphemeralAgent = jest.fn();
    applyModelSpecEphemeralAgent({ updateEphemeralAgent });
    expect(updateEphemeralAgent).not.toHaveBeenCalled();
    expect(() =>
      applyModelSpecEphemeralAgent({ modelSpec, updateEphemeralAgent: undefined }),
    ).not.toThrow();
  });
});
