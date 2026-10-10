import { createColors } from 'picocolors';
import type { CheckResult } from './types.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
const width = (s: string) => s.replace(ANSI, '').length;
const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - width(s)));

export function formatTable(results: CheckResult[], color = false): string {
  const c = createColors(color);
  const header = ['', 'TARGET', 'STATUS', 'TIME', 'TLS', 'NOTES'].map((h) => c.dim(h));
  const rows = results.map((r) => {
    const ms = r.ms === undefined ? '-' : `${r.ms}ms`;
    const tls = r.tlsDaysLeft === undefined ? '-' : `${r.tlsDaysLeft}d`;
    return [
      r.ok ? c.green('up') : c.red('down'),
      r.name,
      r.status === undefined ? '-' : r.ok ? String(r.status) : c.red(String(r.status)),
      r.ms !== undefined && r.ms > 2000 ? c.yellow(ms) : ms,
      r.tlsDaysLeft !== undefined && r.tlsDaysLeft < 14 ? c.yellow(tls) : tls,
      r.errors.length ? c.red(r.errors.join('; ')) : r.keywordFound ? c.dim('keyword ok') : '',
    ];
  });
  const all = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...all.map((row) => width(row[i]!))));
  const lines = all.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : pad(cell, widths[i]!)))
      .join('  ')
      .trimEnd(),
  );
  const down = results.filter((r) => !r.ok).length;
  const summary = down
    ? c.red(`${down} of ${results.length} down`)
    : c.green(`all ${results.length} up`);
  return `${lines.join('\n')}\n\n${summary}`;
}

export function formatJson(results: CheckResult[]): string {
  return JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2);
}
