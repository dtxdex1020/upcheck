import { connect } from 'node:tls';

export interface TlsInfo {
  validTo: Date;
  daysLeft: number;
}

const DAY = 86_400_000;

export function daysUntil(date: Date, now = new Date()): number {
  return Math.floor((date.getTime() - now.getTime()) / DAY);
}

/**
 * Reads the leaf certificate for host:port. Trust is checked by the HTTP request itself,
 * so this only cares about the dates and accepts any certificate.
 */
export function getTlsInfo(host: string, port = 443, timeout = 10_000): Promise<TlsInfo> {
  return new Promise((resolve, reject) => {
    const servername = /^[\d.]+$|:/.test(host) ? undefined : host;
    const socket = connect({ host, port, servername, rejectUnauthorized: false });
    socket.setTimeout(timeout, () => socket.destroy(new Error('TLS handshake timed out')));
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) return reject(new Error('No certificate presented'));
      const validTo = new Date(cert.valid_to);
      resolve({ validTo, daysLeft: daysUntil(validTo) });
    });
    socket.once('error', reject);
  });
}
