import { AgentCapabilities } from 'librechat-data-provider';
import type { DeepPartial, TCustomConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

const disabledInterface = {
  agents: false,
  skills: false,
  runCode: false,
  fileSearch: false,
  memories: false,
} as const;

function leanCapabilities(capabilities?: AgentCapabilities[]): AgentCapabilities[] {
  return (capabilities ?? [AgentCapabilities.web_search]).filter(
    (capability) => capability === AgentCapabilities.web_search,
  );
}

/** Apply the permanent fork profile before AppService performs setup/defaulting. */
export function applyLeanConfig(config: DeepPartial<TCustomConfig>): DeepPartial<TCustomConfig> {
  return {
    ...config,
    endpoints: {
      ...config.endpoints,
      agents: {
        ...config.endpoints?.agents,
        disableBuilder: true,
        capabilities: leanCapabilities(config.endpoints?.agents?.capabilities),
      },
    },
    interface: {
      ...config.interface,
      ...disabledInterface,
      mcpServers: { use: false, create: false, share: false, public: false, configureObo: false },
    },
    memory: { ...config.memory, disabled: true },
    skillSync: {
      ...config.skillSync,
      github: { ...config.skillSync?.github, enabled: false },
    },
    mcpServers: {},
  };
}

/** Reapply after DB merges and cache reads; overrides cannot re-enable unused work. */
export function applyLeanAppConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    config: applyLeanConfig(config.config),
    endpoints: {
      ...config.endpoints,
      agents: {
        ...config.endpoints?.agents,
        disableBuilder: true,
        capabilities: leanCapabilities(config.endpoints?.agents?.capabilities),
      },
    },
    interfaceConfig: {
      ...config.interfaceConfig,
      ...disabledInterface,
      mcpServers: { use: false, create: false, share: false, public: false, configureObo: false },
    },
    memory: { ...config.memory, disabled: true },
    skillSync: {
      ...config.skillSync,
      github: {
        intervalMinutes: 60,
        runOnStartup: false,
        sources: [],
        ...config.skillSync?.github,
        enabled: false,
      },
    },
    mcpConfig: {},
  };
}
