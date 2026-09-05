import React from 'react';
import { RecoilRoot } from 'recoil';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dataService, Permissions } from 'librechat-data-provider';
import { usePromptGroupsContext } from '~/Providers/PromptGroupsContext';
import InlinePromptsView from '~/components/Prompts/layouts/InlinePromptsView';
import Root from '../Root';

let mockCanUse = true;
let mockCanCreate = true;

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ isAuthenticated: true, logout: jest.fn() }),
  useSearchEnabled: jest.fn(),
  useAssistantsMap: jest.fn(),
  useAgentsMap: jest.fn(),
  useFileMap: jest.fn(),
  useHasAccess: ({ permission }: { permission: string }) =>
    permission === 'CREATE' ? mockCanCreate : mockCanUse,
  usePromptGroupsNav: jest.requireActual('~/hooks/Prompts/usePromptGroupsNav').default,
}));
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider/queries'),
  useHealthCheck: jest.fn(),
  useGetStartupConfig: () => ({ data: undefined }),
  useUserTermsQuery: () => ({ data: undefined }),
}));
jest.mock('~/Providers', () => ({
  ...jest.requireActual('~/Providers/PromptGroupsContext'),
  ...jest.requireActual('~/Providers/AgentsMapContext'),
  ...jest.requireActual('~/Providers/AssistantsMapContext'),
  ...jest.requireActual('~/Providers/FileMapContext'),
  SetConvoProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('~/utils', () => jest.requireActual('~/utils/prompts'));
jest.mock('~/components/Prompts', () => ({ CategoryIcon: () => null }));
jest.mock('~/components/UnifiedSidebar', () => ({ UnifiedSidebar: () => null }));
jest.mock('~/components/Banners', () => ({ Banner: () => null }));
jest.mock('~/components/ui', () => ({ TermsAndConditionsModal: () => null }));
jest.mock('~/components/Nav/KeyboardShortcutsDialog', () => () => null);
jest.mock('~/components/Nav/KeyboardDeleteDialog', () => () => null);
jest.mock('~/hooks/useKeyboardShortcuts', () => () => undefined);
jest.mock('~/components/Prompts/display/EmptyPromptPreview', () => () => (
  <div data-testid="empty-prompt" />
));
jest.mock('~/components/Prompts/forms/PromptForm', () => ({
  __esModule: true,
  default: ({ promptId }: { promptId: string }) => <MockPromptProbe id={promptId} />,
}));
jest.mock('~/components/Prompts/forms/CreatePromptForm', () => ({
  __esModule: true,
  default: ({ onSuccess }: { onSuccess: (id: string) => void }) => (
    <>
      <MockPromptProbe id="new" />
      <button data-testid="create-prompt" onClick={() => onSuccess('created-prompt')} />
    </>
  ),
}));

function MockPromptProbe({ id }: { id: string }) {
  const context = usePromptGroupsContext();
  return (
    <div
      data-testid="prompt-context"
      data-id={id}
      data-access={context?.hasAccess ?? false}
      data-loaded={context?.allPromptGroups.data != null}
    />
  );
}

function renderRoute(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RecoilRoot>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Root />}>
              <Route path="/c/:conversationId" element={<MockPromptProbe id="chat" />} />
              <Route path="/prompts/new" element={<InlinePromptsView />} />
              <Route path="/prompts/:promptId" element={<InlinePromptsView />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

describe('prompt query ownership', () => {
  beforeEach(() => {
    mockCanUse = true;
    mockCanCreate = true;
    jest.spyOn(dataService, 'getAllPromptGroups').mockResolvedValue([]);
    jest.spyOn(dataService, 'getPromptGroups').mockResolvedValue({
      promptGroups: [],
      pageNumber: '1',
      pageSize: 10,
      pages: 1,
      has_more: false,
      after: null,
    });
  });

  it('does not mount the prompt provider or start prompt queries on chat', () => {
    renderRoute('/c/new');

    expect(screen.getByTestId('prompt-context')).toHaveAttribute('data-access', 'false');
    expect(dataService.getAllPromptGroups).not.toHaveBeenCalled();
    expect(dataService.getPromptGroups).not.toHaveBeenCalled();
  });

  it.each(['/prompts/new', '/prompts/saved-prompt'])(
    'provides prompt data for %s',
    async (path) => {
      renderRoute(path);

      await waitFor(() =>
        expect(screen.getByTestId('prompt-context')).toHaveAttribute('data-loaded', 'true'),
      );
      expect(screen.getByTestId('prompt-context')).toHaveAttribute('data-access', 'true');
      expect(dataService.getAllPromptGroups).toHaveBeenCalledTimes(1);
      expect(dataService.getPromptGroups).toHaveBeenCalledTimes(1);
    },
  );

  it('retains navigation to the created prompt with provider data available', async () => {
    renderRoute('/prompts/new');
    fireEvent.click(screen.getByTestId('create-prompt'));

    await waitFor(() =>
      expect(screen.getByTestId('prompt-context')).toHaveAttribute('data-id', 'created-prompt'),
    );
    expect(screen.getByTestId('prompt-context')).toHaveAttribute('data-access', 'true');
  });

  it.each([Permissions.USE, Permissions.CREATE])(
    'does not load prompts when %s is denied',
    async (permission) => {
      mockCanUse = permission !== Permissions.USE;
      mockCanCreate = permission !== Permissions.CREATE;
      renderRoute('/prompts/new');

      expect(
        await screen.findByTestId(mockCanUse ? 'empty-prompt' : 'prompt-context'),
      ).toBeInTheDocument();
      expect(dataService.getAllPromptGroups).not.toHaveBeenCalled();
      expect(dataService.getPromptGroups).not.toHaveBeenCalled();
    },
  );
});
