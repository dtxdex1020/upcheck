import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, parseConfig } from '../src/config.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'upcheck-config-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('parseConfig', () => {
  it('accepts the full form', () => {
    const c = parseConfig({
      defaults: { timeout: 5000 },
      checks: [{ url: 'https://a.test', name: 'A', expectStatus: [200, 204], keyword: 'ok' }],
    });
    expect(c.defaults).toEqual({ timeout: 5000 });
    expect(c.checks[0]).toMatchObject({ name: 'A', expectStatus: [200, 204] });
  });

  it('accepts a list of URLs or objects', () => {
    expect(parseConfig(['https://a.test', { url: 'https://b.test' }]).checks).toEqual([
      { url: 'https://a.test' },
      { url: 'https://b.test' },
    ]);
  });

  it.each([
    [{}, /non-empty "checks"/],
    [{ checks: [] }, /non-empty "checks"/],
    [{ checks: [{ name: 'x' }] }, /checks\[0\]: url is required/],
    [{ checks: [{ url: 'x', tiemout: 5 }] }, /unknown field "tiemout"/],
    [{ checks: [{ url: 'x', method: 'POST' }] }, /GET or HEAD/],
    [{ checks: [{ url: 'x', expectStatus: '200' }] }, /expectStatus/],
    [{ checks: [{ url: 'x', timeout: -1 }] }, /timeout must be >= 0/],
    [{ checks: [{ url: 'x', headers: { a: 1 } }] }, /headers/],
    [{ checks: ['x'], extra: true }, /unknown top-level field "extra"/],
    [{ checks: ['x'], defaults: { url: 'y' } }, /per check/],
    [42, /object or a list/],
  ])('rejects %j', (input, error) => {
    expect(() => parseConfig(input)).toThrow(error);
  });
});

describe('loadConfig', () => {
  it('reads YAML', async () => {
    const file = join(dir, 'checks.yml');
    await writeFile(
      file,
      `defaults:\n  minTlsDays: 21\nchecks:\n  - https://a.test\n  - url: https://b.test/health\n    keyword: ok\n`,
    );
    expect(await loadConfig(file)).toEqual({
      defaults: { minTlsDays: 21 },
      checks: [{ url: 'https://a.test' }, { url: 'https://b.test/health', keyword: 'ok' }],
    });
  });

  it('reads JSON', async () => {
    const file = join(dir, 'checks.json');
    await writeFile(file, JSON.stringify({ checks: ['https://a.test'] }));
    expect((await loadConfig(file)).checks).toEqual([{ url: 'https://a.test' }]);
  });

  it('wraps read and parse errors', async () => {
    await expect(loadConfig(join(dir, 'missing.yml'))).rejects.toThrow(ConfigError);
    const bad = join(dir, 'bad.json');
    await writeFile(bad, '{nope');
    await expect(loadConfig(bad)).rejects.toThrow(/cannot parse/);
  });
});
