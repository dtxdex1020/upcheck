#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { checkAll } from './check.js';
import { ConfigError, loadConfig } from './config.js';
import { formatJson, formatTable } from './output.js';
import type { CheckDefaults, CheckTarget } from './types.js';

const HELP = `Usage: upcheck [urls...] [options]

Check that URLs are up. Exits 1 if any check fails, 2 on bad usage.

Options:
  -c, --config <file>     JSON or YAML config with a list of checks
  -k, --keyword <text>    text that must appear in each response body
  -s, --status <code>     expected status code (repeatable), default any 2xx/3xx
  -t, --timeout <ms>      request timeout, default 10000
      --min-tls-days <n>  fail if a certificate expires sooner, default 7
      --head              use HEAD instead of GET
      --concurrency <n>   checks to run at once, default 5
      --json              print JSON instead of a table
      --no-color          disable colors
  -h, --help              show this help
  -v, --version           show the version`;

export interface CliIO {
  out: (text: string) => void;
  err: (text: string) => void;
  color: boolean;
}

const defaultIO: CliIO = {
  out: (t) => process.stdout.write(`${t}\n`),
  err: (t) => process.stderr.write(`${t}\n`),
  color: pc.isColorSupported,
};

class UsageError extends Error {}

function num(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`${flag} expects a non-negative number`);
  return n;
}

/** Runs the CLI and resolves to the exit code. */
export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        config: { type: 'string', short: 'c' },
        keyword: { type: 'string', short: 'k' },
        status: { type: 'string', short: 's', multiple: true },
        timeout: { type: 'string', short: 't' },
        'min-tls-days': { type: 'string' },
        head: { type: 'boolean' },
        concurrency: { type: 'string' },
        json: { type: 'boolean' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });

    if (values.help) return (io.out(HELP), 0);
    if (values.version) return (io.out('0.1.0'), 0);

    const flags: CheckDefaults = {};
    if (values.keyword) flags.keyword = values.keyword;
    if (values.status) {
      flags.expectStatus = values.status.map((s) => {
        const code = Number(s);
        if (!Number.isInteger(code)) throw new UsageError(`--status expects a number, got "${s}"`);
        return code;
      });
    }
    const timeout = num(values.timeout, '--timeout');
    if (timeout !== undefined) flags.timeout = timeout;
    const minTlsDays = num(values['min-tls-days'], '--min-tls-days');
    if (minTlsDays !== undefined) flags.minTlsDays = minTlsDays;
    if (values.head) flags.method = 'HEAD';

    let defaults: CheckDefaults = flags;
    let targets: CheckTarget[] = positionals.map((url) => ({ url }));
    if (values.config) {
      const config = await loadConfig(values.config);
      // Flags given on the command line win over the config file defaults.
      defaults = { ...config.defaults, ...flags };
      targets = [...config.checks, ...targets];
    }
    if (!targets.length) throw new UsageError('no URLs given. Pass URLs or --config <file>.');

    const concurrency = num(values.concurrency, '--concurrency') ?? 5;
    const results = await checkAll(targets, defaults, Math.max(1, Math.floor(concurrency)));
    const color = io.color && !values['no-color'] && !values.json;
    io.out(values.json ? formatJson(results) : formatTable(results, color));
    return results.every((r) => r.ok) ? 0 : 1;
  } catch (err) {
    if (
      err instanceof UsageError ||
      err instanceof ConfigError ||
      (err as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')
    ) {
      io.err(`upcheck: ${(err as Error).message}`);
      if (!(err instanceof ConfigError)) io.err('Run upcheck --help for usage.');
      return 2;
    }
    throw err;
  }
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  run(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (err: unknown) => {
      console.error(err);
      process.exitCode = 2;
    },
  );
}
