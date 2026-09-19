import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pluginsApi, providersApi } from '@/services/api';
import { getErrorMessage, isRecord } from '@/utils/helpers';
import { useAuthStore, useConfigStore } from '@/stores';
import {
  stripDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import type {
  Config,
  GeminiKeyConfig,
  ModelAlias,
  OpenAIProviderConfig,
  ProviderKeyConfig,
} from '@/types';
import {
  apiKeyFunToResource,
  commandcodeToResource,
  claudeToResource,
  codexToResource,
  fennoAIToResource,
  geminiToResource,
  interactionsToResource,
  openaiToResource,
  qiniuCloudToResource,
  kimiToResource,
  vertexToResource,
  xaiToResource,
} from './adapters';
import { PROVIDER_BRAND_ORDER } from './descriptors';
import { buildThinkingFromLevels } from './thinkingLevels';
import {
  readCommandCodeApiKey,
  type CommandCodeAPIKeyEntry,
  type ProviderBrand,
  type CommandCodePluginConfig,
  type ProviderEntryFormInput,
  type ProviderGroup,
  type ProviderResource,
  type ProviderSnapshot,
  type SponsorKeyEntryInput,
  type SponsorProviderBrand,
  type SponsorProviderRaw,
} from './types';

const COMMANDCODE_PLUGIN_ID = 'commandcode';
import {
  buildApiKeyFunRaw,
  isApiKeyFunClaudeProvider,
  isApiKeyFunCodexProvider,
  isApiKeyFunOpenAIProvider,
} from './sponsor';
import { buildFennoAIRaw, isFennoAIClaudeProvider, isFennoAICodexProvider } from './fennoAI';
import {
  buildQiniuCloudRaw,
  isQiniuCloudClaudeProvider,
  isQiniuCloudCodexProvider,
  isQiniuCloudGeminiProvider,
  isQiniuCloudOpenAIProvider,
} from './qiniuCloud';
import {
  buildKimiRaw,
  isKimiClaudeProvider,
  isKimiCodexProvider,
  isKimiOpenAIProvider,
} from './kimi';
import { getSponsorProviderDefinition, type SponsorProtocolUrls } from './sponsorDefinitions';
import { runSponsorMutationWithRecovery } from './sponsorMutationRecovery';

export interface UseProviderWorkbenchResult {
  connected: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  errorMessage: string | null;
  snapshot: ProviderSnapshot | null;
  refetch: () => Promise<void>;

  createProvider: (brand: ProviderBrand, input: ProviderEntryFormInput) => Promise<void>;
  updateProvider: (resource: ProviderResource, input: ProviderEntryFormInput) => Promise<void>;
  deleteProvider: (resource: ProviderResource) => Promise<void>;
  toggleDisabled: (resource: ProviderResource, disabled: boolean) => Promise<void>;
  mutating: boolean;
  refreshSnapshot: () => void;
}

/* -------------------------------------------------------------------------- */
/* form -> backend config 转换                                                 */
/* -------------------------------------------------------------------------- */

const parseTextList = (text: string): string[] =>
  text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const readCommandCodeConfig = (config: Config | null): CommandCodePluginConfig | null => {
  const raw = isRecord(config?.raw) ? config.raw : {};
  const plugins = isRecord(raw.plugins) ? raw.plugins : {};
  const configs = isRecord(plugins.configs) ? plugins.configs : {};
  const value = configs[COMMANDCODE_PLUGIN_ID];
  return isRecord(value) ? (value as CommandCodePluginConfig) : null;
};

const hasConfigValues = (
  value: CommandCodePluginConfig | null | undefined
): value is CommandCodePluginConfig => Boolean(value && Object.keys(value).length > 0);

const resolveCommandCodeConfig = (
  config: Config | null,
  loaded: CommandCodePluginConfig | null | undefined
): CommandCodePluginConfig | null =>
  hasConfigValues(loaded) ? loaded : readCommandCodeConfig(config);

const COMMANDCODE_CONTEXT_LENGTH_KEYS = [
  'max_context_length',
  'max-context-length',
  'maxContextLength',
] as const;

const COMMANDCODE_TEST_MODEL_KEYS = ['test_model', 'test-model', 'testModel'] as const;

const hasOwnRecordKey = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const firstExistingKey = <T extends string>(
  value: Record<string, unknown>,
  keys: readonly T[],
  fallback: T
): T => keys.find((key) => hasOwnRecordKey(value, key)) ?? fallback;

export const buildCommandCodeConfig = (
  input: ProviderEntryFormInput,
  existing?: CommandCodePluginConfig | null
): Record<string, unknown> => {
  const next = { ...(existing ?? {}) } as Record<string, unknown>;
  const hasOwn = (key: string): boolean => Object.prototype.hasOwnProperty.call(next, key);
  const existingKeyPool = Array.isArray(existing?.api_keys) ? existing.api_keys : [];
  const existingKeyEntriesByKey = new Map(
    existingKeyPool
      .filter((entry) => readCommandCodeApiKey(entry))
      .map((entry) => [readCommandCodeApiKey(entry), entry] as const)
  );

  // The editor deliberately keeps saved secrets in `existingApiKey`; a blank
  // password therefore means "keep this key", while removing a row means
  // "remove it from the pool". The management PATCH endpoint treats null as a
  // deletion marker, so use it for fields the user explicitly cleared.
  if (input.apiKeyEntries !== undefined) {
    // The form keeps one blank row as a visual placeholder. Treat that row as
    // "unchanged" when an existing pool is present; removing a row explicitly
    // produces an empty array and still clears the pool.
    const hasEnteredKey = input.apiKeyEntries.some(
      (entry) => entry.apiKey.trim() || entry.existingApiKey?.trim()
    );
    if (!hasEnteredKey && input.apiKeyEntries.length > 0 && existingKeyPool.length > 0) {
      next.api_keys = existingKeyPool;
    } else {
      const keyPool = input.apiKeyEntries
        .map((entry, index) => {
          const oldEntryCandidate =
            existingKeyEntriesByKey.get(entry.existingApiKey?.trim() || '') ??
            existingKeyPool[index];
          const oldEntry = isRecord(oldEntryCandidate)
            ? (oldEntryCandidate as Record<string, unknown>)
            : {};
          const key =
            entry.apiKey.trim() ||
            entry.existingApiKey?.trim() ||
            readCommandCodeApiKey(oldEntry as CommandCodeAPIKeyEntry);
          if (!key) return null;
          const nextEntry: Record<string, unknown> = { ...oldEntry, key };
          // Normalize the legacy alias once the canonical `key` field is known.
          delete nextEntry.api_key;
          const proxyUrl = entry.proxyUrl.trim();
          if (proxyUrl) nextEntry.proxy_url = proxyUrl;
          else delete nextEntry.proxy_url;
          if (entry.weight === undefined) delete nextEntry.weight;
          else nextEntry.weight = entry.weight;
          if (entry.priority === undefined) delete nextEntry.priority;
          else nextEntry.priority = entry.priority;
          if (entry.disabled === true) nextEntry.disabled = true;
          else delete nextEntry.disabled;
          // Per-key cooldown override is optional; leave hand-written values
          // alone when the editor does not expose the field.
          if (entry.disableCooling !== undefined) {
            nextEntry.disable_cooling = entry.disableCooling;
          }
          return nextEntry;
        })
        .filter((entry): entry is Record<string, unknown> => entry !== null);

      if (keyPool.length) {
        next.api_keys = keyPool;
        next.api_key = null;
      } else {
        next.api_keys = null;
        next.api_key = null;
      }
    }
  } else if (input.apiKey.trim()) {
    next.api_key = input.apiKey.trim();
    next.api_keys = null;
  }

  const baseUrl = input.baseUrl.trim();
  if (baseUrl) next.base_url = baseUrl;
  else if (hasOwn('base_url')) next.base_url = null;

  const proxyUrl = input.proxyUrl.trim();
  if (proxyUrl) next.proxy_url = proxyUrl;
  else if (hasOwn('proxy_url')) next.proxy_url = null;

  const existingModels = Array.isArray(existing?.models) ? existing.models : [];
  const existingModelsByName = new Map(
    existingModels
      .filter((model) => model && typeof model.name === 'string' && model.name.trim())
      .map((model) => [model.name!.trim(), model] as const)
  );
  const models = (input.models ?? [])
    .map((model, index) => {
      const name = model.name.trim();
      if (!name) return null;
      const oldModelCandidate = existingModelsByName.get(name) ?? existingModels[index];
      const oldModel = isRecord(oldModelCandidate)
        ? (oldModelCandidate as Record<string, unknown>)
        : {};
      const nextModel: Record<string, unknown> = { ...oldModel, name };
      const alias = model.alias?.trim();
      if (alias) nextModel.alias = alias;
      else delete nextModel.alias;

      // CommandCode plugin configs historically used snake_case while some
      // host-shaped hand-written configs use kebab/camel case. Preserve an
      // existing spelling and use the plugin-native spelling for new rows.
      const contextLengthKey = firstExistingKey(
        oldModel,
        COMMANDCODE_CONTEXT_LENGTH_KEYS,
        'max_context_length'
      );
      if (model.maxContextLength !== undefined) {
        nextModel[contextLengthKey] = model.maxContextLength;
      } else {
        COMMANDCODE_CONTEXT_LENGTH_KEYS.forEach((key) => delete nextModel[key]);
      }

      if (model.thinkingLevelsTouched) {
        const thinking = buildThinkingFromLevels(model.thinkingLevels);
        if (thinking) nextModel.thinking = thinking;
        else delete nextModel.thinking;
      } else if ((model.thinkingJson ?? '').trim()) {
        nextModel.thinking = parseThinkingJson(model.thinkingJson);
      } else {
        delete nextModel.thinking;
      }

      if (model.priority !== undefined) nextModel.priority = model.priority;
      else delete nextModel.priority;

      const testModelKey = firstExistingKey(oldModel, COMMANDCODE_TEST_MODEL_KEYS, 'test_model');
      if (model.testModel?.trim()) nextModel[testModelKey] = model.testModel.trim();
      else COMMANDCODE_TEST_MODEL_KEYS.forEach((key) => delete nextModel[key]);
      return nextModel;
    })
    .filter((model): model is Record<string, unknown> => model !== null);
  if (models.length) next.models = models;
  else if (hasOwn('models')) next.models = null;

  next.enabled = !input.disabled;
  if (input.sharedScheduling === undefined) {
    if (hasOwn('shared_scheduling')) next.shared_scheduling = null;
  } else {
    next.shared_scheduling = input.sharedScheduling;
  }
  if (input.disableCooling === true) {
    next.disable_cooling = true;
  } else if (hasOwn('disable_cooling')) {
    // Unchecked means "inherit host policy", not "force cooling on".
    next.disable_cooling = null;
  }
  if (input.priority === undefined) {
    if (hasOwn('priority')) next.priority = null;
  } else {
    next.priority = input.priority;
  }
  return next;
};

const headersFromEntries = (
  entries: Array<{ key: string; value: string }>
): Record<string, string> => {
  const out: Record<string, string> = {};
  entries.forEach((entry) => {
    const key = entry.key.trim();
    if (!key) return;
    out[key] = entry.value;
  });
  return out;
};

const parseThinkingJson = (value: string | undefined): Record<string, unknown> | undefined => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Thinking config must be a JSON object');
  }
  return parsed as Record<string, unknown>;
};

/**
 * `'*'` 是「该 provider 已停用」的编码，其唯一所有者是 `form.disabled`：
 * 载入时 `stripDisableAllModelsRule` 把它剥进该 flag，保存时仅凭该 flag 重新追加。
 * 因此这里必须过滤掉用户在文本里手打的 `'*'`——排除模型的编辑面永远不该能开关停用。
 * 导出仅为让 tests/providerExcludedModelsDisableRule.test.ts 钉住这个不变量。
 */
export const buildExcludedModels = (
  textValue: string,
  disabled: boolean,
  brand: ProviderBrand
): string[] | undefined => {
  const list = parseTextList(textValue);
  const filtered = list.filter((v) => v !== '*');
  if (brand === 'openaiCompatibility') {
    return filtered.length ? filtered : undefined;
  }
  if (disabled) {
    return withDisableAllModelsRule(filtered);
  }
  return filtered.length ? filtered : undefined;
};

const buildModelAliases = (
  models: ProviderEntryFormInput['models'] | undefined,
  includeOpenAICompatFields = false
): ModelAlias[] =>
  (models ?? [])
    .map((m) => {
      const entry: ModelAlias = {
        name: m.name.trim(),
        alias: m.alias?.trim() || undefined,
        priority: m.priority,
        testModel: m.testModel,
        maxContextLength: m.maxContextLength,
        thinking: m.thinkingLevelsTouched
          ? buildThinkingFromLevels(m.thinkingLevels)
          : parseThinkingJson(m.thinkingJson),
      };
      if (includeOpenAICompatFields) {
        entry.image = m.image === true;
        if (m.inputModalities?.length) {
          entry.inputModalities = m.inputModalities;
        }
      }
      return entry;
    })
    .filter((m) => m.name);

const buildProviderKeyConfig = (
  brand: 'gemini' | 'interactions' | 'codex' | 'xai' | 'claude' | 'vertex',
  input: ProviderEntryFormInput,
  existing?: ProviderKeyConfig | GeminiKeyConfig | null
): ProviderKeyConfig | GeminiKeyConfig => {
  const headers = headersFromEntries(input.headers);
  const models = buildModelAliases(input.models);
  const excluded = buildExcludedModels(input.excludedModelsText, input.disabled, brand);
  const apiKeyChanged = input.apiKey.trim().length > 0;
  const next: ProviderKeyConfig = {
    apiKey: apiKeyChanged ? input.apiKey.trim() : (existing?.apiKey ?? ''),
    priority: input.priority,
    weight: input.weight,
    prefix: input.prefix.trim() || undefined,
    baseUrl: input.baseUrl.trim() || undefined,
    proxyUrl: input.proxyUrl.trim() || undefined,
    models: models.length ? models : undefined,
    headers: Object.keys(headers).length ? headers : undefined,
    excludedModels: excluded,
    disableCooling: input.disableCooling === true,
    authIndex: existing?.authIndex,
  };
  if ((brand === 'codex' || brand === 'xai') && input.websockets !== undefined) {
    next.websockets = input.websockets;
  }
  if (brand === 'codex' && input.alphaSearch !== undefined) {
    next.alphaSearch = input.alphaSearch;
  }
  if (brand === 'claude' && input.cloak) {
    next.cloak = {
      mode: input.cloak.mode.trim() || undefined,
      strictMode: input.cloak.strictMode,
      sensitiveWords: parseTextList(input.cloak.sensitiveWordsText),
      cacheUserId: input.cloak.cacheUserId === true,
    };
  }
  if (brand === 'claude') {
    next.fingerprintProfile = input.fingerprintProfile?.trim() || undefined;
  }
  return next;
};

const buildOpenAIConfig = (
  input: ProviderEntryFormInput,
  existing?: OpenAIProviderConfig | null
): OpenAIProviderConfig => {
  const headers = headersFromEntries(input.headers);
  const models = buildModelAliases(input.models, true);
  const apiKeyEntries =
    input.apiKeyEntries
      ?.map((entry, index) => {
        const fallbackApiKey =
          entry.existingApiKey?.trim() || existing?.apiKeyEntries?.[index]?.apiKey?.trim() || '';
        return {
          apiKey: entry.apiKey.trim() || fallbackApiKey,
          proxyUrl: entry.proxyUrl.trim() || undefined,
          weight: entry.weight,
          authIndex: entry.authIndex?.trim() || undefined,
        };
      })
      .filter((entry) => entry.apiKey) ?? [];

  return {
    ...(existing ?? {}),
    name: input.name.trim(),
    baseUrl: input.baseUrl.trim(),
    prefix: input.prefix.trim() || undefined,
    apiKeyEntries,
    disabled: input.disabled,
    disableCooling: input.disableCooling === true,
    headers: Object.keys(headers).length ? headers : undefined,
    models: models.length ? models : undefined,
    priority: input.priority,
    testModel: input.testModel?.trim() || undefined,
  };
};

const sponsorEntryApiKey = (entry: SponsorKeyEntryInput): string =>
  entry.apiKey.trim() || entry.existingApiKey?.trim() || '';

const buildSponsorOpenAIConfig = (
  entry: SponsorKeyEntryInput,
  providerName: string,
  getProtocolUrls: (value: string | undefined | null) => SponsorProtocolUrls,
  existing?: OpenAIProviderConfig
): OpenAIProviderConfig => {
  const urls = getProtocolUrls(entry.baseUrl);
  const models = buildModelAliases(entry.models, true);
  const apiKey = sponsorEntryApiKey(entry);
  const firstExistingEntry = existing?.apiKeyEntries?.[0];
  const apiKeyEntries = apiKey
    ? [
        {
          ...(firstExistingEntry ?? {}),
          apiKey,
          proxyUrl: entry.proxyUrl.trim() || undefined,
          weight: entry.weight,
        },
      ]
    : [];

  return {
    ...(existing ?? {}),
    name: providerName,
    baseUrl: urls.openai,
    prefix: entry.prefix.trim() || undefined,
    disabled: entry.disabled,
    disableCooling: entry.disableCooling === true,
    priority: entry.priority,
    apiKeyEntries,
    models: models.length ? models : undefined,
  };
};

const buildSponsorProviderKeyConfig = (
  entry: SponsorKeyEntryInput,
  protocol: 'claude' | 'codex',
  getProtocolUrls: (value: string | undefined | null) => SponsorProtocolUrls,
  existing?: ProviderKeyConfig
): ProviderKeyConfig => {
  const urls = getProtocolUrls(entry.baseUrl);
  const models = buildModelAliases(entry.models);
  const apiKey = sponsorEntryApiKey(entry);
  const excluded = entry.disabled
    ? withDisableAllModelsRule(stripDisableAllModelsRule(existing?.excludedModels))
    : withoutDisableAllModelsRule(existing?.excludedModels);

  return {
    ...(existing ?? {}),
    apiKey,
    baseUrl: protocol === 'claude' ? urls.anthropic : urls.codex,
    proxyUrl: entry.proxyUrl.trim() || undefined,
    prefix: entry.prefix.trim() || undefined,
    priority: entry.priority,
    weight: entry.weight,
    disableCooling: entry.disableCooling === true,
    excludedModels: excluded,
    models: models.length ? models : undefined,
  };
};

const buildSponsorGeminiConfig = (
  entry: SponsorKeyEntryInput,
  getProtocolUrls: (value: string | undefined | null) => SponsorProtocolUrls,
  existing?: GeminiKeyConfig
): GeminiKeyConfig => {
  const urls = getProtocolUrls(entry.baseUrl);
  const models = buildModelAliases(entry.models);
  const apiKey = sponsorEntryApiKey(entry);
  const excluded = entry.disabled
    ? withDisableAllModelsRule(stripDisableAllModelsRule(existing?.excludedModels))
    : withoutDisableAllModelsRule(existing?.excludedModels);

  return {
    ...(existing ?? {}),
    apiKey,
    baseUrl: urls.gemini,
    proxyUrl: entry.proxyUrl.trim() || undefined,
    prefix: entry.prefix.trim() || undefined,
    priority: entry.priority,
    weight: entry.weight,
    disableCooling: entry.disableCooling === true,
    excludedModels: excluded,
    models: models.length ? models : undefined,
  };
};

const normalizeSponsorKeyEntries = (
  entries: SponsorKeyEntryInput[] | undefined
): SponsorKeyEntryInput[] => (entries ?? []).filter((entry) => sponsorEntryApiKey(entry));

const toggleSponsorConfig = async (raw: SponsorProviderRaw, disabled: boolean) => {
  for (const item of raw.gemini) {
    const excludedModels = disabled
      ? withDisableAllModelsRule(item.config.excludedModels)
      : withoutDisableAllModelsRule(item.config.excludedModels);
    await providersApi.updateGeminiKey(item.config.apiKey, item.config.baseUrl, {
      ...item.config,
      excludedModels,
    });
  }
  for (const item of raw.codex) {
    const excludedModels = disabled
      ? withDisableAllModelsRule(item.config.excludedModels)
      : withoutDisableAllModelsRule(item.config.excludedModels);
    await providersApi.updateCodexConfig(item.config.apiKey, item.config.baseUrl, {
      ...item.config,
      excludedModels,
    });
  }
  for (const item of raw.claude) {
    const excludedModels = disabled
      ? withDisableAllModelsRule(item.config.excludedModels)
      : withoutDisableAllModelsRule(item.config.excludedModels);
    await providersApi.updateClaudeConfig(item.config.apiKey, item.config.baseUrl, {
      ...item.config,
      excludedModels,
    });
  }
  for (const item of raw.openai) {
    await providersApi.updateOpenAIProviderDisabled(item.index, disabled);
  }
};

export const buildProviderGroups = (
  config: Config,
  loadedCommandCodeConfig?: CommandCodePluginConfig | null
): ProviderGroup[] =>
  PROVIDER_BRAND_ORDER.reduce<ProviderGroup[]>((groups, brand) => {
    let resources: ProviderResource[];
    switch (brand) {
      case 'gemini':
        resources = (config.geminiApiKeys ?? []).reduce<ProviderResource[]>((out, item, index) => {
          if (!isQiniuCloudGeminiProvider(item)) {
            out.push(geminiToResource(item, index));
          }
          return out;
        }, []);
        break;
      case 'interactions':
        resources = (config.interactionsApiKeys ?? []).map((item, index) =>
          interactionsToResource(item, index)
        );
        break;
      case 'codex':
        resources = (config.codexApiKeys ?? []).reduce<ProviderResource[]>((out, item, index) => {
          if (
            !isApiKeyFunCodexProvider(item) &&
            !isFennoAICodexProvider(item) &&
            !isQiniuCloudCodexProvider(item) &&
            !isKimiCodexProvider(item)
          ) {
            out.push(codexToResource(item, index));
          }
          return out;
        }, []);
        break;
      case 'xai':
        resources = (config.xaiApiKeys ?? []).map((item, index) => xaiToResource(item, index));
        break;
      case 'claude':
        resources = (config.claudeApiKeys ?? []).reduce<ProviderResource[]>((out, item, index) => {
          if (
            !isApiKeyFunClaudeProvider(item) &&
            !isFennoAIClaudeProvider(item) &&
            !isQiniuCloudClaudeProvider(item) &&
            !isKimiClaudeProvider(item)
          ) {
            out.push(claudeToResource(item, index));
          }
          return out;
        }, []);
        break;
      case 'vertex':
        resources = (config.vertexApiKeys ?? []).map((item, index) =>
          vertexToResource(item, index)
        );
        break;
      case 'openaiCompatibility':
        resources = (config.openaiCompatibility ?? []).reduce<ProviderResource[]>(
          (out, item, index) => {
            if (
              !isApiKeyFunOpenAIProvider(item) &&
              !isQiniuCloudOpenAIProvider(item) &&
              !isKimiOpenAIProvider(item)
            ) {
              out.push(openaiToResource(item, index));
            }
            return out;
          },
          []
        );
        break;
      case 'commandcode': {
        const commandCodeConfig = resolveCommandCodeConfig(config, loadedCommandCodeConfig);
        resources = commandCodeConfig ? [commandcodeToResource(commandCodeConfig, 0)] : [];
        break;
      }
      case 'apikeyFun': {
        const sponsorResource = apiKeyFunToResource(buildApiKeyFunRaw(config));
        resources = sponsorResource ? [sponsorResource] : [];
        break;
      }
      case 'fennoAI': {
        const sponsorResource = fennoAIToResource(buildFennoAIRaw(config));
        resources = sponsorResource ? [sponsorResource] : [];
        break;
      }
      case 'qiniuCloud': {
        const sponsorResource = qiniuCloudToResource(buildQiniuCloudRaw(config));
        resources = sponsorResource ? [sponsorResource] : [];
        break;
      }
      case 'kimi': {
        const sponsorResource = kimiToResource(buildKimiRaw(config));
        resources = sponsorResource ? [sponsorResource] : [];
        break;
      }
      default:
        return groups;
    }
    groups.push({
      id: brand,
      resources,
    });
    return groups;
  }, []);

/* -------------------------------------------------------------------------- */
/* hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useProviderWorkbench(): UseProviderWorkbenchResult {
  const connectionStatus = useAuthStore((s) => s.connectionStatus);
  const config = useConfigStore((s) => s.config);
  const fetchConfig = useConfigStore((s) => s.fetchConfig);
  const updateConfigValue = useConfigStore((s) => s.updateConfigValue);
  const isCacheValid = useConfigStore((s) => s.isCacheValid);

  const [isPending, setIsPending] = useState<boolean>(() => !isCacheValid());
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mutating, setMutating] = useState<boolean>(false);
  const [fetchedAt, setFetchedAt] = useState<string>(() => new Date().toISOString());
  // Plugin config is intentionally loaded through /plugins/:id/config. The
  // generic /config response only exposes host-owned enabled/priority fields.
  const [commandCodeConfig, setCommandCodeConfig] = useState<CommandCodePluginConfig | null>(null);

  const hasFetchedRef = useRef(false);

  const connected = connectionStatus === 'connected';

  const refetch = useCallback(async () => {
    setIsFetching(true);
    setErrorMessage(null);
    try {
      const [configResult, vertexResult, openaiResult, commandCodeResult] =
        await Promise.allSettled([
          fetchConfig(true),
          providersApi.getVertexConfigs(),
          providersApi.getOpenAIProviders(),
          pluginsApi.getConfig(COMMANDCODE_PLUGIN_ID),
        ]);
      if (configResult.status !== 'fulfilled') {
        throw configResult.reason;
      }
      if (vertexResult.status === 'fulfilled') {
        updateConfigValue('vertex-api-key', vertexResult.value || []);
      }
      if (openaiResult.status === 'fulfilled') {
        updateConfigValue('openai-compatibility', openaiResult.value || []);
      }
      if (commandCodeResult.status === 'fulfilled') {
        setCommandCodeConfig(
          isRecord(commandCodeResult.value)
            ? (commandCodeResult.value as CommandCodePluginConfig)
            : null
        );
      } else {
        // A backend without plugin management support should not prevent the
        // built-in provider page from loading. Keep only the host metadata
        // fallback in that case.
        setCommandCodeConfig(null);
      }
      setFetchedAt(new Date().toISOString());
    } catch (err) {
      setErrorMessage(getErrorMessage(err) || 'Failed to load providers');
    } finally {
      setIsPending(false);
      setIsFetching(false);
    }
  }, [fetchConfig, updateConfigValue]);

  const refreshSnapshot = useCallback(() => {
    setFetchedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    if (!connected) {
      hasFetchedRef.current = false;
      setCommandCodeConfig(null);
      return;
    }
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    refetch().catch(() => {});
  }, [connected, refetch]);

  /* ------------------- snapshot 计算 ------------------- */

  const snapshot = useMemo<ProviderSnapshot | null>(() => {
    if (!config) return null;
    return {
      fetchedAt,
      groups: buildProviderGroups(config, commandCodeConfig),
    };
  }, [commandCodeConfig, config, fetchedAt]);

  /* ------------------- mutations ------------------- */

  const persistSponsorConfig = useCallback(
    async (brand: SponsorProviderBrand, input: ProviderEntryFormInput) => {
      const definition = getSponsorProviderDefinition(brand);
      const raw =
        brand === 'apikeyFun'
          ? buildApiKeyFunRaw(config)
          : brand === 'fennoAI'
            ? buildFennoAIRaw(config)
            : brand === 'qiniuCloud'
              ? buildQiniuCloudRaw(config)
              : buildKimiRaw(config);
      const entries = normalizeSponsorKeyEntries(input.sponsorKeyEntries);
      const openaiEntry = entries.find((entry) => entry.protocol === 'openai');
      const claudeEntry = entries.find((entry) => entry.protocol === 'claude');
      const codexEntry = entries.find((entry) => entry.protocol === 'codex');
      const geminiEntry = entries.find((entry) => entry.protocol === 'gemini');

      if (definition.protocols.includes('gemini')) {
        const current = raw.gemini[0];
        if (geminiEntry) {
          const next = buildSponsorGeminiConfig(
            geminiEntry,
            definition.getProtocolUrls,
            current?.config
          );
          if (current) {
            await providersApi.updateGeminiKey(current.config.apiKey, current.config.baseUrl, next);
          } else {
            await providersApi.createGeminiKey(next);
          }
        } else {
          for (const item of raw.gemini) {
            await providersApi.deleteGeminiKey(item.config.apiKey, item.config.baseUrl);
          }
        }
      }

      const currentCodex = raw.codex[0];
      if (codexEntry) {
        const next = buildSponsorProviderKeyConfig(
          codexEntry,
          'codex',
          definition.getProtocolUrls,
          currentCodex?.config
        );
        if (currentCodex) {
          await providersApi.updateCodexConfig(
            currentCodex.config.apiKey,
            currentCodex.config.baseUrl,
            next
          );
        } else {
          await providersApi.createCodexConfig(next);
        }
      } else {
        for (const item of raw.codex) {
          await providersApi.deleteCodexConfig(item.config.apiKey, item.config.baseUrl);
        }
      }

      const currentClaude = raw.claude[0];
      if (claudeEntry) {
        const next = buildSponsorProviderKeyConfig(
          claudeEntry,
          'claude',
          definition.getProtocolUrls,
          currentClaude?.config
        );
        if (currentClaude) {
          await providersApi.updateClaudeConfig(
            currentClaude.config.apiKey,
            currentClaude.config.baseUrl,
            next
          );
        } else {
          await providersApi.createClaudeConfig(next);
        }
      } else {
        for (const item of raw.claude) {
          await providersApi.deleteClaudeConfig(item.config.apiKey, item.config.baseUrl);
        }
      }

      const currentOpenAI = raw.openai[0];
      if (openaiEntry) {
        const next = buildSponsorOpenAIConfig(
          openaiEntry,
          definition.providerName,
          definition.getProtocolUrls,
          currentOpenAI?.config
        );
        if (currentOpenAI) {
          await providersApi.updateOpenAIProvider(
            currentOpenAI.config.name,
            currentOpenAI.index,
            next
          );
        } else {
          await providersApi.createOpenAIProvider(next);
        }
      } else if (currentOpenAI) {
        await providersApi.deleteOpenAIProvider(currentOpenAI.index);
      }
    },
    [config]
  );

  const createProvider = useCallback(
    async (brand: ProviderBrand, input: ProviderEntryFormInput) => {
      setMutating(true);
      try {
        if (brand === 'gemini') {
          await providersApi.createGeminiKey(
            buildProviderKeyConfig('gemini', input) as GeminiKeyConfig
          );
        } else if (brand === 'interactions') {
          await providersApi.createInteractionsKey(
            buildProviderKeyConfig('interactions', input) as GeminiKeyConfig
          );
        } else if (brand === 'codex') {
          await providersApi.createCodexConfig(
            buildProviderKeyConfig('codex', input) as ProviderKeyConfig
          );
        } else if (brand === 'xai') {
          await providersApi.createXAIConfig(
            buildProviderKeyConfig('xai', input) as ProviderKeyConfig
          );
        } else if (brand === 'claude') {
          await providersApi.createClaudeConfig(
            buildProviderKeyConfig('claude', input) as ProviderKeyConfig
          );
        } else if (brand === 'vertex') {
          await providersApi.createVertexConfig(
            buildProviderKeyConfig('vertex', input) as ProviderKeyConfig
          );
        } else if (brand === 'openaiCompatibility') {
          await providersApi.createOpenAIProvider(buildOpenAIConfig(input));
        } else if (brand === 'commandcode') {
          await pluginsApi.patchConfig(COMMANDCODE_PLUGIN_ID, buildCommandCodeConfig(input));
        } else if (
          brand === 'apikeyFun' ||
          brand === 'fennoAI' ||
          brand === 'qiniuCloud' ||
          brand === 'kimi'
        ) {
          await runSponsorMutationWithRecovery(() => persistSponsorConfig(brand, input), refetch);
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [persistSponsorConfig, refetch]
  );

  const updateProvider = useCallback(
    async (resource: ProviderResource, input: ProviderEntryFormInput) => {
      setMutating(true);
      try {
        const brand = resource.brand;
        const selector = resource.selector;
        if (brand === 'gemini' && selector.brand === 'gemini') {
          const existing = resource.raw as GeminiKeyConfig;
          await providersApi.updateGeminiKey(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig('gemini', input, existing) as GeminiKeyConfig
          );
        } else if (brand === 'interactions' && selector.brand === 'interactions') {
          const existing = resource.raw as GeminiKeyConfig;
          await providersApi.updateInteractionsKey(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig('interactions', input, existing) as GeminiKeyConfig
          );
        } else if (brand === 'codex' && selector.brand === 'codex') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateCodexConfig(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig('codex', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'xai' && selector.brand === 'xai') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateXAIConfig(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig('xai', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'claude' && selector.brand === 'claude') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateClaudeConfig(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig('claude', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'vertex' && selector.brand === 'vertex') {
          const existing = resource.raw as ProviderKeyConfig;
          await providersApi.updateVertexConfig(
            selector.apiKey,
            selector.baseUrl,
            buildProviderKeyConfig('vertex', input, existing) as ProviderKeyConfig
          );
        } else if (brand === 'openaiCompatibility' && selector.brand === 'openaiCompatibility') {
          await providersApi.updateOpenAIProvider(
            selector.name,
            selector.index,
            buildOpenAIConfig(input, resource.raw as OpenAIProviderConfig)
          );
        } else if (brand === 'commandcode' && selector.brand === 'commandcode') {
          await pluginsApi.patchConfig(
            COMMANDCODE_PLUGIN_ID,
            buildCommandCodeConfig(input, resource.raw as CommandCodePluginConfig)
          );
        } else if (
          brand === 'apikeyFun' ||
          brand === 'fennoAI' ||
          brand === 'qiniuCloud' ||
          brand === 'kimi'
        ) {
          await runSponsorMutationWithRecovery(() => persistSponsorConfig(brand, input), refetch);
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [persistSponsorConfig, refetch]
  );

  const deleteProvider = useCallback(
    async (resource: ProviderResource) => {
      setMutating(true);
      try {
        const sel = resource.selector;
        if (sel.brand === 'gemini') {
          await providersApi.deleteGeminiKey(sel.apiKey, sel.baseUrl);
          const next = (config?.geminiApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('gemini-api-key', next);
        } else if (sel.brand === 'interactions') {
          await providersApi.deleteInteractionsKey(sel.apiKey, sel.baseUrl);
          const next = (config?.interactionsApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('interactions-api-key', next);
        } else if (sel.brand === 'codex') {
          await providersApi.deleteCodexConfig(sel.apiKey, sel.baseUrl);
          const next = (config?.codexApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('codex-api-key', next);
        } else if (sel.brand === 'xai') {
          await providersApi.deleteXAIConfig(sel.apiKey, sel.baseUrl);
          const next = (config?.xaiApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('xai-api-key', next);
        } else if (sel.brand === 'claude') {
          await providersApi.deleteClaudeConfig(sel.apiKey, sel.baseUrl);
          const next = (config?.claudeApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('claude-api-key', next);
        } else if (sel.brand === 'vertex') {
          await providersApi.deleteVertexConfig(sel.apiKey, sel.baseUrl);
          const next = (config?.vertexApiKeys ?? []).filter((_, i) => i !== sel.index);
          updateConfigValue('vertex-api-key', next);
        } else if (sel.brand === 'openaiCompatibility') {
          await providersApi.deleteOpenAIProvider(sel.index);
          const next = (config?.openaiCompatibility ?? []).filter(
            (item, index) => (item.sourceIndex ?? index) !== sel.index
          );
          updateConfigValue('openai-compatibility', next);
        } else if (sel.brand === 'commandcode') {
          await pluginsApi.patchConfig(COMMANDCODE_PLUGIN_ID, { enabled: false });
        } else if (
          sel.brand === 'apikeyFun' ||
          sel.brand === 'fennoAI' ||
          sel.brand === 'qiniuCloud' ||
          sel.brand === 'kimi'
        ) {
          await runSponsorMutationWithRecovery(async () => {
            const raw = resource.raw as SponsorProviderRaw;
            for (const item of raw.gemini) {
              await providersApi.deleteGeminiKey(item.config.apiKey, item.config.baseUrl);
            }
            for (const item of raw.codex) {
              await providersApi.deleteCodexConfig(item.config.apiKey, item.config.baseUrl);
            }
            for (const item of raw.claude) {
              await providersApi.deleteClaudeConfig(item.config.apiKey, item.config.baseUrl);
            }
            const openAIIndices = raw.openai
              .map((item) => item.index)
              .sort((left, right) => right - left);
            for (const index of openAIIndices) {
              await providersApi.deleteOpenAIProvider(index);
            }
          }, refetch);
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [config, refetch, updateConfigValue]
  );

  const toggleDisabled = useCallback(
    async (resource: ProviderResource, disabled: boolean) => {
      setMutating(true);
      try {
        const brand = resource.brand;
        const selector = resource.selector;
        if (brand === 'gemini' && selector.brand === 'gemini') {
          const current = resource.raw as GeminiKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          await providersApi.updateGeminiKey(selector.apiKey, selector.baseUrl, {
            ...current,
            excludedModels: excluded,
          });
        } else if (brand === 'interactions' && selector.brand === 'interactions') {
          const current = resource.raw as GeminiKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          await providersApi.updateInteractionsKey(selector.apiKey, selector.baseUrl, {
            ...current,
            excludedModels: excluded,
          });
        } else if (
          (brand === 'codex' && selector.brand === 'codex') ||
          (brand === 'xai' && selector.brand === 'xai') ||
          (brand === 'claude' && selector.brand === 'claude') ||
          (brand === 'vertex' && selector.brand === 'vertex')
        ) {
          const current = resource.raw as ProviderKeyConfig;
          const excluded = disabled
            ? withDisableAllModelsRule(current.excludedModels)
            : withoutDisableAllModelsRule(current.excludedModels);
          const next = { ...current, excludedModels: excluded };
          if (selector.brand === 'codex') {
            await providersApi.updateCodexConfig(selector.apiKey, selector.baseUrl, next);
          } else if (selector.brand === 'xai') {
            await providersApi.updateXAIConfig(selector.apiKey, selector.baseUrl, next);
          } else if (selector.brand === 'claude') {
            await providersApi.updateClaudeConfig(selector.apiKey, selector.baseUrl, next);
          } else if (selector.brand === 'vertex') {
            await providersApi.updateVertexConfig(selector.apiKey, selector.baseUrl, next);
          }
        } else if (brand === 'openaiCompatibility' && selector.brand === 'openaiCompatibility') {
          await providersApi.updateOpenAIProviderDisabled(selector.index, disabled);
        } else if (brand === 'commandcode' && selector.brand === 'commandcode') {
          await pluginsApi.patchConfig(COMMANDCODE_PLUGIN_ID, { enabled: !disabled });
        } else if (
          brand === 'apikeyFun' ||
          brand === 'fennoAI' ||
          brand === 'qiniuCloud' ||
          brand === 'kimi'
        ) {
          await runSponsorMutationWithRecovery(
            () => toggleSponsorConfig(resource.raw as SponsorProviderRaw, disabled),
            refetch
          );
        }
        await refetch();
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  return {
    connected,
    isPending,
    isFetching,
    isError: Boolean(errorMessage),
    errorMessage,
    snapshot,
    refetch,
    createProvider,
    updateProvider,
    deleteProvider,
    toggleDisabled,
    mutating,
    refreshSnapshot,
  };
}
