import type { Request, Response, NextFunction } from "express";

type LaunchValidationResponse = {
  userId?: string;
  appId?: string;
};

export async function requireFarmV2LaunchIdentity(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const launchToken = String(req.header("x-launch-token") ?? "").trim();
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
      },
    );

    const body = await response.json().catch(() => null) as LaunchValidationResponse | null;
    if (!response.ok || !body?.userId) {
      res.status(response.status === 404 ? 404 : 401).json({
        error: "INVALID_LAUNCH_IDENTITY",
      });
      return;
    }

    res.locals.authenticatedUserId = body.userId;
    res.locals.authenticatedAppId = body.appId ?? null;
    next();
  } catch (error) {
    next(error);
  }
}
