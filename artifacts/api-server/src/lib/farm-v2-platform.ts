export function farmV2PlatformConnection() {
  const baseUrl = process.env.PLATFORM_BASE_URL;
  const secret = process.env.REPLIT_APP_SHARED_SECRET;
  if (!baseUrl || !secret) throw new Error("FARM_SESSION_NOT_CONFIGURED");
  const base = new URL(baseUrl);
  const local =
    base.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    (base.protocol !== "https:" && !local) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("INVALID_FARM_PLATFORM_BASE_URL");
  return { base, secret };
}

export async function requestFarmV2PlatformSession(
  launchToken: string,
  action: "exchange" | "revoke",
) {
  const { base, secret } = farmV2PlatformConnection();
  const response = await fetch(new URL("/api/replit/farm-v2/session", base), {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-replit-shared-secret": secret,
    },
    body: JSON.stringify({ launchToken, action }),
    signal: AbortSignal.timeout(5000),
  });
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    const error = new Error(
      response.status === 401
        ? "FARM_SESSION_NOT_ACTIVE"
        : "FARM_SESSION_AUTHORITY_UNAVAILABLE",
    );
    throw error;
  }
  if (action === "revoke") {
    if (body?.revoked !== true)
      throw new Error("INVALID_FARM_SESSION_RESPONSE");
    return { revoked: true };
  }
  if (
    typeof body?.sessionToken !== "string" ||
    !/^fvs1\.[A-Za-z0-9_-]{43}$/.test(body.sessionToken) ||
    typeof body.userId !== "string" ||
    !body.userId ||
    body.appId !== "qiankun-futian" ||
    typeof body.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(body.expiresAt))
  )
    throw new Error("INVALID_FARM_SESSION_RESPONSE");
  return {
    sessionToken: body.sessionToken,
    userId: body.userId,
    expiresAt: body.expiresAt,
    reauthenticateUrl: new URL(
      "/api/apps/qiankun-futian/launch?farmV2=1",
      base,
    ).toString(),
  };
}
