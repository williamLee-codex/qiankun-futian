import { describe, expect, it, vi } from "vitest";
import {
  createCoreMissionRewardHandler,
  type CoreMissionRewardHttpDependencies,
} from "../../../../contracts/core/platform-files/src/lib/farm-v2/mission-reward-handler";

const identity = { appId: "qiankun-futian", userId: "owner-1" };

function setup() {
  const deps: CoreMissionRewardHttpDependencies = {
    isTrusted: vi.fn(() => true),
    verifyLaunchToken: vi.fn(async () => identity),
    rpc: vi.fn(async () => ({ result_status: "created" })),
  };
  return { deps, handler: createCoreMissionRewardHandler(deps) };
}

function post(
  body: unknown,
  requestId = "mission-claim-1",
  secret = true,
) {
  return new Request("https://core.example/api/replit/farm-v2/mission-rewards", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(requestId ? { "x-request-id": requestId } : {}),
      ...(secret ? { "x-replit-shared-secret": "trusted" } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("staged Core mission reward HTTP handler contract", () => {
  it("rejects an untrusted caller before reading identity or calling Core", async () => {
    const { deps, handler } = setup();
    vi.mocked(deps.isTrusted).mockReturnValue(false);
    const response = await handler(post({ missionId: "MISSION_D01", launchToken: "token" }, "id", false));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "INVALID_REPLIT_SECRET" });
    expect(deps.verifyLaunchToken).not.toHaveBeenCalled();
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed and extra body fields without calling Core", async () => {
    const { deps, handler } = setup();
    for (const body of [
      null,
      [],
      { missionId: "MISSION_D01" },
      { missionId: "MISSION_D01", launchToken: "token", amount: 999 },
      { missionId: "MISSION_X99", launchToken: "token" },
    ]) {
      const response = await handler(post(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "INVALID_REQUEST", definitive: true });
    }
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it("keeps launch-token failure and app mismatch from reaching the RPC", async () => {
    const first = setup();
    vi.mocked(first.deps.verifyLaunchToken).mockResolvedValue(null);
    expect((await first.handler(post({ missionId: "MISSION_D01", launchToken: "bad" }))).status).toBe(401);
    expect(first.deps.rpc).not.toHaveBeenCalled();

    const second = setup();
    vi.mocked(second.deps.verifyLaunchToken).mockResolvedValue({ appId: "other-app", userId: "owner-1" });
    expect((await second.handler(post({ missionId: "MISSION_D01", launchToken: "token" }))).status).toBe(403);
    expect(second.deps.rpc).not.toHaveBeenCalled();
  });

  it("requires a valid request ID and sends only owner, mission and request ID to Core", async () => {
    const { deps, handler } = setup();
    expect((await handler(post({ missionId: "MISSION_D01", launchToken: "token" }, ""))).status).toBe(400);
    expect((await handler(post({ missionId: "MISSION_D01", launchToken: "token" }, "bad id"))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();

    const response = await handler(post({ missionId: "MISSION_D01", launchToken: "token" }));
    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("farm_v2_claim_mission_reward", {
      p_owner_id: "owner-1",
      p_mission_id: "MISSION_D01",
      p_request_id: "mission-claim-1",
    });
  });

  it("forwards each of the eight allowlisted missions without client reward values", async () => {
    const missionIds = [
      "MISSION_D01", "MISSION_D02", "MISSION_D03", "MISSION_D04",
      "MISSION_W01", "MISSION_W02", "MISSION_W03", "MISSION_W04",
    ];
    const { deps, handler } = setup();
    for (const missionId of missionIds) {
      const response = await handler(post({ missionId, launchToken: "token" }));
      expect(response.status).toBe(200);
    }
    expect(deps.rpc).toHaveBeenCalledTimes(8);
    for (const [name, args] of vi.mocked(deps.rpc).mock.calls) {
      expect(name).toBe("farm_v2_claim_mission_reward");
      expect(Object.keys(args).sort()).toEqual(["p_mission_id", "p_owner_id", "p_request_id"]);
    }
  });

  it("maps known business rejections to definitive 400 or 409 responses", async () => {
    const cases = [
      ["invalid_request", 400],
      ["identity_unavailable", 409],
      ["wallet_unavailable", 409],
      ["duplicate_conflict", 409],
    ] as const;
    for (const [result_status, expectedStatus] of cases) {
      const { handler, deps } = setup();
      vi.mocked(deps.rpc).mockResolvedValue({ result_status });
      const response = await handler(post({ missionId: "MISSION_D01", launchToken: "token" }));
      expect(response.status).toBe(expectedStatus);
      expect(await response.json()).toEqual({ error: result_status, definitive: true });
    }
  });

  it("returns non-definitive unavailable responses for unknown RPC results and failures", async () => {
    const unknown = setup();
    vi.mocked(unknown.deps.rpc).mockResolvedValue({ result_status: "new_unknown_status" });
    expect((await unknown.handler(post({ missionId: "MISSION_D01", launchToken: "token" }))).status).toBe(503);

    const failure = setup();
    vi.mocked(failure.deps.rpc).mockRejectedValue(new Error("database unavailable"));
    const response = await failure.handler(post({ missionId: "MISSION_D01", launchToken: "token" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "CORE_MISSION_REWARD_UNAVAILABLE" });
  });
});
