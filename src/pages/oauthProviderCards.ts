import { getPluginTitle, resolvePluginAssetURL } from '@/features/plugins/pluginResources';
import type { PluginListEntry } from '@/types';

export interface PluginOAuthProviderCard {
  kind: 'plugin';
  id: string;
  title: string;
  icon: string;
}

// The management API reports `supports_oauth` for every plugin that exposes an
// AuthProvider. CommandCode exposes that capability to parse API-key auth files
// for shared scheduling, but it does not have an interactive OAuth flow.
export const isCommandCodePlugin = (plugin: PluginListEntry, provider: string): boolean => {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[-_]/g, '');
  return normalize(plugin.id) === 'commandcode' || normalize(provider) === 'commandcode';
};

export const buildPluginOAuthProviderCards = (
  plugins: PluginListEntry[],
  apiBase: string,
  builtinProviderIds: ReadonlySet<string>
): PluginOAuthProviderCard[] => {
  const seenProviders = new Set(builtinProviderIds);
  return plugins.flatMap((plugin) => {
    const provider = plugin.oauthProvider;
    if (
      !plugin.supportsOAuth ||
      !plugin.effectiveEnabled ||
      !provider ||
      isCommandCodePlugin(plugin, provider) ||
      seenProviders.has(provider)
    ) {
      return [];
    }
    seenProviders.add(provider);
    return [
      {
        kind: 'plugin' as const,
        id: provider,
        title: getPluginTitle(plugin),
        icon: resolvePluginAssetURL(plugin.logo || plugin.metadata?.logo || '', apiBase),
      },
    ];
  });
};
