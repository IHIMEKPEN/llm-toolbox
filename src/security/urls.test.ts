import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlockedIPv4, isBlockedIPv6, parsePublicHttpUrl, UnsafeUrlError } from "./urls";

test("allows ordinary public https URLs", () => {
  const url = parsePublicHttpUrl("https://arxiv.org/abs/1706.03762");
  assert.equal(url.hostname, "arxiv.org");
});

test("rejects non-http schemes and credentials", () => {
  assert.throws(() => parsePublicHttpUrl("file:///etc/passwd"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpUrl("gopher://example.com"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpUrl("https://user:pass@example.com"), UnsafeUrlError);
});

test("rejects localhost and metadata hostnames", () => {
  assert.throws(() => parsePublicHttpUrl("http://localhost:8080/"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpUrl("http://127.0.0.1/"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpUrl("http://169.254.169.254/latest/meta-data"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpUrl("http://metadata.google.internal/"), UnsafeUrlError);
});

test("classifies private IPv4 ranges as blocked", () => {
  assert.equal(isBlockedIPv4("10.0.0.5"), true);
  assert.equal(isBlockedIPv4("192.168.1.1"), true);
  assert.equal(isBlockedIPv4("172.16.0.1"), true);
  assert.equal(isBlockedIPv4("8.8.8.8"), false);
});

test("classifies loopback IPv6 as blocked", () => {
  assert.equal(isBlockedIPv6("::1"), true);
});
