import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttp, type RequestListener, type Server } from 'node:http';
import { createServer as createHttps } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const routes: RequestListener = (req, res) => {
  const path = req.url ?? '/';
  if (path === '/ok') return res.end('<h1>all good</h1>');
  if (path === '/slow') return void setTimeout(() => res.end('late'), 500);
  if (path === '/redirect') return res.writeHead(302, { location: '/ok' }).end();
  if (path === '/teapot') return res.writeHead(418).end('short and stout');
  if (path === '/headers') return res.end(JSON.stringify(req.headers));
  if (path === '/method') return res.end(req.method);
  res.writeHead(500).end('boom');
};

export async function start(
  server: Server,
  proto: 'http' | 'https' = 'http',
): Promise<{ url: string; close: () => Promise<void> }> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `${proto}://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const httpServer = () => start(createHttp(routes));

/** Self-signed HTTPS server with a certificate valid for `days` days. Needs openssl on PATH. */
export function httpsServer(days: number) {
  const dir = mkdtempSync(join(tmpdir(), 'upcheck-'));
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=localhost',
        '-days',
        String(days),
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    const key = readFileSync(join(dir, 'key.pem'));
    const cert = readFileSync(join(dir, 'cert.pem'));
    return start(createHttps({ key, cert }, routes), 'https');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function hasOpenssl() {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
