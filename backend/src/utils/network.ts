import dns from "node:dns/promises";
import net from "node:net";

const FORBIDDEN_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal"
]);

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number.parseInt(part, 10), 0);
}

function isIpv4InCidr(ip: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(network) & mask);
}

function isForbiddenIpv4(ip: string): boolean {
  return [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15]
  ].some(([network, prefix]) => isIpv4InCidr(ip, String(network), Number(prefix)));
}

function expandIpv6(ip: string): string[] {
  const normalized = ip.toLowerCase();
  if (!normalized.includes("::")) {
    return normalized.split(":");
  }

  const [left, right] = normalized.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const missing = 8 - (leftParts.length + rightParts.length);
  return [...leftParts, ...Array.from({ length: missing }, () => "0"), ...rightParts].map((part) => part || "0");
}

function isForbiddenIpv6(ip: string): boolean {
  const normalized = normalizeHost(ip);

  if (normalized === "::1" || normalized === "::") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return net.isIP(mapped) === 4 ? isForbiddenIpv4(mapped) : false;
  }

  const parts = expandIpv6(normalized);
  const first = Number.parseInt(parts[0], 16);

  if ((first & 0xfe00) === 0xfc00) {
    return true;
  }

  if ((first & 0xffc0) === 0xfe80) {
    return true;
  }

  // ff00::/8 multicast
  if ((first & 0xff00) === 0xff00) {
    return true;
  }

  return false;
}

/** Decimal, hex, octal, and shortened numeric hosts are not DNS names. */
export function isNonDnsHostForm(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    return host.split(".").some((part) => part.length > 1 && part.startsWith("0"));
  }
  if (ipVersion === 6) {
    return false;
  }

  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return true;
  }

  return /^[\d.]+$/.test(host);
}

export function isForbiddenIpAddress(host: string): boolean {
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    return isForbiddenIpv4(host);
  }
  if (ipVersion === 6) {
    return isForbiddenIpv6(host);
  }
  return false;
}

export function isForbiddenHostname(hostname: string): boolean {
  const normalized = normalizeHost(hostname);
  return (
    FORBIDDEN_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".internal")
  );
}

export type SafeTarget = { ok: true; address: string; family: 4 | 6 };

export async function assertSafeTargetUrl(targetUrl: string): Promise<SafeTarget | { ok: false; message: string }> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { ok: false, message: "Target URL must be a valid absolute URL" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, message: "Target URL must use http or https" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, message: "Target URL must not include embedded credentials" };
  }

  const hostname = normalizeHost(parsed.hostname);
  if (!hostname) {
    return { ok: false, message: "Target URL hostname is required" };
  }

  if (isNonDnsHostForm(hostname) || isForbiddenHostname(hostname) || isForbiddenIpAddress(hostname)) {
    return { ok: false, message: "Target URL points to a forbidden private or local address" };
  }

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) {
      return { ok: false, message: "Target URL hostname could not be resolved" };
    }
    if (records.some((record: { address: string }) => isForbiddenIpAddress(record.address))) {
      return { ok: false, message: "Target URL resolves to a forbidden private or local address" };
    }
    const chosen = records[0];
    const family = chosen.family === 6 ? 6 : 4;
    return { ok: true, address: chosen.address, family };
  } catch {
    return { ok: false, message: "Target URL hostname could not be resolved safely" };
  }
}
