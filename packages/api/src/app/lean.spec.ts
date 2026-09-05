import { AppService } from '@librechat/data-schemas';
import { AgentCapabilities, FileSources, EImageOutputType } from 'librechat-data-provider';
import type { DeepPartial, TCustomConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { applyLeanConfig, applyLeanAppConfig } from './lean';

const raw: DeepPartial<TCustomConfig> = {
  endpoints: {
    agents: {
      capabilities: Object.values(AgentCapabilities),
      disableBuilder: false,
      recursionLimit: 37,
    },
    openAI: { baseURL: 'https://gateway.example/v1', headers: { 'X-Key': '${GATEWAY_KEY}' } },
    custom: [
      {
        name: 'gateway',
        apiKey: '${PROVIDER_KEY}',
        baseURL: 'https://gateway.example/v1',
        models: { default: ['vision-model'], fetch: false },
        headers: { 'X-User': '{{LIBRECHAT_USER_ID}}' },
      },
    ],
  },
  interface: {
    agents: true,
    skills: true,
    runCode: true,
    fileSearch: true,
    memories: true,
    webSearch: false,
    modelSelect: false,
    mcpServers: { use: true, create: true },
  },
  memory: { disabled: false, agent: { id: 'memory-agent', enabled: true } },
  skillSync: { github: { enabled: true, intervalMinutes: 90, runOnStartup: true, sources: [] } },
  mcpServers: { unused: { command: 'unused-command', args: [] } },
  webSearch: {
    serperApiKey: '${SEARCH_KEY}',
    searxngApiKey: '',
    safeSearch: 0,
    firecrawlOptions: { onlyMainContent: false },
  },
  registration: { socialLogins: ['openid'], allowedDomains: ['example.com'] },
  fileConfig: {
    endpoints: {
      default: {
        fileLimit: 7,
        fileSizeLimit: 23,
        totalSizeLimit: 61,
        supportedMimeTypes: ['image/png', 'application/pdf'],
      },
    },
  },
  imageOutputType: EImageOutputType.PNG,
};

function expectLean(config: DeepPartial<TCustomConfig>): void {
  expect(config.endpoints?.agents).toMatchObject({
    disableBuilder: true,
    capabilities: ['web_search'],
  });
  expect(config.interface).toMatchObject({
    agents: false,
    skills: false,
    runCode: false,
    fileSearch: false,
    memories: false,
    mcpServers: { use: false, create: false, share: false, public: false, configureObo: false },
  });
  expect(config.memory?.disabled).toBe(true);
  expect(config.skillSync?.github?.enabled).toBe(false);
  expect(config.mcpServers).toEqual({});
}

describe('permanent lean profile', () => {
  it('restricts raw configuration without mutating input or altering retained settings', () => {
    const original = structuredClone(raw);
    const result = applyLeanConfig(raw);
    expectLean(result);
    expect(raw).toEqual(original);
    expect(result.endpoints?.openAI).toBe(raw.endpoints?.openAI);
    expect(result.endpoints?.custom).toBe(raw.endpoints?.custom);
    expect(result.endpoints?.agents?.recursionLimit).toBe(37);
    expect(result.interface?.webSearch).toBe(false);
    expect(result.interface?.modelSelect).toBe(false);
    expect(result.webSearch).toBe(raw.webSearch);
    expect(result.registration).toBe(raw.registration);
    expect(result.fileConfig).toBe(raw.fileConfig);
    expect(result.imageOutputType).toBe(raw.imageOutputType);
    expect(applyLeanConfig(result)).toEqual(result);
  });

  it.each([
    [undefined, [AgentCapabilities.web_search]],
    [[], []],
    [[AgentCapabilities.execute_code], []],
    [[AgentCapabilities.web_search, AgentCapabilities.skills], [AgentCapabilities.web_search]],
  ])('intersects capabilities %j without restoring explicit opt-outs', (capabilities, expected) => {
    const config = { endpoints: { agents: { capabilities } } };
    expect(applyLeanConfig(config).endpoints?.agents?.capabilities).toEqual(expected);
    const effective: AppConfig = {
      config,
      endpoints: config.endpoints,
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
    };
    expect(applyLeanAppConfig(effective).endpoints?.agents?.capabilities).toEqual(expected);
  });

  it('normalizes effective and embedded raw config independently without mutation', () => {
    const config: AppConfig = {
      config: raw,
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
      endpoints: {
        agents: { capabilities: Object.values(AgentCapabilities) },
        openAI: { baseURL: 'https://gateway.example/v1', headers: { 'X-Key': '${GATEWAY_KEY}' } },
      },
      interfaceConfig: raw.interface,
      webSearch: raw.webSearch,
      registration: raw.registration,
      fileConfig: {
        endpoints: {
          default: {
            fileLimit: 7,
            fileSizeLimit: 23,
            totalSizeLimit: 61,
            supportedMimeTypes: ['image/png', 'application/pdf'],
          },
        },
      },
      memory: raw.memory,
      mcpConfig: { stale: { command: 'unused-command' } },
      skillSync: {
        github: { enabled: true, intervalMinutes: 90, runOnStartup: true, sources: [] },
      },
    };
    const original = structuredClone(config);
    const result = applyLeanAppConfig(config);
    expectLean(result.config);
    expectLean({
      endpoints: { agents: result.endpoints?.agents },
      interface: result.interfaceConfig,
      memory: result.memory,
      skillSync: result.skillSync,
      mcpServers: result.mcpConfig ?? {},
    });
    expect(config).toEqual(original);
    expect(result.webSearch).toBe(config.webSearch);
    expect(result.fileConfig).toBe(config.fileConfig);
    expect(result.registration).toBe(config.registration);
    expect(result.endpoints?.openAI).toBe(config.endpoints?.openAI);
    expect(result.interfaceConfig?.webSearch).toBe(false);
    expect(applyLeanAppConfig(result)).toEqual(result);
  });

  it('survives real AppService defaults while retaining search credentials and provider values', async () => {
    const result = applyLeanAppConfig(await AppService({ config: applyLeanConfig(raw) }));
    expectLean(result.config);
    expect(result.endpoints?.agents?.capabilities).toEqual(['web_search']);
    expect(result.endpoints?.agents?.disableBuilder).toBe(true);
    expect(result.endpoints?.openAI).toMatchObject(raw.endpoints?.openAI ?? {});
    expect(result.endpoints?.custom?.[0]).toMatchObject(raw.endpoints?.custom?.[0] ?? {});
    expect(result.webSearch).toMatchObject(raw.webSearch ?? {});
    expect(result.registration).toMatchObject(raw.registration ?? {});
    expect(result.config.fileConfig).toEqual(raw.fileConfig);
    expect(result.interfaceConfig?.webSearch).toBe(false);
    expect(result.mcpConfig).toEqual({});
  });

  it('does not share mutable restriction objects between calls', () => {
    const first = applyLeanConfig({});
    first.endpoints?.agents?.capabilities?.push(AgentCapabilities.skills);
    if (first.interface?.mcpServers) {
      first.interface.mcpServers.use = true;
    }
    const second = applyLeanConfig({});
    expectLean(second);
    expect(second.interface?.mcpServers?.use).toBe(false);
  });
});
