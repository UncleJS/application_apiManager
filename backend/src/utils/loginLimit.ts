const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

type Bucket = { failures: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function loginAttemptKey(ip: string, username: string): string {
  return `${ip}\n${username.trim().toLowerCase()}`;
}

function normalizePeer(peer?: string): string {
  if (!peer) {
    return "";
  }
  return peer.startsWith("::ffff:") ? peer.slice(7) : peer;
}

function isLoopback(peer: string): boolean {
  return peer === "127.0.0.1" || peer === "::1";
}

/** Use the proxy-appended hop only when the peer is loopback. Ignore a client-supplied first hop. */
export function loginClientIp(peer: string | undefined, forwardedFor: string | undefined): string {
  const remote = normalizePeer(peer);
  if (isLoopback(remote) && forwardedFor) {
    const hops = forwardedFor.split(",").map((hop) => hop.trim()).filter(Boolean);
    const trustedHop = hops[hops.length - 1];
    if (trustedHop) {
      return trustedHop;
    }
  }
  return remote || "unknown";
}

export function isLoginLimited(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket) {
    return false;
  }
  if (now - bucket.windowStart > WINDOW_MS) {
    buckets.delete(key);
    return false;
  }
  return bucket.failures >= MAX_FAILURES;
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { failures: 1, windowStart: now });
    return;
  }
  bucket.failures += 1;
}

export function clearLoginFailures(key: string): void {
  buckets.delete(key);
}
