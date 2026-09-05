import React from 'react';
import { SystemRoles } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import {
  renderMemoryFeature,
  cleanupMemoryFeature,
  deniedPermissions,
} from 'test/memory-test-utils';
import { screen } from 'test/layout-test-utils';
import useSideNavLinks from '../useSideNavLinks';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  // The built data-service namespace is read-only; copy it so API methods can be spied on.
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('react-vtree', () => ({ FixedSizeTree: () => null }), { virtual: true });

function SideNavLinks() {
  const links = useSideNavLinks({ keyProvided: false, interfaceConfig: {}, endpointsConfig: {} });
  return (
    <nav>
      {links.map(({ id, title }) => (
        <span key={id} data-testid={id}>
          {title}
        </span>
      ))}
    </nav>
  );
}

describe('useSideNavLinks memory permissions', () => {
  let queryClient: QueryClient;
  afterEach(() => cleanupMemoryFeature(queryClient));

  it('keeps the memory editor reachable for ADMIN with every memory permission false', async () => {
    ({ queryClient } = await renderMemoryFeature(<SideNavLinks />));
    expect(await screen.findByTestId('memories')).toBeInTheDocument();
  });

  it.each([
    { USE: false, READ: false },
    { USE: true, READ: false },
    { USE: false, READ: true },
  ])('hides memories from USER with USE=$USE and READ=$READ', async (permissions) => {
    ({ queryClient } = await renderMemoryFeature(<SideNavLinks />, {
      role: SystemRoles.USER,
      permissions: { ...deniedPermissions, ...permissions },
    }));
    expect(await screen.findByRole('navigation')).toBeInTheDocument();
    expect(screen.queryByTestId('memories')).not.toBeInTheDocument();
  });

  it('shows memories to USER with USE and READ', async () => {
    ({ queryClient } = await renderMemoryFeature(<SideNavLinks />, {
      role: SystemRoles.USER,
      permissions: { ...deniedPermissions, USE: true, READ: true },
    }));
    expect(await screen.findByTestId('memories')).toBeInTheDocument();
  });
});
