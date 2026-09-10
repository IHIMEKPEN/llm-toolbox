import { isIP } from "net";
import { lookup } from "dns/promises";

export class UnsafeUrlError extends Error {
  override readonly name = "UnsafeUrlError";
  constructor(message: string) {
    super(message);
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
  "metadata.goog",
  "instance-data",
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inCidr(ip: string, base: string, bits: number): boolean {
  const shift = 32 - bits;
  return ipv4ToInt(ip) >>> shift === ipv4ToInt(base) >>> shift;
}

export function isBlockedIPv4(ip: string): boolean {
  if (inCidr(ip, "0.0.0.0", 8)) return true;
  if (inCidr(ip, "10.0.0.0", 8)) return true;
  if (inCidr(ip, "127.0.0.0", 8)) return true;
  if (inCidr(ip, "169.254.0.0", 16)) return true;
  if (inCidr(ip, "172.16.0.0", 12)) return true;
  if (inCidr(ip, "192.168.0.0", 16)) return true;
  if (inCidr(ip, "192.0.0.0", 24)) return true;
  if (inCidr(ip, "192.0.2.0", 24)) return true;
  if (inCidr(ip, "198.18.0.0", 15)) return true;
  if (inCidr(ip, "198.51.100.0", 24)) return true;
  if (inCidr(ip, "203.0.113.0", 24)) return true;
  if (inCidr(ip, "224.0.0.0", 4)) return true;
  if (inCidr(ip, "240.0.0.0", 4)) return true;
  return false;
}

export function isBlockedIPv6(ip: string): boolean {
  const compact = ip.toLowerCase();
  if (compact === "::1" || compact === "0:0:0:0:0:0:0:1") return true;
  if (compact.startsWith("fe80:") || compact.startsWith("fec0:")) return true;
  if (compact.startsWith("fc") || compact.startsWith("fd")) return true;
  if (compact.startsWith("::ffff:")) {
    const v4 = compact.slice("::ffff:".length);
    if (isIP(v4) === 4) return isBlockedIPv4(v4);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true;
}

export function parsePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("only http(s) URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with credentials are not allowed");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) {
    throw new UnsafeUrlError("missing hostname");
  }
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new UnsafeUrlError("private or metadata hostnames are blocked");
  }
  if (isIP(host) && isBlockedIp(host)) {
    throw new UnsafeUrlError("private or reserved IP addresses are blocked");
  }
  return url;
}

export async function assertResolvesPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedIp(host)) {
      throw new UnsafeUrlError("private or reserved IP addresses are blocked");
    }
    return;
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("hostname could not be resolved");
  }
  if (!records.length) {
    throw new UnsafeUrlError("hostname could not be resolved");
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new UnsafeUrlError("hostname resolves to a private or reserved address");
    }
  }
}
