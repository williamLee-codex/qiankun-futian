import type { Request, Response, NextFunction } from "express";

type LaunchValidationResponse = {
  userId?: string;
  appId?: string;
};

type LaunchValidationError = {
  error?: string;
};

export async function requireFarmV2LaunchIdentity(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authorization = String(req.header("authorization") ?? "").trim();
    const bearerMatch = authorization.match(/^Bearer[ ]+(.+)$/i);
    const launchToken = String(
      bearerMatch?.[1] ?? req.header("x-launch-token") ?? "",
    ).trim();
    const sharedSecret = process.env.REPLIT_APP_SHARED_SECRET;
    const platformBaseUrl = process.env.PLATFORM_BASE_URL;

    if (!launchToken) {
      res.status(401).json({ error: "MISSING_LAUNCH_TOKEN" });
      return;
    }
    if (!sharedSecret || !platformBaseUrl) {
      res.status(503).json({ error: "LAUNCH_VALIDATE_NOT_CONFIGURED" });
      return;
    }

    const response = await fetch(
      new URL("/api/replit/launch/validate", platformBaseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-replit-shared-secret": sharedSecret,
        },
        body: JSON.stringify({ launchToken }),
        signal: AbortSignal.timeout(5_000),
      },
    );

    const body = await response.json().catch(() => null) as
      | LaunchValidationResponse
      | LaunchValidationError
      | null;
    if (!response.ok) {
      if (response.status === 503) {
        res.status(503).json({ error: "LAUNCH_VALIDATE_NOT_CONFIGURED" });
        return;
      }
      if (response.status === 404) {
        res.status(404).json({ error: "APP_NOT_AVAILABLE" });
        return;
      }
      res.status(401).json({ error: "INVALID_LAUNCH_IDENTITY" });
      return;
    }
    if (!body || !("userId" in body) || !body.userId) {
      res.status(502).json({ error: "INVALID_LAUNCH_VALIDATE_RESPONSE" });
      return;
    }

    if (body.appId !== "qiankun-futian") {
      res.status(403).json({ error: "APP_TOKEN_MISMATCH" });
      return;
    }

    res.locals.authenticatedUserId = body.userId;
    res.locals.authenticatedAppId = body.appId;
    next();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      res.status(504).json({ error: "LAUNCH_VALIDATE_TIMEOUT" });
      return;
    }
    next(error);
  }
}
