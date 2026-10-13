import { isLaunchSharedSecretValid, launchCoreService } from "@/core/launch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCoreMissionRewardHandler } from "@/lib/farm-v2/mission-reward-handler";

export async function POST(request: Request): Promise<Response> {
  const sharedSecret = process.env.REPLIT_APP_SHARED_SECRET;
  const tokenSecret = process.env.LAUNCH_TOKEN_SECRET;
  if (!sharedSecret || !tokenSecret)
    return Response.json(
      { error: "CORE_MISSION_REWARD_NOT_CONFIGURED" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );

  return createCoreMissionRewardHandler({
    isTrusted: (req) => isLaunchSharedSecretValid(req, sharedSecret),
    verifyLaunchToken: (token) =>
      launchCoreService
        .verifyLaunchToken({ secret: tokenSecret, token })
        .catch(() => null),
    rpc: async (name, args) => {
      const { data, error } = await createSupabaseAdminClient().rpc(name, args);
      if (error) throw new Error("CORE_MISSION_REWARD_RPC_FAILED");
      return data;
    },
  })(request);
}
