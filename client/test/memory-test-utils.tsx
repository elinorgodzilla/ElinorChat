import React from 'react';
import { RecoilRoot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@librechat/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  QueryKeys,
  SystemRoles,
  PermissionTypes,
  roleDefaults,
  dataService,
  setTokenHeader,
} from 'librechat-data-provider';
import type { TUser, TRole, TMemoryPermissions, MemoriesResponse } from 'librechat-data-provider';
import { startupConfigKey } from '~/data-provider/Endpoints/queries';
import { AuthContextProvider, useAuthContext } from '~/hooks/AuthContext';
import { render, act, waitFor, cleanup } from 'test/layout-test-utils';
import store from '~/store';

export const deniedPermissions: TMemoryPermissions = {
  USE: false,
  CREATE: false,
  UPDATE: false,
  READ: false,
  OPT_OUT: false,
};

export const memoryResponse: MemoriesResponse = {
  memories: [
    {
      key: 'private-memory-key',
      value: 'Private memory contents',
      agentId: 'private-agent-id',
      agentName: 'Private agent name',
      updated_at: '2026-09-01T00:00:00.000Z',
    },
  ],
  totalTokens: 12,
  tokenLimit: 100,
  usagePercentage: 12,
};

function Authenticated({ children }: { children: React.ReactNode }) {
  const { user, roles, isAuthenticated } = useAuthContext();
  return isAuthenticated && user && roles?.[user.role] ? <>{children}</> : null;
}

export async function renderMemoryFeature(
  ui: React.ReactElement,
  {
    role = SystemRoles.ADMIN,
    permissions = deniedPermissions,
    cached = false,
  }: { role?: SystemRoles; permissions?: TMemoryPermissions; cached?: boolean } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user: TUser = {
    id: 'memory-test-user',
    username: 'memory-test',
    name: 'Memory Test',
    email: 'memory-test@example.com',
    avatar: '',
    role,
    provider: 'openid',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
  const roles: Record<string, TRole> = Object.fromEntries(
    Object.values(SystemRoles).map((name) => [
      name,
      {
        ...roleDefaults[name],
        permissions: {
          ...roleDefaults[name].permissions,
          [PermissionTypes.MEMORIES]: { ...(name === role ? permissions : deniedPermissions) },
          [PermissionTypes.MCP_SERVERS]: {
            ...roleDefaults[name].permissions[PermissionTypes.MCP_SERVERS],
            USE: false,
            CREATE: false,
          },
        },
      },
    ]),
  );
  const getRole = jest
    .spyOn(dataService, 'getRole')
    .mockImplementation(async (name) => roles[name]);
  jest.spyOn(dataService, 'getUser').mockResolvedValue(user);
  jest.spyOn(dataService, 'listRoles').mockResolvedValue({
    roles: Object.values(SystemRoles).map((name) => ({ name })),
    total: 2,
    limit: 10,
  });
  const getMemories = jest.spyOn(dataService, 'getMemories').mockResolvedValue(memoryResponse);
  queryClient.setQueryData(startupConfigKey(true), {});
  if (cached) {
    queryClient.setQueryData([QueryKeys.memories], memoryResponse);
  }

  render(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <RecoilRoot initializeState={({ set }) => set(store.user, user)}>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthContextProvider authConfig={{ test: true, loginRedirect: '' }}>
              <ToastProvider>
                <Authenticated>{children}</Authenticated>
              </ToastProvider>
            </AuthContextProvider>
          </MemoryRouter>
        </RecoilRoot>
      </QueryClientProvider>
    ),
  });
  act(() => {
    window.dispatchEvent(new CustomEvent('tokenUpdated', { detail: 'test-token' }));
  });
  await waitFor(() => expect(getRole).toHaveBeenCalledWith(role));

  return { queryClient, roles, getRole, getMemories };
}

export function cleanupMemoryFeature(queryClient?: QueryClient) {
  cleanup();
  queryClient?.clear();
  setTokenHeader(undefined);
}
