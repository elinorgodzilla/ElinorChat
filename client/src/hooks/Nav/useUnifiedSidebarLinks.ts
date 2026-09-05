import { MessagesSquare } from 'lucide-react';
import type { NavLink } from '~/common';
import ConversationsSection from '~/components/UnifiedSidebar/ConversationsSection';

const links: NavLink[] = [
  {
    title: 'com_ui_chat_history',
    label: '',
    icon: MessagesSquare,
    id: 'conversations',
    Component: ConversationsSection,
  },
];

export default function useUnifiedSidebarLinks() {
  return links;
}
