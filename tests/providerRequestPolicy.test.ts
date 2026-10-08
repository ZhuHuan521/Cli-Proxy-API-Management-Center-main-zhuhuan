import { afterEach, describe, expect, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeProviderKeyConfig } from '../src/services/api/transformers';

const originalGet = apiClient.get;
const originalPut = apiClient.put;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
});

describe('provider request policy', () => {
  test('normalizes request retry and request-scoped error rules', () => {
    const config = normalizeProviderKeyConfig({
      'api-key': 'codex-key',
      'request-retry': 2,
      'request-scoped-errors': [
        {
          status: 400,
          match: ['context_length_exceeded'],
          'match-regexr': ['maximum_context_length$'],
          action: 'stop-and-cooldown',
        },
      ],
    });

    expect(config?.requestRetry).toBe(2);
    expect(config?.requestScopedErrors).toEqual([
      {
        status: 400,
        match: ['context_length_exceeded'],
        matchRegexr: ['maximum_context_length$'],
        action: 'stop-and-cooldown',
      },
    ]);
  });

  test('treats a negative request-retry override as inherit', () => {
    expect(normalizeProviderKeyConfig({ 'api-key': 'key', 'request-retry': -1 })?.requestRetry).toBeUndefined();
  });

  test('serializes provider request policy while preserving unknown fields', async () => {
    let putData: unknown;
    apiClient.get = (async () => ({
      'codex-api-key': [
        {
          'api-key': 'codex-key',
          'base-url': 'https://example.com',
          future: { keep: true },
        },
      ],
    })) as typeof apiClient.get;
    apiClient.put = (async (_url: string, data?: unknown) => {
      putData = data;
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.updateCodexConfig('codex-key', 'https://example.com', {
      apiKey: 'codex-key',
      baseUrl: 'https://example.com',
      requestRetry: 0,
      requestScopedErrors: [
        {
          status: 429,
          match: ['rate_limit'],
          action: 'continue-and-cooldown',
        },
      ],
    });

    expect(putData).toEqual([
      {
        'api-key': 'codex-key',
        'base-url': 'https://example.com',
        future: { keep: true },
        'request-retry': 0,
        'request-scoped-errors': [
          {
            status: 429,
            match: ['rate_limit'],
            action: 'continue-and-cooldown',
          },
        ],
      },
    ]);
  });
});
