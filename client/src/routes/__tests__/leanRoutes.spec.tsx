import React from 'react';
import 'whatwg-fetch';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router-dom';

jest.mock('~/components/Auth', () => ({
  Login: () => null,
  VerifyEmail: () => null,
  Registration: () => null,
  ResetPassword: () => null,
  ApiErrorWatcher: () => null,
  TwoFactorScreen: () => null,
  RequestPasswordReset: () => null,
}));

jest.mock('~/components/OAuth', () => ({
  OAuthSuccess: () => null,
  OAuthError: () => null,
}));
jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('~/lib/rum/WithRum', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../RouteErrorBoundary', () => () => null);
jest.mock('../Layouts/Startup', () => () => null);
jest.mock('../Layouts/Login', () => () => null);
jest.mock('../Dashboard', () => ({
  __esModule: true,
  default: { path: 'dashboard', element: null },
}));
jest.mock('../ShareRoute', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../ChatRoute', () => ({
  __esModule: true,
  default: () => <div data-testid="chat" />,
}));
jest.mock('../Search', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../Root', () => {
  const { Outlet } = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return { __esModule: true, default: Outlet };
});

import { router } from '../index';

afterAll(() => router.dispose());

describe('lean routes', () => {
  it.each([
    '/skills',
    '/skills/new',
    '/skills/skill-id',
    '/skills/skill-id/edit',
    '/agents',
    '/agents/productivity',
  ])('replaces legacy %s with a new chat', async (path) => {
    const memoryRouter = createMemoryRouter(router.routes, { initialEntries: [path] });
    const { unmount } = render(<RouterProvider router={memoryRouter} />);

    expect(await screen.findByTestId('chat')).toBeInTheDocument();
    expect(memoryRouter.state.location.pathname).toBe('/c/new');
    expect(memoryRouter.state.historyAction).toBe('REPLACE');
    unmount();
    memoryRouter.dispose();
  });

  it.each([
    ['/c/conversation-id', 'c/:conversationId?'],
    ['/search', 'search'],
    ['/share/share-id', 'share/:shareId'],
    ['/prompts/new', 'prompts/new'],
    ['/prompts/prompt-id', 'prompts/:promptId'],
    ['/projects', 'projects'],
    ['/projects/project-id', 'projects/:projectId'],
  ])('retains %s', (path, routePath) => {
    const matches = matchRoutes(router.routes, path);

    expect(matches?.at(-1)?.route.path).toBe(routePath);
  });
});
