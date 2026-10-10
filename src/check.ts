import { getTlsInfo } from './tls.js';
import type { CheckDefaults, CheckResult, CheckTarget } from './types.js';

export const DEFAULTS = {
  method: 'GET',
  timeout: 10_000,
  minTlsDays: 7,
} as const satisfies CheckDefaults;

function message(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return 'timed out';
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    if (cause?.code) return `${err.message} (${cause.code})`;
    if (cause?.message) return `${err.message}: ${cause.message}`;
    return err.message;
  }
  return String(err);
}

function statusOk(status: number, expect: CheckTarget['expectStatus']): boolean {
  if (expect === undefined) return status >= 200 && status < 400;
  return (Array.isArray(expect) ? expect : [expect]).includes(status);
}

/** Runs one check. Never throws; problems end up in `errors`. */
export async function check(
  target: CheckTarget,
  defaults: CheckDefaults = {},
): Promise<CheckResult> {
  const t = { ...DEFAULTS, ...defaults, ...target };
  const result: CheckResult = { name: t.name ?? t.url, url: t.url, ok: false, errors: [] };

  let url: URL;
  try {
    url = new URL(t.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    result.errors.push('invalid URL');
    return result;
  }

  // A keyword needs the body, so HEAD is upgraded to GET in that case.
  const method = t.keyword ? 'GET' : t.method;
  const started = performance.now();
  const [http, tls] = await Promise.allSettled([
    (async () => {
      const res = await fetch(url, {
        method,
        headers: { 'user-agent': 'upcheck', ...t.headers },
        signal: AbortSignal.timeout(t.timeout),
      });
      const body = method === 'HEAD' ? '' : await res.text();
      return { status: res.status, body, ms: Math.round(performance.now() - started) };
    })(),
    url.protocol === 'https:'
      ? getTlsInfo(url.hostname.replace(/^\[|\]$/g, ''), Number(url.port) || 443, t.timeout)
      : Promise.resolve(undefined),
  ]);

  if (http.status === 'rejected') {
    result.errors.push(message(http.reason));
  } else {
    const { status, body, ms } = http.value;
    result.status = status;
    result.ms = ms;
    if (!statusOk(status, t.expectStatus)) result.errors.push(`unexpected status ${status}`);
    if (t.keyword) {
      result.keywordFound = body.includes(t.keyword);
      if (!result.keywordFound) result.errors.push(`keyword "${t.keyword}" not found`);
    }
  }

  if (tls.status === 'fulfilled' && tls.value) {
    result.tlsDaysLeft = tls.value.daysLeft;
    result.tlsValidTo = tls.value.validTo.toISOString();
    if (tls.value.daysLeft < t.minTlsDays) {
      result.errors.push(
        tls.value.daysLeft < 0
          ? 'certificate expired'
          : `certificate expires in ${tls.value.daysLeft} days`,
      );
    }
  } else if (tls.status === 'rejected' && http.status === 'fulfilled') {
    result.errors.push(`TLS: ${message(tls.reason)}`);
  }

  result.ok = result.errors.length === 0;
  return result;
}

/** Runs checks with limited concurrency, keeping input order. */
export async function checkAll(
  targets: CheckTarget[],
  defaults: CheckDefaults = {},
  concurrency = 5,
): Promise<CheckResult[]> {
  const results = new Array<CheckResult>(targets.length);
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const i = next++;
      results[i] = await check(targets[i]!, defaults);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, targets.length)) }, worker),
  );
  return results;
}
