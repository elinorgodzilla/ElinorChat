import React from 'react';
import { RecoilRoot } from 'recoil';
import { renderHook } from '@testing-library/react';
import { LocalStorageKeys } from 'librechat-data-provider';
import type { TStartupConfig, TUser } from 'librechat-data-provider';
import { cleanupTimestampedStorage } from '~/utils/timestamps';
import useSpeechSettingsInit from '../useSpeechSettingsInit';

type CloudFrontRetryOptions = { getAuthorizationHeader: () => string | undefined };

const mockUseMCPServersQuery = jest.fn();
const mockUseMCPToolsQuery = jest.fn();
const mockDisposeImageRetry = jest.fn();
const mockInstallCloudFrontImageRetry = jest.fn(
  (_startupConfig: TStartupConfig | undefined, _options: CloudFrontRetryOptions) =>
    mockDisposeImageRetry,
);
const mockGetTokenHeader = jest.fn();

jest.mock('@librechat/client', () => ({
  installCloudFrontImageRetry: (
    startupConfig: TStartupConfig | undefined,
    options: CloudFrontRetryOptions,
  ) => mockInstallCloudFrontImageRetry(startupConfig, options),
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    getTokenHeader: () => mockGetTokenHeader(),
  };
});

jest.mock('~/data-provider', () => ({
  useMCPServersQuery: (...args: object[]) => mockUseMCPServersQuery(...args),
  useMCPToolsQuery: (...args: object[]) => mockUseMCPToolsQuery(...args),
}));

jest.mock('../useSpeechSettingsInit', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/utils/timestamps', () => ({
  cleanupTimestampedStorage: jest.fn(),
}));

jest.mock('react-gtm-module', () => ({
  __esModule: true,
  default: { initialize: jest.fn() },
}));

import useAppStartup from '../useAppStartup';

const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar: '',
  role: 'USER',
  provider: 'local',
  emailVerified: true,
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2023-01-01T00:00:00.000Z',
} as TUser;

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe('useAppStartup', () => {
  it.each([mockUser, undefined])('does not prefetch MCP for user %p', (user) => {
    renderHook(() => useAppStartup({ user }), { wrapper });

    expect(mockUseMCPServersQuery).not.toHaveBeenCalled();
    expect(mockUseMCPToolsQuery).not.toHaveBeenCalled();
    expect(useSpeechSettingsInit).toHaveBeenCalledWith(!!user);
  });

  it('preserves title initialization and storage cleanup', () => {
    const startupConfig = { appTitle: 'Chat' } as TStartupConfig;
    renderHook(() => useAppStartup({ startupConfig, user: mockUser }), { wrapper });

    expect(document.title).toBe('Chat');
    expect(localStorage.getItem(LocalStorageKeys.APP_TITLE)).toBe('Chat');
    expect(cleanupTimestampedStorage).toHaveBeenCalledTimes(1);
  });

  it('installs CloudFront image retry from startup config', () => {
    const startupConfig = {
      cloudFront: {
        cookieRefresh: {
          endpoint: '/api/auth/cloudfront/refresh',
          domain: 'https://cdn.example.com',
        },
      },
    } as TStartupConfig;

    const { unmount } = renderHook(() => useAppStartup({ startupConfig, user: mockUser }), {
      wrapper,
    });

    expect(mockInstallCloudFrontImageRetry).toHaveBeenCalledWith(startupConfig, {
      getAuthorizationHeader: expect.any(Function),
    });
    const [, options] = mockInstallCloudFrontImageRetry.mock.calls[0];
    mockGetTokenHeader.mockReturnValue('Bearer app-token');

    expect(options.getAuthorizationHeader()).toBe('Bearer app-token');
    expect(mockGetTokenHeader).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockDisposeImageRetry).toHaveBeenCalledTimes(1);
  });
});
