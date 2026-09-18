import { describe, expect, test } from 'bun:test';
import { buildPluginOAuthProviderCards } from '@/pages/oauthProviderCards';
import type { PluginListEntry } from '@/types';

const plugin = (overrides: Partial<PluginListEntry> = {}): PluginListEntry => ({
  id: 'commandcode',
  path: '',
  configured: true,
  registered: true,
  enabled: true,
  effectiveEnabled: true,
  supportsOAuth: true,
  oauthProvider: 'commandcode',
  logo: '',
  configFields: [],
  menus: [],
  metadata: {
    name: 'CommandCode Provider',
    version: '1.0.0',
    author: '',
    githubRepository: '',
    logo: '',
    configFields: [],
  },
  ...overrides,
});

describe('OAuth provider cards', () => {
  test('does not expose CommandCode as an OAuth login provider', () => {
    expect(buildPluginOAuthProviderCards([plugin()], '', new Set())).toEqual([]);
  });

  test('still exposes interactive plugin OAuth providers', () => {
    const cards = buildPluginOAuthProviderCards(
      [
        plugin({
          id: 'example-oauth',
          oauthProvider: 'example-oauth',
          metadata: {
            name: 'Example OAuth',
            version: '1.0.0',
            author: '',
            githubRepository: '',
            logo: '',
            configFields: [],
          },
        }),
      ],
      '',
      new Set()
    );

    expect(cards).toMatchObject([
      {
        kind: 'plugin',
        id: 'example-oauth',
        title: 'Example OAuth',
      },
    ]);
  });
});
