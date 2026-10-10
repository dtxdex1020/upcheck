import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { check, checkAll } from '../src/check.js';
import { daysUntil, getTlsInfo } from '../src/tls.js';
import { hasOpenssl, httpServer, httpsServer } from './server.js';

let base: string;
let stop: () => Promise<void>;

beforeAll(async () => {
  const s = await httpServer();
  base = s.url;
  stop = s.close;
});
afterAll(() => stop());

describe('check', () => {
  it('passes for a 200 and records timing', async () => {
    const r = await check({ url: `${base}/ok` });
    expect(r).toMatchObject({ ok: true, status: 200, errors: [], name: `${base}/ok` });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(r.tlsDaysLeft).toBeUndefined();
  });

  it('follows redirects', async () => {
    expect(await check({ url: `${base}/redirect` })).toMatchObject({ ok: true, status: 200 });
  });

  it('fails on 5xx and on unexpected codes', async () => {
    expect(await check({ url: `${base}/nope` })).toMatchObject({
      ok: false,
      status: 500,
      errors: ['unexpected status 500'],
    });
    expect((await check({ url: `${base}/ok`, expectStatus: 201 })).errors).toEqual([
      'unexpected status 200',
    ]);
  });

  it('accepts listed status codes', async () => {
    expect((await check({ url: `${base}/teapot`, expectStatus: [200, 418] })).ok).toBe(true);
  });

  it('matches keywords', async () => {
    expect(await check({ url: `${base}/ok`, keyword: 'all good' })).toMatchObject({
      ok: true,
      keywordFound: true,
    });
    expect(await check({ url: `${base}/ok`, keyword: 'nope' })).toMatchObject({
      ok: false,
      keywordFound: false,
      errors: ['keyword "nope" not found'],
    });
  });

  it('uses HEAD unless a keyword needs the body', async () => {
    expect((await check({ url: `${base}/method`, method: 'HEAD' })).ok).toBe(true);
    const r = await check({ url: `${base}/method`, method: 'HEAD', keyword: 'GET' });
    expect(r.keywordFound).toBe(true);
  });

  it('sends custom headers', async () => {
    const r = await check({
      url: `${base}/headers`,
      headers: { 'x-token': 'abc' },
      keyword: '"x-token":"abc"',
    });
    expect(r.ok).toBe(true);
  });

  it('times out', async () => {
    expect(await check({ url: `${base}/slow`, timeout: 100 })).toMatchObject({
      ok: false,
      errors: ['timed out'],
    });
  });

  it('reports connection errors', async () => {
    const r = await check({ url: 'http://127.0.0.1:9' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/fetch failed/);
  });

  it('rejects invalid URLs', async () => {
    expect((await check({ url: 'ftp://example.com' })).errors).toEqual(['invalid URL']);
    expect((await check({ url: 'not a url' })).errors).toEqual(['invalid URL']);
  });

  it('merges defaults under per-check settings', async () => {
    const r = await check({ url: `${base}/ok`, name: 'home' }, { keyword: 'missing' });
    expect(r).toMatchObject({ name: 'home', ok: false });
  });
});

describe('checkAll', () => {
  it('keeps input order and respects concurrency', async () => {
    const urls = ['/ok', '/nope', '/teapot', '/ok', '/redirect'].map((p) => ({ url: base + p }));
    const results = await checkAll(urls, {}, 2);
    expect(results.map((r) => r.status)).toEqual([200, 500, 418, 200, 200]);
  });
});

describe('daysUntil', () => {
  it('counts whole days', () => {
    const now = new Date('2026-10-09T00:00:00Z');
    expect(daysUntil(new Date('2026-10-19T12:00:00Z'), now)).toBe(10);
    expect(daysUntil(new Date('2026-10-08T12:00:00Z'), now)).toBe(-1);
  });
});

describe.runIf(hasOpenssl())('TLS', () => {
  it('reads the certificate expiry', async () => {
    const s = await httpsServer(30);
    try {
      const port = Number(new URL(s.url).port);
      const info = await getTlsInfo('127.0.0.1', port);
      expect(info.daysLeft).toBeGreaterThanOrEqual(29);
      expect(info.daysLeft).toBeLessThanOrEqual(30);
    } finally {
      await s.close();
    }
  });

  it('reports the days left and flags certificates close to expiry', async () => {
    const s = await httpsServer(3);
    try {
      // The self-signed cert is not trusted, so the request itself fails too.
      const r = await check({ url: `${s.url}/ok`, minTlsDays: 14 });
      expect(r.ok).toBe(false);
      expect(r.tlsDaysLeft).toBeGreaterThanOrEqual(2);
      expect(r.errors).toContain(`certificate expires in ${r.tlsDaysLeft} days`);
    } finally {
      await s.close();
    }
  });
});
