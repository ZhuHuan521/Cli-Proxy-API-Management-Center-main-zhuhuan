import { describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import { runVisualConfig } from './helpers/visualConfig';

describe('visual config v8 compatibility', () => {
  test('projects v8 paths into the visual editor model', () => {
    const config = runVisualConfig(`config-version: 8
server:
  host: 127.0.0.1
  port: 8317
  commercial-mode: true
management:
  allow-remote: true
  secret-key: secret
access:
  api-keys: [client-a, client-b]
routing:
  retry:
    request-retry: 4
    max-retry-credentials: 2
  cooldown:
    disable-cooling: true
    transient-error-cooldown-seconds: 12
requests:
  proxy-url: http://proxy.example
  streaming:
    keepalive-seconds: 15
oauth:
  auth-dir: /tmp/auth
  providers:
    codex:
      response-steering: true
      disable-codex-cloaking: true
      stream-bootstrap-buffering: true
      stream-bootstrap-timeout: 20s
      optimize-multi-agent-v2: true
      orphan-delegation-compatibility: true
observability:
  logs:
    debug: true
multimedia:
  disable-image-generation: passthrough
`);

    expect(config.visualValues.host).toBe('127.0.0.1');
    expect(config.visualValues.port).toBe('8317');
    expect(config.visualValues.rmAllowRemote).toBe(true);
    expect(config.visualValues.rmSecretKey).toBe('secret');
    expect(config.visualValues.apiKeysText).toBe('client-a\nclient-b');
    expect(config.visualValues.requestRetry).toBe('4');
    expect(config.visualValues.maxRetryCredentials).toBe('2');
    expect(config.visualValues.disableCooling).toBe(true);
    expect(config.visualValues.transientErrorCooldownSeconds).toBe('12');
    expect(config.visualValues.proxyUrl).toBe('http://proxy.example');
    expect(config.visualValues.streaming.keepaliveSeconds).toBe('15');
    expect(config.visualValues.authDir).toBe('/tmp/auth');
    expect(config.visualValues.codexResponseSteering).toBe(true);
    expect(config.visualValues.codexDisableCloaking).toBe(true);
    expect(config.visualValues.codexStreamBootstrapBuffering).toBe(true);
    expect(config.visualValues.codexStreamBootstrapTimeout).toBe('20s');
    expect(config.visualValues.codexOptimizeMultiAgentV2).toBe(true);
    expect(config.visualValues.codexOrphanDelegationCompatibility).toBe(true);
    expect(config.visualValues.debug).toBe(true);
    expect(config.visualValues.disableImageGeneration).toBe('passthrough');
  });

  test('writes dirty values back to v8 paths without touching provider key groups', () => {
    const yaml = `config-version: 8
api-keys:
  codex:
    - name: official
      keys:
        - api-key: upstream-key
access:
  api-keys: [client-old]
oauth:
  providers:
    codex:
      identity-confuse: false
`;
    const config = runVisualConfig(yaml, [
      {
        apiKeysText: 'client-new',
        codexResponseSteering: true,
        codexDisableCloaking: true,
        codexOptimizeMultiAgentV2: true,
        codexOrphanDelegationCompatibility: true,
        codexStreamBootstrapTimeout: '20s',
      },
    ]);

    expect(parseYaml(config.applyVisualChangesToYaml(yaml))).toEqual({
      'config-version': 8,
      'api-keys': {
        codex: [{ name: 'official', keys: [{ 'api-key': 'upstream-key' }] }],
      },
      access: { 'api-keys': ['client-new'] },
      oauth: {
        providers: {
          codex: {
            'identity-confuse': false,
            'response-steering': true,
            'disable-codex-cloaking': true,
            'stream-bootstrap-timeout': '20s',
            'optimize-multi-agent-v2': true,
            'orphan-delegation-compatibility': true,
          },
        },
      },
    });
  });
});
