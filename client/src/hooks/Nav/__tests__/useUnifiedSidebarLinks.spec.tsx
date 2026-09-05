import { renderHook } from '@testing-library/react';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';
import { resolveActivePanel } from '~/Providers/ActivePanelContext';
import useUnifiedSidebarLinks from '../useUnifiedSidebarLinks';

jest.mock('~/components/UnifiedSidebar/ConversationsSection', () => ({
  __esModule: true,
  default: () => null,
}));

describe('useUnifiedSidebarLinks', () => {
  it('returns only history without endpoint, auth, or query providers', () => {
    const { result, rerender } = renderHook(() => useUnifiedSidebarLinks());
    const links = result.current;

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual(
      expect.objectContaining({
        id: 'conversations',
        title: 'com_ui_chat_history',
        Component: ConversationsSection,
      }),
    );
    rerender();
    expect(result.current).toBe(links);
  });

  it.each(['skills', 'agents', 'mcp', 'artifacts', ''])(
    'resolves persisted panel "%s" to history',
    (active) => {
      const { result } = renderHook(() => useUnifiedSidebarLinks());

      expect(resolveActivePanel(active, result.current)).toBe('conversations');
    },
  );
});
