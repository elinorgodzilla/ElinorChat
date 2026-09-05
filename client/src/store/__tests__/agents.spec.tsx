import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { renderHook, act, waitFor } from '@testing-library/react';

import { ephemeralAgentByConvoId, useApplyNewAgentTemplate, useGetEphemeralAgent } from '../agents';

jest.mock('~/utils', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

const useAgentTemplateHarness = (conversationId: string) => {
  const applyTemplate = useApplyNewAgentTemplate();
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(conversationId));
  return { applyTemplate, ephemeralAgent };
};

describe('useApplyNewAgentTemplate', () => {
  it('applies an explicit ephemeral agent when optimistic hydration makes source and target match', async () => {
    const conversationId = 'convo-123';
    const agent = {
      mcp: ['chrome-devtools'],
      skills: true,
      artifacts: 'default',
      web_search: true,
      file_search: true,
      execute_code: true,
    };
    const { result } = renderHook(() => useAgentTemplateHarness(conversationId), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.applyTemplate(conversationId, conversationId, agent);
    });

    await waitFor(() => {
      expect(result.current.ephemeralAgent).toEqual({ web_search: true });
    });
  });

  it.each([true, false])('projects legacy atom state at the getter boundary (%s)', (web_search) => {
    const { result } = renderHook(() => useGetEphemeralAgent(), {
      wrapper: ({ children }) => (
        <RecoilRoot
          initializeState={({ set }) =>
            set(ephemeralAgentByConvoId('legacy'), {
              web_search,
              execute_code: true,
              artifacts: 'default',
              mcp: ['stale'],
            })
          }
        >
          {children}
        </RecoilRoot>
      ),
    });
    expect(result.current('legacy')).toEqual({ web_search });
    expect(result.current('missing')).toBeNull();
  });
});
