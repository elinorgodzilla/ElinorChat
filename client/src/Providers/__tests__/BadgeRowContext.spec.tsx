import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { renderHook, act } from '@testing-library/react';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import type { TEphemeralAgent } from 'librechat-data-provider';
import { setTimestamp } from '~/utils/timestamps';
import { ephemeralAgentByConvoId } from '~/store';
import BadgeRowProvider, { useBadgeRowContext } from '../BadgeRowContext';

const mockOpenDialog = jest.fn();
let mockAuthenticated = true;
const mockStartupConfig = { modelSpecs: { list: [{ name: 'search' }] } };
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
  useVerifyAgentToolAuth: () => ({ data: { authenticated: mockAuthenticated } }),
}));
jest.mock('~/hooks', () => ({
  useToolToggle: jest.requireActual('~/hooks/Plugins/useToolToggle').useToolToggle,
  useSearchApiKeyForm: () => ({ setIsDialogOpen: mockOpenDialog }),
}));

function persist(prefix: string, suffix: string, value: string) {
  const key = `${prefix}${suffix}`;
  localStorage.setItem(key, value);
  setTimestamp(key);
}

function setup({
  conversationId = Constants.NEW_CONVO as string,
  initial = null,
  specName,
}: {
  conversationId?: string;
  initial?: TEphemeralAgent | null;
  specName?: string;
} = {}) {
  return renderHook(
    () => ({
      context: useBadgeRowContext(),
      agent: useRecoilValue(ephemeralAgentByConvoId(conversationId)),
    }),
    {
      wrapper: ({ children }) => (
        <RecoilRoot
          initializeState={({ set }) => set(ephemeralAgentByConvoId(conversationId), initial)}
        >
          <BadgeRowProvider conversationId={conversationId} specName={specName}>
            {children}
          </BadgeRowProvider>
        </RecoilRoot>
      ),
    },
  );
}

describe('search-only badge context', () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuthenticated = true;
  });

  it.each([true, false])('restores defaults %s without legacy tool or MCP state', (value) => {
    const suffix = Constants.spec_defaults_key as string;
    persist(LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_, suffix, String(value));
    persist(LocalStorageKeys.LAST_CODE_TOGGLE_, suffix, 'true');
    localStorage.setItem(`${LocalStorageKeys.LAST_MCP_}${suffix}`, '["legacy"]');
    const { result } = setup({ initial: { execute_code: true, artifacts: 'default' } });
    expect(result.current.agent).toEqual({ web_search: value });
    expect(Object.keys(result.current.context ?? {}).sort()).toEqual([
      'searchApiKeyForm',
      'webSearch',
    ]);
  });

  it('keeps explicit in-memory false ahead of persisted true', () => {
    persist(LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_, 'existing', 'true');
    const { result } = setup({
      conversationId: 'existing',
      initial: { web_search: false, mcp: ['legacy'] },
    });
    expect(result.current.agent).toEqual({ web_search: false });
  });

  it('leaves active spec initialization to the spec projection', () => {
    persist(LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_, Constants.NEW_CONVO, 'true');
    const { result } = setup({ specName: 'search', initial: { web_search: false } });
    expect(result.current.agent).toEqual({ web_search: false });
  });

  it('persists both true and false search changes', () => {
    const { result } = setup();
    act(() => result.current.context?.webSearch.handleChange({ value: true }));
    expect(result.current.agent).toEqual({ web_search: true });
    act(() => result.current.context?.webSearch.handleChange({ value: false }));
    expect(result.current.agent).toEqual({ web_search: false });
    expect(
      localStorage.getItem(`${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${Constants.NEW_CONVO}`),
    ).toBe('false');
    expect(
      localStorage.getItem(
        `${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${Constants.spec_defaults_key}`,
      ),
    ).toBe('false');
  });

  it('opens search authentication instead of enabling unauthenticated search', () => {
    mockAuthenticated = false;
    const { result } = setup();
    act(() => result.current.context?.webSearch.handleChange({ value: true }));
    expect(mockOpenDialog).toHaveBeenCalledWith(true);
    expect(result.current.agent).toEqual({ web_search: false });
  });
});
