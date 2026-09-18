import { afterEach, describe, expect, test } from 'bun:test';
import { apiCallApi } from '../src/services/api/apiCall';
import { buildCommandCodeModelsEndpoint, modelsApi } from '../src/services/api/models';
import {
  buildCommandCodeConfig,
  buildProviderGroups,
} from '../src/features/providers/useProviderWorkbench';
import { MODEL_DISCOVERY_BRANDS } from '../src/features/providers/sheets/forms/useModelDiscovery';
import { PROVIDER_DESCRIPTORS } from '../src/features/providers/descriptors';
import type { Config } from '../src/types';

const originalApiCallRequest = apiCallApi.request;

afterEach(() => {
  apiCallApi.request = originalApiCallRequest;
});

describe('CommandCode provider management', () => {
  test('loads the complete plugin config instead of relying on /config metadata', () => {
    const config = {
      raw: { plugins: { configs: { commandcode: { enabled: true, priority: 3 } } } },
    } as Config;
    const groups = buildProviderGroups(config, {
      enabled: true,
      priority: 17,
      shared_scheduling: false,
      api_key: 'user-test-key',
      base_url: 'https://cc.example.test',
      models: [{ name: 'vendor/model', alias: 'model' }],
    });
    const resource = groups.find((group) => group.id === 'commandcode')?.resources[0];

    expect(resource?.priority).toBe(17);
    expect(resource?.baseUrl).toBe('https://cc.example.test');
    expect(resource?.models).toEqual(['vendor/model']);
    expect(resource?.apiKey).toBe('user-test-key');
    expect(resource?.flags.sharedScheduling).toBeFalse();
  });

  test('exposes priority, key-pool support and model discovery for CommandCode', () => {
    expect(PROVIDER_DESCRIPTORS.commandcode.supportsPriority).toBeTrue();
    expect(PROVIDER_DESCRIPTORS.commandcode.supportsApiKeyEntries).toBeTrue();
    expect(MODEL_DISCOVERY_BRANDS).toContain('commandcode');
  });

  test('normalizes all supported CommandCode base URL forms', () => {
    expect(buildCommandCodeModelsEndpoint('https://api.commandcode.ai')).toBe(
      'https://api.commandcode.ai/provider/v1/models'
    );
    expect(buildCommandCodeModelsEndpoint('https://api.commandcode.ai/provider/v1')).toBe(
      'https://api.commandcode.ai/provider/v1/models'
    );
    expect(buildCommandCodeModelsEndpoint('https://api.commandcode.ai/provider/v1/models')).toBe(
      'https://api.commandcode.ai/provider/v1/models'
    );
  });

  test('fetches the provider catalog with CommandCode headers', async () => {
    let request: Parameters<typeof apiCallApi.request>[0] | undefined;
    apiCallApi.request = (async (payload) => {
      request = payload;
      return {
        statusCode: 200,
        header: {},
        bodyText: '',
        body: {
          data: [{ id: 'vendor/model-a', display_name: 'Model A' }, { id: 'vendor/model-a' }],
        },
      };
    }) as typeof apiCallApi.request;

    const models = await modelsApi.fetchCommandCodeModelsViaApiCall(
      'https://api.commandcode.ai',
      'user-test-key',
      {},
      undefined,
      '9.9.9'
    );

    expect(request).toMatchObject({
      method: 'GET',
      url: 'https://api.commandcode.ai/provider/v1/models',
      header: {
        Authorization: 'Bearer user-test-key',
        'x-cli-environment': 'production',
        'x-command-code-version': '9.9.9',
      },
    });
    expect(models).toEqual([{ name: 'vendor/model-a', alias: 'Model A' }]);
  });

  test('preserves and edits snake_case key pools while clearing fields with null', () => {
    const patch = buildCommandCodeConfig(
      {
        apiKey: '',
        name: '',
        baseUrl: '',
        proxyUrl: '',
        prefix: '',
        disabled: false,
        models: [],
        headers: [],
        excludedModelsText: '',
        priority: undefined,
        sharedScheduling: false,
        apiKeyEntries: [
          {
            apiKey: 'user-new-key',
            existingApiKey: 'user-old-key',
            proxyUrl: '',
            weight: undefined,
            disabled: false,
          },
        ],
      },
      {
        enabled: true,
        priority: 8,
        shared_scheduling: true,
        api_keys: [{ key: 'user-old-key', proxy_url: 'http://proxy.test', weight: 2 }],
        models: [{ name: 'old-model' }],
        proxy_url: 'http://global-proxy.test',
      }
    );

    expect(patch.api_keys).toEqual([{ key: 'user-new-key' }]);
    expect(patch.api_key).toBeNull();
    expect(patch.models).toBeNull();
    expect(patch.proxy_url).toBeNull();
    expect(patch.priority).toBeNull();
    expect(patch.shared_scheduling).toBe(false);
  });

  test('keeps legacy key aliases and unknown pool fields on a blank placeholder row', () => {
    const existing = {
      enabled: true,
      api_keys: [
        {
          api_key: 'legacy-key',
          weight: 3,
          custom_route: 'keep-me',
        },
      ],
    };
    const patch = buildCommandCodeConfig(
      {
        apiKey: '',
        name: '',
        baseUrl: '',
        proxyUrl: '',
        prefix: '',
        disabled: false,
        models: [],
        headers: [],
        excludedModelsText: '',
        apiKeyEntries: [{ apiKey: '', existingApiKey: '', proxyUrl: '', weight: undefined }],
      },
      existing
    );

    expect(patch.api_keys).toEqual(existing.api_keys);
  });

  test('clears a CommandCode key pool only when rows are explicitly removed', () => {
    const patch = buildCommandCodeConfig(
      {
        apiKey: '',
        name: '',
        baseUrl: '',
        proxyUrl: '',
        prefix: '',
        disabled: false,
        models: [],
        headers: [],
        excludedModelsText: '',
        apiKeyEntries: [],
      },
      { api_keys: [{ key: 'user-key' }] }
    );

    expect(patch.api_keys).toBeNull();
    expect(patch.api_key).toBeNull();
  });

  test('edits and preserves per-key scheduler priority', () => {
    const patch = buildCommandCodeConfig(
      {
        apiKey: '',
        name: '',
        baseUrl: '',
        proxyUrl: '',
        prefix: '',
        disabled: false,
        models: [],
        headers: [],
        excludedModelsText: '',
        apiKeyEntries: [
          {
            apiKey: 'user-key',
            existingApiKey: 'user-key',
            proxyUrl: '',
            weight: 2,
            priority: 17,
          },
        ],
      },
      {
        api_keys: [{ key: 'user-key', weight: 2, priority: 5, custom_route: 'keep-me' }],
      }
    );

    expect(patch.api_keys).toEqual([
      { key: 'user-key', weight: 2, priority: 17, custom_route: 'keep-me' },
    ]);
  });

  test('serializes custom model context and thinking capabilities', () => {
    const patch = buildCommandCodeConfig(
      {
        apiKey: '',
        name: '',
        baseUrl: 'https://api.commandcode.ai',
        proxyUrl: '',
        prefix: '',
        disabled: false,
        models: [
          {
            name: 'deepseek/deepseek-v4-flash',
            alias: 'deepseek-flash',
            maxContextLength: 1048576,
            thinkingLevels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto'],
            thinkingLevelsTouched: true,
          },
        ],
        headers: [],
        excludedModelsText: '',
        apiKeyEntries: [{ apiKey: 'user-test-key', proxyUrl: '', weight: undefined }],
      },
      {
        enabled: true,
        models: [{ name: 'deepseek/deepseek-v4-flash', display_name: 'DeepSeek Flash' }],
      }
    );

    expect(patch.models).toEqual([
      {
        name: 'deepseek/deepseek-v4-flash',
        alias: 'deepseek-flash',
        display_name: 'DeepSeek Flash',
        max_context_length: 1048576,
        thinking: {
          levels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'none', 'auto'],
        },
      },
    ]);
  });

  test('retains an existing kebab-case context key while editing a CommandCode model', () => {
    const patch = buildCommandCodeConfig(
      {
        apiKey: '',
        name: '',
        baseUrl: 'https://api.commandcode.ai',
        proxyUrl: '',
        prefix: '',
        disabled: false,
        models: [{ name: 'model-a', maxContextLength: 8192 }],
        headers: [],
        excludedModelsText: '',
        apiKeyEntries: [{ apiKey: 'user-test-key', proxyUrl: '', weight: undefined }],
      },
      {
        enabled: true,
        models: [{ name: 'model-a', 'max-context-length': 4096 }],
      }
    );

    expect(patch.models).toEqual([{ name: 'model-a', 'max-context-length': 8192 }]);
  });
});
