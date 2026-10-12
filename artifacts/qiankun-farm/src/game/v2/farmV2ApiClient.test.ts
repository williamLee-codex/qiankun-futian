import { afterEach, describe, expect, it, vi } from "vitest";
import { createFarmV2Api, FarmV2ApiError } from "./farmV2ApiClient";

afterEach(() => vi.unstubAllGlobals());

describe("Farm V2 API contract", () => {
  it("claims the server-owned chaos pool with the original request ID and no client quantity", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ claimed: 3 }) });
    vi.stubGlobal("fetch", transport);
    await createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    }).claimChaosSeeds("chaos-request");
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe("https://example.test/api/farm/v2/chaos-seeds/claim");
    expect(options.headers["x-request-id"]).toBe("chaos-request");
    expect(options.body).toBeUndefined();
  });

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
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    }).readState();
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        redirect: "error",
        cache: "no-store",
      }),
    );
  });

  it("reads authoritative state with bearer authentication and no cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
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
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].headers["x-request-id"]).toBeUndefined();
  });

  it("sends a request ID and correct purchase and exchange quantities", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
    const api = createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    });
    await api.purchaseSeeds(2, 3);
    await api.exchangeCrops(6, 6);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/api/farm/v2/seeds/2/purchase",
    );
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ packs: 3 }));
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://example.test/api/farm/v2/crops/6/exchange",
    );
    expect(fetchMock.mock.calls[1][1].body).toBe(
      JSON.stringify({ cropQuantity: 6 }),
    );
    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers["x-request-id"]).toBe("request-1");
    }
  });

  it("reuses an explicitly supplied request ID for retrying the same mutation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "new-request" });
    const api = createFarmV2Api({
      baseUrl: "https://example.test/api",
      launchToken: "token",
    });
    await api.sow(1, "original-request");
    await api.sow(1, "original-request");
    expect(fetchMock.mock.calls[0][1].headers["x-request-id"]).toBe(
      "original-request",
    );
    expect(fetchMock.mock.calls[1][1].headers["x-request-id"]).toBe(
      "original-request",
    );
  });

  it("does not turn server rejections into successful mutations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
});

it('sends coin-land unlock with original request ID and no price body', async()=>{
 vi.stubGlobal('fetch',async(_url:any,init:any)=>{expect(init.method).toBe('POST');expect(init.headers['x-request-id']).toBe('original-unlock');expect(init.body).toBeUndefined();return Response.json({ok:true});});
 await createFarmV2Api({baseUrl:'https://farm.test/api',launchToken:'launch'}).unlockCoinLand(2,'original-unlock');
});
