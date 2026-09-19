import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);

const isBlockedIp = (address: string): boolean => {
  if (net.isIPv4(address)) {
    return address === '0.0.0.0' || address.startsWith('10.') || address.startsWith('127.') || address.startsWith('169.254.') || address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return true;
};

export const validateHttpsOutboundUrl = async (value: string, allowedHosts: ReadonlySet<string>): Promise<URL> => {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || BLOCKED_HOSTS.has(hostname)) {
    throw new Error('Outbound URL is not allowed');
  }
  if (net.isIP(hostname) ? isBlockedIp(hostname) : !allowedHosts.has(hostname)) throw new Error('Outbound URL host is not allowlisted');
  const resolved = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true });
  if (resolved.some((entry) => isBlockedIp(entry.address))) throw new Error('Outbound URL resolves to a restricted address');
  parsed.hostname = hostname;
  return parsed;
};

export const configuredHttpsHosts = (name: string, defaults: readonly string[]): ReadonlySet<string> => {
  const values = String(process.env[name] || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return new Set(values.length ? values : defaults);
};
