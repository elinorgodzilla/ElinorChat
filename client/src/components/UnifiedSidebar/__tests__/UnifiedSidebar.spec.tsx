import React, { useContext } from 'react';
import { RecoilRoot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConvoOptions from '~/components/Conversations/ConvoOptions/ConvoOptions';
import { useOptionalChatFormContext } from '~/Providers/ChatFormContext';
import { ChatContext } from '~/Providers/ChatContext';
import UnifiedSidebar from '../UnifiedSidebar';
import store from '~/store';

let mockIsMobile = false;
const mockUseChatHelpers = jest.fn();
const mockNavigateToConvo = jest.fn();
const mockUseNavigateToConvo = jest.fn((_index: number) => ({
  navigateToConvo: mockNavigateToConvo,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: () => false,
  useNewConvo: () => ({ newConversation: jest.fn() }),
  useChatHelpers: (...args: number[]) => mockUseChatHelpers(...args),
  useNavigateToConvo: (index: number) => mockUseNavigateToConvo(index),
}));
jest.mock('~/Providers', () => ({
  ...jest.requireActual('~/Providers/ActivePanelContext'),
  ...jest.requireActual('~/Providers/ChatContext'),
  ...jest.requireActual('~/Providers/ChatFormContext'),
}));
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useMediaQuery: () => mockIsMobile,
  useToastContext: () => ({ showToast: jest.fn() }),
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: undefined }),
  useDuplicateConversationMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  useAssignConversationToProjectMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  useDeleteConversationMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  useArchiveConvoMutation: () => ({ mutate: jest.fn(), isLoading: false }),
  usePinConversationMutation: () => ({ mutate: jest.fn(), isLoading: false }),
}));
jest.mock('~/utils', () => ({ cn: (...classes: string[]) => classes.filter(Boolean).join(' ') }));
jest.mock('../ExpandedPanel', () => () => null);
jest.mock('~/components/Conversations/ConvoOptions/ShareButton', () => () => null);
jest.mock('~/components/Conversations/ConvoOptions/DeleteButton', () => () => null);
jest.mock('~/components/Conversations/ConvoOptions/ProjectButton', () => () => null);
jest.mock('~/components/UnifiedSidebar/ConversationsSection', () => ({
  __esModule: true,
  default: () => <MockHistory />,
}));

const convoProps = {
  conversationId: 'saved-chat',
  title: 'Saved chat',
  retainView: jest.fn(),
  renameHandler: jest.fn(),
  isPopoverActive: false,
  setIsPopoverActive: jest.fn(),
  isActiveConvo: true,
};

function MockHistory() {
  const chat = useContext(ChatContext);
  const form = useOptionalChatFormContext();
  return (
    <div data-testid="history" data-chat-context={chat != null} data-form-context={form != null}>
      <ConvoOptions {...convoProps} />
    </div>
  );
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <RecoilRoot initializeState={({ set }) => set(store.sidebarExpanded, true)}>
        <MemoryRouter>{children}</MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>
  );
}

describe('history-only sidebar contexts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([false, true])(
    'renders history options without chat helpers or a form (mobile=%s)',
    (mobile) => {
      mockIsMobile = mobile;
      render(<UnifiedSidebar />, { wrapper });

      expect(
        screen.getByRole('button', { name: 'com_nav_convo_menu_options' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('history')).toHaveAttribute('data-chat-context', 'false');
      expect(screen.getByTestId('history')).toHaveAttribute('data-form-context', 'false');
      expect(mockUseChatHelpers).not.toHaveBeenCalled();
      expect(mockUseNavigateToConvo).toHaveBeenCalledWith(0);
    },
  );

  it('updates the navigation index when memoized conversation options receive a new index', () => {
    const { rerender } = render(<ConvoOptions {...convoProps} index={1} />, { wrapper });
    expect(mockUseNavigateToConvo).toHaveBeenLastCalledWith(1);

    rerender(<ConvoOptions {...convoProps} index={2} />);

    expect(mockUseNavigateToConvo).toHaveBeenLastCalledWith(2);
  });
});
