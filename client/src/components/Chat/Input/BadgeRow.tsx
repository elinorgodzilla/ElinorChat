import { memo } from 'react';
import { AgentCapabilities, defaultAgentCapabilities } from 'librechat-data-provider';
import { useGetAgentsConfig } from '~/hooks';
import { BadgeRowProvider } from '~/Providers';
import ToolsDropdown from './ToolsDropdown';
import ToolDialogs from './ToolDialogs';
import WebSearch from './WebSearch';

interface BadgeRowProps {
  showEphemeralBadges?: boolean;
  conversationId?: string | null;
  specName?: string | null;
  isSubmitting?: boolean;
}

function BadgeRow({ showEphemeralBadges, ...props }: BadgeRowProps) {
  const { agentsConfig } = useGetAgentsConfig();
  const searchEnabled = (agentsConfig?.capabilities ?? defaultAgentCapabilities).includes(
    AgentCapabilities.web_search,
  );
  if (!showEphemeralBadges || !searchEnabled) {
    return null;
  }
  return (
    <BadgeRowProvider {...props}>
      <div className="relative flex flex-wrap items-center gap-2">
        <ToolsDropdown />
        <WebSearch />
      </div>
      <ToolDialogs />
    </BadgeRowProvider>
  );
}

export default memo(BadgeRow);
