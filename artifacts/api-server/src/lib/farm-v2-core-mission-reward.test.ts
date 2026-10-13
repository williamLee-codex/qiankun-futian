import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimCoreFarmMissionReward,
  CoreMissionRewardError,
} from "./farm-v2-core-mission-reward";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const receipt = (
  requestId = "claim-1",
  missionId = "MISSION_D01",
  amount = 2,
) => ({
  result_status: "created",
  mission_id: missionId,
  amount,
  transaction: {
    id: "tx-1",
    owner_id: "owner",
    amount,
    currency: "coin",
    direction: "credit",
    reason: "farm_v2_mission_reward",
    reference_type: "farm_v2_mission_reward",
    reference_id: missionId,
    idempotency_key: `farm-v2:mission-claim:${requestId}`,
  },
  wallet: { wallet_id: "wallet-1" },
});
function configureFetch(response: Response | (() => Promise<Response>)) {
  vi.stubEnv("PLATFORM_BASE_URL", "https://core.example");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "shared");
  const fetchMock = vi.fn(
    typeof response === "function" ? response : async () => response,
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Core mission reward transport", () => {
  it("sends only mission ID and launch token with stable request header", async () => {
    const fetchMock = configureFetch(Response.json(receipt()));
    await claimCoreFarmMissionReward("launch", "MISSION_D01", "claim-1");
    expect(String((fetchMock as any).mock.calls[0][0])).toBe(
      "https://core.example/api/replit/farm-v2/mission-rewards",
    );
    expect((fetchMock as any).mock.calls[0][1]).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        "x-request-id": "claim-1",
        "x-replit-shared-secret": "shared",
      },
      body: JSON.stringify({ missionId: "MISSION_D01", launchToken: "launch" }),
    });
  });
  it("returns duplicate receipts and reuses the same request ID on retry", async () => {
    const duplicate = { ...receipt(), result_status: "duplicate" };
    const fetchMock = configureFetch(async () => Response.json(duplicate));
    const a = await claimCoreFarmMissionReward(
      "launch",
      "MISSION_D01",
      "claim-1",
    );
    const b = await claimCoreFarmMissionReward(
      "launch",
      "MISSION_D01",
      "claim-1",
    );
    expect(a.duplicate).toBe(true);
    expect(b.transactionId).toBe("tx-1");
    expect((fetchMock as any).mock.calls[0][1]?.headers).toMatchObject({
      "x-request-id": "claim-1",
    });
    expect((fetchMock as any).mock.calls[1][1]?.headers).toMatchObject({
      "x-request-id": "claim-1",
    });
  });
  it("rejects malformed or mismatched authoritative receipts", async () => {
    configureFetch(Response.json({ ...receipt(), amount: 999 }));
    await expect(
      claimCoreFarmMissionReward("launch", "MISSION_D01", "claim-1"),
    ).rejects.toThrow("INVALID_CORE_MISSION_REWARD_RESPONSE");
    configureFetch(
      Response.json({
        ...receipt(),
        transaction: { ...receipt().transaction, reference_id: "MISSION_D02" },
      }),
    );
    await expect(
      claimCoreFarmMissionReward("launch", "MISSION_D01", "claim-1"),
    ).rejects.toThrow("INVALID_CORE_MISSION_REWARD_RESPONSE");
  });
  it("classifies only known definitive business errors as safe rejection", async () => {
    configureFetch(
      new Response(
        JSON.stringify({ error: "wallet_unavailable", definitive: true }),
        { status: 409 },
      ),
    );
    await expect(
      claimCoreFarmMissionReward("launch", "MISSION_D01", "claim-1"),
    ).rejects.toMatchObject({
      message: "CORE_MISSION_REWARD_WALLET_UNAVAILABLE",
      definitive: true,
    });
    configureFetch(
      new Response(JSON.stringify({ error: "unknown", definitive: true }), {
        status: 503,
      }),
    );
    await expect(
      claimCoreFarmMissionReward("launch", "MISSION_D01", "claim-1"),
    ).rejects.toMatchObject({
      message: "CORE_MISSION_REWARD_UNAVAILABLE",
      definitive: false,
    });
  });
  it("treats network errors as uncertain and rejects invalid input definitively", async () => {
    configureFetch(async () => {
      throw new Error("socket lost");
    });
    await expect(
      claimCoreFarmMissionReward("launch", "MISSION_D01", "claim-1"),
    ).rejects.toMatchObject({
      message: "CORE_MISSION_REWARD_UNAVAILABLE",
      definitive: false,
    });
    await expect(
      claimCoreFarmMissionReward("launch", "MISSION_X99" as never, "claim-1"),
    ).rejects.toMatchObject({
      message: "INVALID_CORE_MISSION_CLAIM",
      definitive: true,
    });
  });
  it("requires configured trusted Core transport", async () => {
    await expect(
      claimCoreFarmMissionReward("launch", "MISSION_D01", "claim-1"),
    ).rejects.toBeInstanceOf(CoreMissionRewardError);
  });
});
