import { farmV2PlatformFetch } from "../lib/farm-v2-platform-fetch";
import type { Request, Response, NextFunction } from "express";
import { farmV2PlatformConnection } from "../lib/farm-v2-platform";
import { createIdentityCache } from "../lib/farm-v2-identity-cache";
const identityCache = createIdentityCache();
class IdentityFailure extends Error {
  constructor(
    readonly status: number,
    code: string,
  ) {
    super(code);
  }
}
export async function requireFarmV2LaunchIdentity(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authorization = String(req.header("authorization") ?? "").trim();
    const launchToken = String(
      authorization.match(/^Bearer[ ]+(.+)$/i)?.[1] ??
        req.header("x-launch-token") ??
        "",
    ).trim();
    if (!launchToken) {
      res.status(401).json({ error: "MISSING_LAUNCH_TOKEN" });
      return;
    }
    const sharedSecret = process.env.REPLIT_APP_SHARED_SECRET,
      platformBaseUrl = process.env.PLATFORM_BASE_URL;
    if (!sharedSecret || !platformBaseUrl) {
      res.status(503).json({ error: "LAUNCH_VALIDATE_NOT_CONFIGURED" });
      return;
    }
    const connection = farmV2PlatformConnection(),
      isFarmSession = /^fvs1\.[A-Za-z0-9_-]{43}$/.test(launchToken);
    const load = async () => {
      const response = await farmV2PlatformFetch(
        new URL(
          isFarmSession
            ? "/api/replit/farm-v2/identity"
            : "/api/replit/launch/validate",
          platformBaseUrl,
        ),
        {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            [isFarmSession
              ? connection.sessionSecretHeader
              : "x-replit-shared-secret"]: isFarmSession
              ? connection.sessionSecret
              : sharedSecret,
          },
          body: JSON.stringify({ launchToken, farmV2: true }),
          signal: AbortSignal.timeout(5000),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        userId?: unknown;
        appId?: unknown;
        expiresAt?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok)
        throw new IdentityFailure(
          response.status === 503 ? 503 : response.status === 404 ? 404 : 401,
          response.status === 503
            ? body?.error === "FARM_V2_ENTRY_DISABLED"
              ? "FARM_V2_ENTRY_DISABLED"
              : "LAUNCH_VALIDATE_NOT_CONFIGURED"
            : response.status === 404
              ? "APP_NOT_AVAILABLE"
              : "INVALID_LAUNCH_IDENTITY",
        );
      if (typeof body?.userId !== "string" || !body.userId.trim())
        throw new IdentityFailure(502, "INVALID_LAUNCH_VALIDATE_RESPONSE");
      if (body.appId !== "qiankun-futian")
        throw new IdentityFailure(403, "APP_TOKEN_MISMATCH");
      return {
        userId: body.userId,
        appId: body.appId,
        expiresAt:
          typeof body.expiresAt === "string" ? body.expiresAt : undefined,
      };
    };
    // Only previously verified opaque sessions are cached. Launch JWTs always
    // execute the original bootstrap validation. No credential is stored/logged.
    const body =
      isFarmSession && process.env.FARM_V2_IDENTITY_CACHE_ENABLED === "1"
        ? await identityCache.get(
            JSON.stringify([platformBaseUrl, connection.sessionSecret]),
            launchToken,
            load,
          )
        : await load();
    res.locals.authenticatedUserId = body.userId;
    res.locals.authenticatedAppId = body.appId;
    res.locals.launchToken = launchToken;
    next();
  } catch (error) {
    if (error instanceof IdentityFailure) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      res.status(504).json({ error: "LAUNCH_VALIDATE_TIMEOUT" });
      return;
    }
    next(error);
  }
}
