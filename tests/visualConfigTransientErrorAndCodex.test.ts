import { describe, expect, test } from 'bun:test';
import { parse as parseYaml } from 'yaml';
import { runVisualConfig } from './helpers/visualConfig';

describe('transient error cooldown and Codex behavior toggles', () => {
  test('loads transient cooldown and nested codex values from YAML', () => {
    const config = runVisualConfig(`transient-error-cooldown-seconds: 12
codex:
  identity-confuse: true
  stream-bootstrap-buffering: true
`);

    expect(config.visualValues.transientErrorCooldownSeconds).toBe('12');
    expect(config.visualValues.codexIdentityConfuse).toBe(true);
    expect(config.visualValues.codexStreamBootstrapBuffering).toBe(true);
    expect(config.visualDirty).toBe(false);
  });

  test('writes transient cooldown and nested codex toggles', () => {
    const yaml = 'port: 8317\n';
    const config = runVisualConfig(yaml, [
      {
        transientErrorCooldownSeconds: '-1',
        codexIdentityConfuse: true,
        codexStreamBootstrapBuffering: true,
      },
    ]);

    expect(parseYaml(config.applyVisualChangesToYaml(yaml))).toEqual({
      port: 8317,
      'transient-error-cooldown-seconds': -1,
      codex: {
        'identity-confuse': true,
        'stream-bootstrap-buffering': true,
      },
    });
  });

  test('writes false values while preserving unrelated codex keys', () => {
    const yaml = `transient-error-cooldown-seconds: 30
codex:
  identity-confuse: true
  stream-bootstrap-buffering: true
  optimize-multi-agent-v2: true
`;
    const config = runVisualConfig(yaml, [
      {
        transientErrorCooldownSeconds: '5',
        codexIdentityConfuse: false,
        codexStreamBootstrapBuffering: false,
      },
    ]);

    expect(parseYaml(config.applyVisualChangesToYaml(yaml))).toEqual({
      'transient-error-cooldown-seconds': 5,
      codex: {
        'identity-confuse': false,
        'stream-bootstrap-buffering': false,
        'optimize-multi-agent-v2': true,
      },
    });
  });

  test('rejects a non-integer transient cooldown', () => {
    const config = runVisualConfig(undefined, [
      { transientErrorCooldownSeconds: 'abc' },
    ]);

    expect(config.visualValidationErrors.transientErrorCooldownSeconds).toBe('integer');
  });
});
