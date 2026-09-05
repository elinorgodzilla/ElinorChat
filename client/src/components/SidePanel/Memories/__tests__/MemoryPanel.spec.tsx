import React from 'react';
import userEvent from '@testing-library/user-event';
import { QueryKeys, SystemRoles, PermissionTypes, dataService } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import {
  renderMemoryFeature,
  cleanupMemoryFeature,
  deniedPermissions,
  memoryResponse,
} from 'test/memory-test-utils';
import { screen, waitFor, within, act } from 'test/layout-test-utils';
import MemoryPanel from '../MemoryPanel';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  // The built data-service namespace is read-only; copy it so API methods can be spied on.
  return { ...actual, dataService: { ...actual.dataService } };
});

const deniedMessage = "You don't have permission to view memories";

describe('MemoryPanel permission recovery', () => {
  let queryClient: QueryClient;
  afterEach(() => cleanupMemoryFeature(queryClient));

  it.each([false, true])(
    'keeps ADMIN settings accessible without reading or revealing memories (cached=%s)',
    async (cached) => {
      const result = await renderMemoryFeature(<MemoryPanel />, { cached });
      queryClient = result.queryClient;

      expect(await screen.findByText(deniedMessage)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Admin Settings' })).toBeInTheDocument();
      expect(result.getMemories).not.toHaveBeenCalled();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Memories' })).not.toBeInTheDocument();
      expect(screen.queryByText('private-memory-key')).not.toBeInTheDocument();
      expect(screen.queryByText('Private memory contents')).not.toBeInTheDocument();
      expect(screen.queryByText('Private agent name')).not.toBeInTheDocument();
      expect(queryClient.getQueryData([QueryKeys.memories])).toEqual(
        cached ? memoryResponse : undefined,
      );
      expect(queryClient.getQueryState([QueryKeys.memories])).toMatchObject({
        status: cached ? 'success' : 'loading',
        fetchStatus: 'idle',
      });
    },
  );

  it.each([
    { USE: false, READ: false },
    { USE: true, READ: false },
    { USE: false, READ: true },
  ])(
    'denies USER with USE=$USE and READ=$READ without settings or memory reads',
    async (permissions) => {
      const result = await renderMemoryFeature(<MemoryPanel />, {
        role: SystemRoles.USER,
        cached: true,
        permissions: { ...deniedPermissions, ...permissions },
      });
      queryClient = result.queryClient;

      expect(await screen.findByText(deniedMessage)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Admin Settings' })).not.toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByText('Private memory contents')).not.toBeInTheDocument();
      expect(result.getMemories).not.toHaveBeenCalled();
    },
  );

  it('loads memories after USER permissions update, then hides cached data on revocation', async () => {
    const result = await renderMemoryFeature(<MemoryPanel />, { role: SystemRoles.USER });
    queryClient = result.queryClient;
    expect(await screen.findByText(deniedMessage)).toBeInTheDocument();
    expect(result.getMemories).not.toHaveBeenCalled();

    const userRole = result.roles[SystemRoles.USER];
    act(() => {
      queryClient.setQueryData([QueryKeys.roles, SystemRoles.USER], {
        ...userRole,
        permissions: {
          ...userRole.permissions,
          [PermissionTypes.MEMORIES]: { ...deniedPermissions, USE: true, READ: true },
        },
      });
    });

    expect(await screen.findByText('Private memory contents')).toBeInTheDocument();
    expect(result.getMemories).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Admin Settings' })).not.toBeInTheDocument();

    act(() => {
      queryClient.setQueryData([QueryKeys.roles, SystemRoles.USER], userRole);
    });
    expect(await screen.findByText(deniedMessage)).toBeInTheDocument();
    expect(screen.queryByText('Private memory contents')).not.toBeInTheDocument();
    expect(queryClient.getQueryData([QueryKeys.memories])).toEqual(memoryResponse);
    expect(result.getMemories).toHaveBeenCalledTimes(1);
  });

  it('saves only the selected ADMIN role through the existing editor and loads memories after role invalidation', async () => {
    const user = userEvent.setup();
    const result = await renderMemoryFeature(<MemoryPanel />);
    queryClient = result.queryClient;
    const originalUserRole = result.roles[SystemRoles.USER];
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const update = jest
      .spyOn(dataService, 'updateMemoryPermissions')
      .mockImplementation(async ({ roleName, updates }) => {
        const role = result.roles[roleName];
        result.roles[roleName] = {
          ...role,
          permissions: {
            ...role.permissions,
            [PermissionTypes.MEMORIES]: {
              ...role.permissions[PermissionTypes.MEMORIES],
              ...updates,
            },
          },
        };
        return result.roles[roleName];
      });

    await user.click(await screen.findByRole('button', { name: 'Admin Settings' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'USER' }));
    await user.click(await screen.findByRole('menuitem', { name: 'ADMIN' }));
    const useSwitch = within(dialog).getByRole('switch', { name: 'Allow using Memories' });
    const readSwitch = within(dialog).getByRole('switch', { name: 'Allow reading Memories' });
    expect(useSwitch).not.toBeChecked();
    expect(readSwitch).not.toBeChecked();
    await user.click(useSwitch);
    await user.click(readSwitch);
    expect(result.getMemories).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      roleName: SystemRoles.ADMIN,
      updates: { ...deniedPermissions, USE: true, READ: true },
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.roles, SystemRoles.ADMIN]);
    expect(await screen.findByText('Private memory contents')).toBeInTheDocument();
    expect(result.getMemories).toHaveBeenCalledTimes(1);
    expect(result.getRole.mock.calls.filter(([role]) => role === SystemRoles.ADMIN)).toHaveLength(
      2,
    );
    expect(result.getRole.mock.calls.filter(([role]) => role === SystemRoles.USER)).toHaveLength(1);
    expect(queryClient.getQueryData([QueryKeys.roles, SystemRoles.USER])).toEqual(originalUserRole);
    expect(screen.queryByText(deniedMessage)).not.toBeInTheDocument();
  });
});
