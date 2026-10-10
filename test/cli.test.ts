import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/cli.js';
import { formatTable } from '../src/output.js';
import { httpServer } from './server.js';

let base: string;
let stop: () => Promise<void>;
let dir: string;

beforeAll(async () => {
  const s = await httpServer();
  base = s.url;
  stop = s.close;
  dir = await mkdtemp(join(tmpdir(), 'upcheck-cli-'));
});
afterAll(async () => {
  await stop();
  await rm(dir, { recursive: true, force: true });
});

async function cli(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, { out: (t) => out.push(t), err: (t) => err.push(t), color: false });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('cli', () => {
  it('exits 0 when everything is up', async () => {
    const r = await cli(`${base}/ok`, `${base}/redirect`);
    expect(r.code).toBe(0);
    expect(r.out).toContain('all 2 up');
  });

  it('exits 1 when something is down', async () => {
    const r = await cli(`${base}/ok`, `${base}/broken`);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/down +http:\/\/127\.0\.0\.1:\d+\/broken +500/);
    expect(r.out).toContain('1 of 2 down');
  });

  it('prints JSON', async () => {
    const r = await cli(`${base}/ok`, '--json', '-k', 'good');
    const data = JSON.parse(r.out);
    expect(data.ok).toBe(true);
    expect(data.results[0]).toMatchObject({ status: 200, keywordFound: true, errors: [] });
  });

  it('passes flags through', async () => {
    expect((await cli(`${base}/teapot`, '-s', '418')).code).toBe(0);
    expect((await cli(`${base}/teapot`, '-s', '200', '-s', '418')).code).toBe(0);
    expect((await cli(`${base}/slow`, '-t', '50')).out).toContain('timed out');
  });

  it('reads a config file and lets flags override its defaults', async () => {
    const file = join(dir, 'upcheck.yml');
    await writeFile(
      file,
      `defaults:\n  keyword: missing\nchecks:\n  - name: home\n    url: ${base}/ok\n`,
    );
    const fromFile = await cli('-c', file);
    expect(fromFile.code).toBe(1);
    expect(fromFile.out).toMatch(/home .*keyword "missing" not found/);
    expect((await cli('-c', file, '-k', 'all good')).code).toBe(0);
  });

  it('exits 2 on usage errors', async () => {
    expect(await cli()).toMatchObject({ code: 2, err: expect.stringContaining('no URLs given') });
    expect((await cli('--bogus')).code).toBe(2);
    expect((await cli('x', '--timeout', 'soon')).code).toBe(2);
    expect((await cli('-c', join(dir, 'missing.yml'))).err).toMatch(/cannot read/);
  });

  it('prints help', async () => {
    const r = await cli('--help');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Usage: upcheck/);
  });
});

describe('formatTable', () => {
  it('aligns columns', () => {
    const out = formatTable([
      { name: 'a', url: 'a', ok: true, status: 200, ms: 12, tlsDaysLeft: 80, errors: [] },
      { name: 'longer-name', url: 'b', ok: false, errors: ['timed out'] },
    ]);
    expect(out).toBe(
      [
        '      TARGET       STATUS  TIME  TLS  NOTES',
        'up    a            200     12ms  80d',
        'down  longer-name  -       -     -    timed out',
        '',
        '1 of 2 down',
      ].join('\n'),
    );
  });
});
