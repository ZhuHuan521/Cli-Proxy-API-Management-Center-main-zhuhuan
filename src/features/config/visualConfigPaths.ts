import { isMap, isSeq } from 'yaml';

export type VisualConfigPath = Array<string | number>;

export interface VisualConfigPathMapping {
  field: string;
  legacy: VisualConfigPath;
  v8: VisualConfigPath;
  /** api-keys is structural in v8 and must be written directly by the caller. */
  special?: boolean;
}

interface PathDocument {
  getIn(path: VisualConfigPath, keepScalar?: boolean): unknown;
  setIn(path: VisualConfigPath, value: unknown): void;
  hasIn(path: VisualConfigPath): boolean;
  deleteIn(path: VisualConfigPath): boolean;
}

const mapping = (
  field: string,
  legacy: VisualConfigPath,
  v8: VisualConfigPath,
  special = false
): VisualConfigPathMapping => ({ field, legacy, v8, special });

/** Fields rendered by the visual editor whose v8 spelling differs from the legacy layout. */
export const VISUAL_CONFIG_PATH_MAPPINGS: VisualConfigPathMapping[] = [
  mapping('host', ['host'], ['server', 'host']),
  mapping('port', ['port'], ['server', 'port']),
  mapping('tlsEnable', ['tls', 'enable'], ['server', 'tls', 'enable']),
  mapping('tlsCert', ['tls', 'cert'], ['server', 'tls', 'cert']),
  mapping('tlsKey', ['tls', 'key'], ['server', 'tls', 'key']),
  mapping('commercialMode', ['commercial-mode'], ['server', 'commercial-mode']),
  mapping('rmAllowRemote', ['remote-management', 'allow-remote'], ['management', 'allow-remote']),
  mapping('rmSecretKey', ['remote-management', 'secret-key'], ['management', 'secret-key']),
  mapping(
    'rmDisableControlPanel',
    ['remote-management', 'disable-control-panel'],
    ['management', 'disable-control-panel']
  ),
  mapping(
    'rmDisableAutoUpdatePanel',
    ['remote-management', 'disable-auto-update-panel'],
    ['management', 'disable-auto-update-panel']
  ),
  mapping(
    'rmPanelRepo',
    ['remote-management', 'panel-github-repository'],
    ['management', 'panel-github-repository']
  ),
  mapping('apiKeysText', ['api-keys'], ['access', 'api-keys'], true),
  mapping('authDir', ['auth-dir'], ['oauth', 'auth-dir']),
  mapping('authAutoRefreshWorkers', ['auth-auto-refresh-workers'], ['oauth', 'auth-auto-refresh-workers']),
  mapping('proxyUrl', ['proxy-url'], ['requests', 'proxy-url']),
  mapping('passthroughHeaders', ['passthrough-headers'], ['requests', 'passthrough-headers']),
  mapping(
    'streaming.nonstreamKeepaliveInterval',
    ['nonstream-keepalive-interval'],
    ['requests', 'nonstream-keepalive-interval']
  ),
  mapping('requestRetry', ['request-retry'], ['routing', 'retry', 'request-retry']),
  mapping(
    'maxRetryCredentials',
    ['max-retry-credentials'],
    ['routing', 'retry', 'max-retry-credentials']
  ),
  mapping('maxRetryInterval', ['max-retry-interval'], ['routing', 'retry', 'max-retry-interval']),
  mapping('disableCooling', ['disable-cooling'], ['routing', 'cooldown', 'disable-cooling']),
  mapping(
    'transientErrorCooldownSeconds',
    ['transient-error-cooldown-seconds'],
    ['routing', 'cooldown', 'transient-error-cooldown-seconds']
  ),
  mapping('debug', ['debug'], ['observability', 'logs', 'debug']),
  mapping('loggingToFile', ['logging-to-file'], ['observability', 'logs', 'logging-to-file']),
  mapping(
    'logsMaxTotalSizeMb',
    ['logs-max-total-size-mb'],
    ['observability', 'logs', 'logs-max-total-size-mb']
  ),
  mapping(
    'errorLogsMaxFiles',
    ['error-logs-max-files'],
    ['observability', 'logs', 'error-logs-max-files']
  ),
  mapping(
    'usageStatisticsEnabled',
    ['usage-statistics-enabled'],
    ['observability', 'usage', 'usage-statistics-enabled']
  ),
  mapping(
    'redisUsageQueueRetentionSeconds',
    ['redis-usage-queue-retention-seconds'],
    ['observability', 'usage', 'redis-usage-queue-retention-seconds']
  ),
  mapping(
    'disableImageGeneration',
    ['disable-image-generation'],
    ['multimedia', 'disable-image-generation']
  ),
  mapping('gptImage2BaseModel', ['gpt-image-2-base-model'], ['multimedia', 'gpt-image-2-base-model']),
  mapping('wsAuth', ['ws-auth'], ['oauth', 'providers', 'aistudio', 'ws-auth']),
  mapping(
    'antigravitySensitiveWords',
    ['antigravity', 'sensitive-words'],
    ['oauth', 'providers', 'antigravity', 'sensitive-words']
  ),
  mapping(
    'antigravitySignatureCacheEnabled',
    ['antigravity-signature-cache-enabled'],
    ['oauth', 'providers', 'antigravity', 'signature-cache-enabled']
  ),
  mapping(
    'antigravitySignatureBypassStrict',
    ['antigravity-signature-bypass-strict'],
    ['oauth', 'providers', 'antigravity', 'signature-bypass-strict']
  ),
  mapping(
    'quotaAntigravityCredits',
    ['quota-exceeded', 'antigravity-credits'],
    ['oauth', 'providers', 'antigravity', 'antigravity-credits']
  ),
  mapping(
    'devinSensitiveWords',
    ['devin', 'sensitive-words'],
    ['oauth', 'providers', 'devin', 'sensitive-words']
  ),
  mapping(
    'claudeHeaderUserAgent',
    ['claude-header-defaults', 'user-agent'],
    ['oauth', 'providers', 'claude', 'header-defaults', 'user-agent']
  ),
  mapping(
    'claudeHeaderPackageVersion',
    ['claude-header-defaults', 'package-version'],
    ['oauth', 'providers', 'claude', 'header-defaults', 'package-version']
  ),
  mapping(
    'claudeHeaderRuntimeVersion',
    ['claude-header-defaults', 'runtime-version'],
    ['oauth', 'providers', 'claude', 'header-defaults', 'runtime-version']
  ),
  mapping(
    'claudeHeaderOs',
    ['claude-header-defaults', 'os'],
    ['oauth', 'providers', 'claude', 'header-defaults', 'os']
  ),
  mapping(
    'claudeHeaderArch',
    ['claude-header-defaults', 'arch'],
    ['oauth', 'providers', 'claude', 'header-defaults', 'arch']
  ),
  mapping(
    'claudeHeaderTimeout',
    ['claude-header-defaults', 'timeout'],
    ['oauth', 'providers', 'claude', 'header-defaults', 'timeout']
  ),
  mapping(
    'claudeHeaderStabilizeDeviceProfile',
    ['claude-header-defaults', 'stabilize-device-profile'],
    ['oauth', 'providers', 'claude', 'header-defaults', 'stabilize-device-profile']
  ),
  mapping(
    'codexHeaderUserAgent',
    ['codex-header-defaults', 'user-agent'],
    ['oauth', 'providers', 'codex', 'header-defaults', 'user-agent']
  ),
  mapping(
    'codexHeaderBetaFeatures',
    ['codex-header-defaults', 'beta-features'],
    ['oauth', 'providers', 'codex', 'header-defaults', 'beta-features']
  ),
  mapping('codexIdentityConfuse', ['codex', 'identity-confuse'], ['oauth', 'providers', 'codex', 'identity-confuse']),
  mapping('codexResponseSteering', ['codex', 'response-steering'], ['oauth', 'providers', 'codex', 'response-steering']),
  mapping(
    'codexDisableCloaking',
    ['codex', 'disable-codex-cloaking'],
    ['oauth', 'providers', 'codex', 'disable-codex-cloaking']
  ),
  mapping(
    'codexStreamBootstrapBuffering',
    ['codex', 'stream-bootstrap-buffering'],
    ['oauth', 'providers', 'codex', 'stream-bootstrap-buffering']
  ),
  mapping(
    'codexStreamBootstrapTimeout',
    ['codex', 'stream-bootstrap-timeout'],
    ['oauth', 'providers', 'codex', 'stream-bootstrap-timeout']
  ),
  mapping(
    'codexOptimizeMultiAgentV2',
    ['codex', 'optimize-multi-agent-v2'],
    ['oauth', 'providers', 'codex', 'optimize-multi-agent-v2']
  ),
  mapping(
    'codexOrphanDelegationCompatibility',
    ['codex', 'orphan-delegation-compatibility'],
    ['oauth', 'providers', 'codex', 'orphan-delegation-compatibility']
  ),
  mapping('streaming.keepaliveSeconds', ['streaming', 'keepalive-seconds'], ['requests', 'streaming', 'keepalive-seconds']),
  mapping('streaming.bootstrapRetries', ['streaming', 'bootstrap-retries'], ['requests', 'streaming', 'bootstrap-retries']),
  mapping('payloadDefaultRules', ['payload', 'default'], ['requests', 'payload', 'default']),
  mapping('payloadDefaultRawRules', ['payload', 'default-raw'], ['requests', 'payload', 'default-raw']),
  mapping('payloadOverrideRules', ['payload', 'override'], ['requests', 'payload', 'override']),
  mapping('payloadOverrideRawRules', ['payload', 'override-raw'], ['requests', 'payload', 'override-raw']),
  mapping('payloadFilterRules', ['payload', 'filter'], ['requests', 'payload', 'filter']),
];

const clonePlain = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const getRecordPath = (root: Record<string, unknown>, path: VisualConfigPath): unknown => {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[String(segment)];
  }
  return current;
};

const setRecordPath = (
  root: Record<string, unknown>,
  path: VisualConfigPath,
  value: unknown
): void => {
  if (!path.length) return;
  let current: Record<string, unknown> = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = String(path[index]);
    const next = current[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[String(path[path.length - 1])] = value;
};

export const isVisualConfigV8 = (parsed: Record<string, unknown>): boolean =>
  Number(parsed['config-version']) === 8;

/**
 * The visual editor has a stable legacy-shaped value model. Project v8 leaves
 * into that model so every existing control reads the same values.
 */
export function projectV8ConfigForVisual(
  parsed: Record<string, unknown>
): Record<string, unknown> {
  if (!isVisualConfigV8(parsed)) return parsed;
  const projected = clonePlain(parsed);
  VISUAL_CONFIG_PATH_MAPPINGS.forEach(({ legacy, v8 }) => {
    const value = getRecordPath(parsed, v8);
    if (value !== undefined) setRecordPath(projected, legacy, value);
  });
  return projected;
}

const deleteEmptyContainer = (doc: PathDocument, path: VisualConfigPath): void => {
  if (!doc.hasIn(path)) return;
  const value = doc.getIn(path, true);
  if (!isMap(value) && !isSeq(value)) return;
  if ((value as { items?: unknown[] }).items?.length === 0) doc.deleteIn(path);
};

/**
 * Apply visual edits to a v8 document. Existing editor code writes legacy
 * leaves first; this function moves only dirty leaves to their v8 path and
 * removes the temporary legacy spelling.
 */
export function migrateVisualDirtyFieldsToV8(
  doc: PathDocument,
  dirtyFields: ReadonlySet<string>
): void {
  const sourceParents = new Set<string>();
  VISUAL_CONFIG_PATH_MAPPINGS.forEach((entry) => {
    if (entry.special || !dirtyFields.has(entry.field)) return;
    const source = entry.legacy;
    const target = entry.v8;
    if (source.join('\u0000') === target.join('\u0000')) return;

    if (doc.hasIn(source)) {
      doc.setIn(target, doc.getIn(source, true));
    } else {
      doc.deleteIn(target);
    }
    doc.deleteIn(source);

    for (let index = source.length - 1; index > 0; index -= 1) {
      sourceParents.add(JSON.stringify(source.slice(0, index)));
    }
  });

  [...sourceParents]
    .map((raw) => JSON.parse(raw) as VisualConfigPath)
    .sort((left, right) => right.length - left.length)
    .forEach((path) => deleteEmptyContainer(doc, path));
}
