import { afterEach, describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeModelAliases, normalizeProviderKeyConfig } from '../src/services/api/transformers';

const originalGet = apiClient.get;
const originalPut = apiClient.put;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
});

describe('provider model capabilities', () => {
  test('normalizes max-context-length and input-modalities', () => {
    const models = normalizeModelAliases([
      {
        name: 'kimi-k2',
        'max-context-length': 1048576,
        'input-modalities': ['text', 'image'],
      },
    ]);

    expect(models).toEqual([
      {
        name: 'kimi-k2',
        maxContextLength: 1048576,
        inputModalities: ['text', 'image'],
      },
    ]);
  });

  test('normalizes codex alpha-search', () => {
    const config = normalizeProviderKeyConfig({
      'api-key': 'codex-key',
      'alpha-search': true,
    });

    expect(config?.alphaSearch).toBe(true);
  });

  test('serializes codex alpha-search and model max-context-length', async () => {
    let putData: unknown;
    apiClient.get = (async () => ({ 'codex-api-key': [] })) as typeof apiClient.get;
    apiClient.put = (async (_url: string, data?: unknown) => {
      putData = data;
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.createCodexConfig({
      apiKey: 'codex-key',
      baseUrl: 'https://example.com',
      alphaSearch: true,
      models: [{ name: 'gpt-5-codex', maxContextLength: 1048576 }],
    });

    expect(putData).toEqual([
      {
        'api-key': 'codex-key',
        'base-url': 'https://example.com',
        'alpha-search': true,
        models: [{ name: 'gpt-5-codex', 'max-context-length': 1048576 }],
      },
    ]);
  });

  test('serializes openai model context and input modalities', async () => {
    let putData: unknown;
    apiClient.get = (async () => ({ 'openai-compatibility': [] })) as typeof apiClient.get;
    apiClient.put = (async (_url: string, data?: unknown) => {
      putData = data;
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.createOpenAIProvider({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEntries: [{ apiKey: 'sk-or-v1-test' }],
      models: [
        {
          name: 'kimi-k2',
          maxContextLength: 1048576,
          inputModalities: ['text', 'image'],
        },
      ],
    });

    expect(putData).toEqual([
      {
        name: 'openrouter',
        'base-url': 'https://openrouter.ai/api/v1',
        'api-key-entries': [{ 'api-key': 'sk-or-v1-test' }],
        models: [
          {
            name: 'kimi-k2',
            'max-context-length': 1048576,
            'input-modalities': ['text', 'image'],
          },
        ],
      },
    ]);
  });
});
