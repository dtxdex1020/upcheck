import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CheckDefaults, CheckTarget } from './types.js';

export interface Config {
  defaults: CheckDefaults;
  checks: CheckTarget[];
}

export class ConfigError extends Error {}

const KNOWN = new Set([
  'url',
  'name',
  'method',
  'expectStatus',
  'keyword',
  'timeout',
  'minTlsDays',
  'headers',
]);

function fail(msg: string): never {
  throw new ConfigError(msg);
}

function validateFields(obj: Record<string, unknown>, where: string) {
  for (const key of Object.keys(obj)) {
    if (!KNOWN.has(key)) fail(`${where}: unknown field "${key}"`);
  }
  const { method, expectStatus, keyword, timeout, minTlsDays, headers, name } = obj;
  if (method !== undefined && method !== 'GET' && method !== 'HEAD') {
    fail(`${where}: method must be GET or HEAD`);
  }
  const codes = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
  if (expectStatus !== undefined && !codes.every((c) => Number.isInteger(c))) {
    fail(`${where}: expectStatus must be a number or a list of numbers`);
  }
  for (const [k, v] of Object.entries({ timeout, minTlsDays })) {
    if (v !== undefined && (typeof v !== 'number' || v < 0)) fail(`${where}: ${k} must be >= 0`);
  }
  for (const [k, v] of Object.entries({ keyword, name })) {
    if (v !== undefined && typeof v !== 'string') fail(`${where}: ${k} must be a string`);
  }
  if (
    headers !== undefined &&
    (typeof headers !== 'object' ||
      headers === null ||
      !Object.values(headers).every((v) => typeof v === 'string'))
  ) {
    fail(`${where}: headers must map names to strings`);
  }
}

/**
 * Accepts `{ defaults?, checks: [...] }`, a bare list of checks, or a list of URL strings.
 */
export function parseConfig(data: unknown): Config {
  const root = Array.isArray(data) ? { checks: data } : data;
  if (!root || typeof root !== 'object') fail('config must be an object or a list');
  const { defaults = {}, checks, ...rest } = root as Record<string, unknown>;
  const extra = Object.keys(rest);
  if (extra.length) fail(`unknown top-level field "${extra[0]}"`);
  if (!Array.isArray(checks) || !checks.length) fail('config needs a non-empty "checks" list');
  if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
    fail('"defaults" must be an object');
  }
  validateFields(defaults as Record<string, unknown>, 'defaults');
  if ('url' in defaults || 'name' in defaults) fail('defaults: url and name are per check');

  const parsed = checks.map((c, i) => {
    const target = typeof c === 'string' ? { url: c } : c;
    if (!target || typeof target !== 'object') fail(`checks[${i}]: expected a URL or an object`);
    const t = target as Record<string, unknown>;
    if (typeof t.url !== 'string' || !t.url) fail(`checks[${i}]: url is required`);
    validateFields(t, `checks[${i}]`);
    return t as unknown as CheckTarget;
  });
  return { defaults: defaults as CheckDefaults, checks: parsed };
}

export async function loadConfig(file: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    fail(`cannot read ${file}: ${(err as Error).message}`);
  }
  let data: unknown;
  try {
    data = extname(file).toLowerCase() === '.json' ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    fail(`cannot parse ${file}: ${(err as Error).message}`);
  }
  return parseConfig(data);
}
