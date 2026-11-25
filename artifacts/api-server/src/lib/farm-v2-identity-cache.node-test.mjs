import test from "node:test";
import assert from "node:assert/strict";
import { createIdentityCache } from "./farm-v2-identity-cache.ts";
test("validated opaque identity is reused for at most 30 minutes", async () => {
  let now = 1000,
    calls = 0;
  const cache = createIdentityCache(() => now);
  const load = async () => {
    calls++;
    return {
      userId: "u",
      appId: "qiankun-futian",
      expiresAt: new Date(now + 7200000).toISOString(),
    };
  };
  await cache.get("scope", "opaque", load);
  now += 1799999;
  await cache.get("scope", "opaque", load);
  assert.equal(calls, 1);
  now++;
  await cache.get("scope", "opaque", load);
  assert.equal(calls, 2);
});
test("cache never outlives credential expiry or shares scopes", async () => {
  let now = 1000,
    calls = 0;
  const cache = createIdentityCache(() => now);
  const load = async () => {
    calls++;
    return {
      userId: "u",
      appId: "qiankun-futian",
      expiresAt: new Date(now + 100).toISOString(),
    };
  };
  await cache.get("a", "token", load);
  await cache.get("b", "token", load);
  assert.equal(calls, 2);
  now += 100;
  await cache.get("a", "token", load);
  assert.equal(calls, 3);
});
test("failed verification is never cached and concurrent misses share validation", async () => {
  const cache = createIdentityCache();
  let calls = 0;
  const load = async () => {
    calls++;
    throw Error("revoked");
  };
  await assert.rejects(cache.get("s", "t", load));
  await assert.rejects(cache.get("s", "t", load));
  assert.equal(calls, 2);
  let release;
  const pending = () =>
    new Promise((r) => {
      release = r;
      calls++;
    });
  const a = cache.get("s", "t", pending),
    b = cache.get("s", "t", pending);
  release({
    userId: "u",
    appId: "qiankun-futian",
    expiresAt: new Date(Date.now() + 10000).toISOString(),
  });
  await Promise.all([a, b]);
  assert.equal(calls, 3);
});
test("missing expiry prevents caching", async () => {
  const cache = createIdentityCache();
  let calls = 0;
  const load = async () => {
    calls++;
    return { userId: "u", appId: "qiankun-futian" };
  };
  await cache.get("s", "t", load);
  await cache.get("s", "t", load);
  assert.equal(calls, 2);
});

test("explicit invalidation forces the next identity verification", async () => {
  const cache = createIdentityCache();
  let calls = 0;
  const load = async () => {
    calls++;
    return {
      userId: "u",
      appId: "qiankun-futian",
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    };
  };
  await cache.get("s", "t", load);
  cache.invalidate("s", "t");
  await cache.get("s", "t", load);
  assert.equal(calls, 2);
});
