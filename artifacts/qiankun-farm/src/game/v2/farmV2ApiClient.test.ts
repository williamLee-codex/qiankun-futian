import { afterEach, describe, expect, it, vi } from "vitest";
import { createFarmV2Api, FarmV2ApiError } from "./farmV2ApiClient";

afterEach(() => vi.unstubAllGlobals());
const session = {
  userId: "user-1",
  sessionToken: "fvs1.session",
  reauthenticateUrl:
    "https://platform.test/api/apps/qiankun-futian/launch?farmV2=1",
};
function fetchWithSession(response: object) {
  return vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => session })
    .mockResolvedValue(response);
}

describe("Farm V2 API contract", () => {
  it("requires an authenticated platform launch token", () => {
    expect(() =>
      createFarmV2Api({ baseUrl: "https://example.test/api", launchToken: "" }),
    ).toThrow("FARM_V2_LAUNCH_TOKEN_REQUIRED");
  });

  it("rejects insecure remote API origins and credential-bearing base URLs", () => {
    expect(() =>
      createFarmV2Api({
        baseUrl: "http://example.test/api",
        launchToken: "token",
      }),
    ).toThrow("FARM_V2_SECURE_API_REQUIRED");
    expect(() =>
      createFarmV2Api({
        baseUrl: "https://user:password@example.test/api",
        launchToken: "token",
      }),
    ).toThrow("FARM_V2_INVALID_API_BASE");
    expect(() =>
      createFarmV2Api({
        baseUrl: "https://example.test/api?redirect=elsewhere",
        launchToken: "token",
      }),
    ).toThrow("FARM_V2_INVALID_API_BASE");
    expect(() =>
      createFarmV2Api({
        baseUrl: "https://example.test/api#fragment",
        launchToken: "token",
      }),
    ).toThrow("FARM_V2_INVALID_API_BASE");
    expect(() =>
      createFarmV2Api({
        baseUrl: "http://localhost:3000/api",
        launchToken: "token",
      }),
    ).not.toThrow();
  });

  it("does not follow redirects when sending the launch token", async () => {
    const fetchMock = fetchWithSession({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    }).readState();
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        redirect: "error",
        cache: "no-store",
      }),
    );
  });

  it("reads authoritative state with bearer authentication and no cache", async () => {
    const fetchMock = fetchWithSession({
      ok: true,
      json: async () => ({ player: {}, lands: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = createFarmV2Api({
      baseUrl: "https://example.test/api/",
      launchToken: "token",
    });
    await api.readState();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/farm/v2/state",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer fvs1.session",
        }),
      }),
    );
    expect(fetchMock.mock.calls[1][1].headers["x-request-id"]).toBeUndefined();
  });

  it("sends a request ID and correct purchase and exchange quantities", async () => {
    const fetchMock = fetchWithSession({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
    const api = createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    });
    await api.purchaseSeeds(2, 3);
    await api.exchangeCrops(6, 6);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://example.test/api/farm/v2/seeds/2/purchase",
    );
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ packs: 3 }));
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://example.test/api/farm/v2/crops/6/exchange",
    );
    expect(fetchMock.mock.calls[2][1].body).toBe(
      JSON.stringify({ cropQuantity: 6 }),
    );
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(call[1].headers["x-request-id"]).toBe("request-1");
    }
  });

  it("does not turn server rejections into successful mutations", async () => {
    vi.stubGlobal(
      "fetch",
      fetchWithSession({
        ok: false,
        status: 403,
        json: async () => ({ error: "LAND_NOT_ACCESSIBLE" }),
      }),
    );
    vi.stubGlobal("crypto", { randomUUID: () => "request-2" });
    const api = createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    });
    await expect(api.sow(4)).rejects.toMatchObject({
      name: "FarmV2ApiError",
      status: 403,
      code: "LAND_NOT_ACCESSIBLE",
    } satisfies Partial<FarmV2ApiError>);
  });
  it("bootstraps once and retries an interrupted mutation with the identical request ID", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const api = createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    });
    await api.purchaseSeeds(1, 2);
    await api.readState();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/api/farm/v2/session",
    );
    expect(fetchMock.mock.calls[1][1].headers["x-request-id"]).toBe(
      fetchMock.mock.calls[2][1].headers["x-request-id"],
    );
    expect(
      fetchMock.mock.calls.filter((call) => call[0].endsWith("/session")),
    ).toHaveLength(1);
  });
  it("revoked sessions require platform login and never fall back to the launch token", async () => {
    const fetchMock = fetchWithSession({
      ok: false,
      status: 401,
      json: async () => ({ error: "INVALID_LAUNCH_IDENTITY" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    });
    await expect(api.readState()).rejects.toBeInstanceOf(FarmV2ApiError);
    expect(api.getReauthenticationUrl()).toBe(session.reauthenticateUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains only non-secret pending request IDs across a platform re-login", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    let count = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `request-${++count}` });
    const first = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => session })
      .mockRejectedValue(new TypeError("lost response"));
    vi.stubGlobal("fetch", first);
    await expect(
      createFarmV2Api({
        baseUrl: "https://example.test/api",
        launchToken: "launch-1",
      }).purchaseSeeds(1, 2),
    ).rejects.toThrow("lost response");
    const next = fetchWithSession({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", next);
    await createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "launch-2",
    }).purchaseSeeds(1, 2);
    expect(next.mock.calls[1][1].headers["x-request-id"]).toBe(
      first.mock.calls[1][1].headers["x-request-id"],
    );
    expect([...values.values()].join("")).not.toContain("launch-");
    expect([...values.values()].join("")).not.toContain("fvs1.");
  });
});
