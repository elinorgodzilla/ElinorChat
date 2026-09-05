import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  QueryKeys,
  dataService,
  roleDefaults,
  EModelEndpoint,
  PermissionBits,
  PermissionTypes,
  Permissions,
} from 'librechat-data-provider';
import type { Agent } from 'librechat-data-provider';
import type { TAuthContext } from '~/common';
import { useGetAgentByIdQuery } from '~/data-provider/Agents/queries';
import { AuthContext } from '~/hooks/AuthContext';
import useAgentsMap from '../useAgentsMap';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks/AuthContext', () => {
  const { createContext } = jest.requireActual<typeof import('react')>('react');
  return { AuthContext: createContext<TAuthContext | undefined>(undefined) };
});
jest.mock('~/data-provider', () => jest.requireActual('~/data-provider/Agents/queries'));
jest.mock('~/utils', () => jest.requireActual('~/utils/map'));

const agent: Agent = {
  id: 'agent_old-chat',
  name: 'Saved agent',
  description: null,
  created_at: 0,
  avatar: null,
  provider: EModelEndpoint.openAI,
  model: 'test-model',
  model_parameters: {
    temperature: null,
    maxContextTokens: null,
    max_context_tokens: null,
    max_output_tokens: null,
    top_p: null,
    frequency_penalty: null,
    presence_penalty: null,
  },
};

function setup(canUseAgents: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  client.setQueryData([QueryKeys.endpoints], { [EModelEndpoint.agents]: {} });
  const auth: TAuthContext = {
    user: {
      id: 'user',
      username: 'user',
      email: 'user@example.com',
      name: 'User',
      avatar: '',
      role: 'USER',
      provider: 'local',
      createdAt: '',
      updatedAt: '',
    },
    token: undefined,
    error: undefined,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
    setError: jest.fn(),
    roles: {
      USER: {
        ...roleDefaults.USER,
        permissions: {
          ...roleDefaults.USER.permissions,
          [PermissionTypes.AGENTS]: {
            ...roleDefaults.USER.permissions[PermissionTypes.AGENTS],
            [Permissions.USE]: canUseAgents,
          },
        },
      },
    },
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useAgentsMap catalog permissions', () => {
  it.each([
    [false, true],
    [true, false],
  ])('does not fetch with agents USE=%s and authenticated=%s', (canUseAgents, isAuthenticated) => {
    const listAgents = jest.spyOn(dataService, 'listAgents').mockResolvedValue({
      object: 'list',
      data: [agent],
      has_more: false,
      first_id: agent.id,
      last_id: agent.id,
    });
    const { client, wrapper } = setup(canUseAgents);
    const { result } = renderHook(() => useAgentsMap({ isAuthenticated }), { wrapper });

    expect(result.current).toBeUndefined();
    expect(listAgents).not.toHaveBeenCalled();
    expect(client.isFetching()).toBe(0);
  });

  it('loads and maps the catalog when authenticated and permitted', async () => {
    const listAgents = jest.spyOn(dataService, 'listAgents').mockResolvedValue({
      object: 'list',
      data: [agent],
      has_more: false,
      first_id: agent.id,
      last_id: agent.id,
    });
    const { wrapper } = setup(true);
    const { result } = renderHook(() => useAgentsMap({ isAuthenticated: true }), { wrapper });

    await waitFor(() => expect(result.current?.[agent.id]).toEqual(agent));
    expect(listAgents).toHaveBeenCalledWith({ requiredPermission: PermissionBits.VIEW });
  });

  it('keeps individual old-chat agent resolution without fetching the catalog', async () => {
    const listAgents = jest.spyOn(dataService, 'listAgents');
    const getAgent = jest.spyOn(dataService, 'getAgentById').mockResolvedValue(agent);
    const { wrapper } = setup(false);
    const { result } = renderHook(
      () => ({
        map: useAgentsMap({ isAuthenticated: true }),
        agent: useGetAgentByIdQuery(agent.id).data,
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.agent).toEqual(agent));
    expect(result.current.map).toBeUndefined();
    expect(listAgents).not.toHaveBeenCalled();
    expect(getAgent).toHaveBeenCalledWith({ agent_id: agent.id });
  });

  it('retains an already cached runtime map without restarting the catalog query', () => {
    const listAgents = jest.spyOn(dataService, 'listAgents');
    const { client, wrapper } = setup(false);
    client.setQueryData([QueryKeys.agents, { requiredPermission: PermissionBits.VIEW }], {
      object: 'list',
      data: [agent],
      has_more: false,
      first_id: agent.id,
      last_id: agent.id,
    });
    const { result } = renderHook(() => useAgentsMap({ isAuthenticated: true }), { wrapper });

    expect(result.current?.[agent.id]).toEqual(agent);
    expect(listAgents).not.toHaveBeenCalled();
  });
});
