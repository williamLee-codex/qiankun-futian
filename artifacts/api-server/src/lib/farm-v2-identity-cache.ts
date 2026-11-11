import { createHash } from "node:crypto";
type Identity = { userId: string; appId: string; expiresAt?: string };
/** Process-local only: cold instances revalidate; credentials are never stored. */
export function createIdentityCache(now = Date.now, capacity = 2000) {
  const entries = new Map<string, { identity: Identity; until: number }>();
  const pending = new Map<string, Promise<Identity>>();
  const key = (scope: string, token: string) =>
    createHash("sha256").update(scope).update("\0").update(token).digest("hex");
  return {
    invalidate(scope: string, token: string) {
      entries.delete(key(scope, token));
    },
    async get(
      scope: string,
      token: string,
      load: () => Promise<Identity>,
    ): Promise<Identity> {
      const id = key(scope, token),
        started = now(),
        cached = entries.get(id);
      if (cached && cached.until > started) return cached.identity;
      entries.delete(id);
      const inFlight = pending.get(id);
      if (inFlight) return inFlight;
      const job = (async () => {
        const identity = await load();
        const expiry = Date.parse(identity.expiresAt ?? "");
        if (
          identity.userId &&
          identity.appId === "qiankun-futian" &&
          Number.isFinite(expiry)
        ) {
          const until = Math.min(started + 30 * 60 * 1000, expiry);
          if (until > now()) {
            while (entries.size >= capacity)
              entries.delete(entries.keys().next().value!);
            entries.set(id, { identity, until });
          }
        }
        return identity;
      })();
      pending.set(id, job);
      try {
        return await job;
      } finally {
        pending.delete(id);
      }
    },
  };
}
