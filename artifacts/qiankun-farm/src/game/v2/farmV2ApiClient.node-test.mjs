import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createFarmV2Api } from "./farmV2ApiClient.ts";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.location;
  delete globalThis.sessionStorage;
});
test("reopen restores session without resending launch credential", async () => {
  globalThis.location = { origin: "https://farm.example" };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    return Response.json(
      url.endsWith("/session")
        ? {
            userId: "u",
            sessionToken: "cookie-session",
            reauthenticateUrl: "https://farm.example/launch",
          }
        : { player: { userId: "u" }, lands: [] },
    );
  };
  const api = createFarmV2Api({
    baseUrl: "https://farm.example/api/farm-backend/",
    launchToken: "browser-session",
  });
  await api.readState();
  await api.readState();
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].method, "GET");
  assert.ok(calls.every(([, o]) => !o.headers?.Authorization));
});
test("cookie authentication retains original mutation ID after uncertain result", async () => {
  globalThis.location = { origin: "https://farm.example" };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
  const ids = [];
  let attempts = 0;
  globalThis.fetch = async (url, o) => {
    if (url.endsWith("/session"))
      return Response.json({
        userId: "u",
        sessionToken: "cookie-session",
        reauthenticateUrl: "https://farm.example/launch",
      });
    ids.push(o.headers["x-request-id"]);
    return ++attempts < 3
      ? Response.json({ error: "FARM_API_UNAVAILABLE" }, { status: 503 })
      : Response.json({ ok: true });
  };
  const api = createFarmV2Api({
    baseUrl: "https://farm.example/api/farm-backend/",
    launchToken: "browser-session",
  });
  await assert.rejects(api.exchangeCrops(1, 5));
  await api.exchangeCrops(1, 5);
  assert.equal(new Set(ids).size, 1);
  assert.ok(ids[0]);
});
test("browser resume refuses cross-origin API", () => {
  globalThis.location = { origin: "https://farm.example" };
  assert.throws(
    () =>
      createFarmV2Api({
        baseUrl: "https://other.example/",
        launchToken: "browser-session",
      }),
    /SAME_ORIGIN/,
  );
});
test("cookie resume loads state without a separate session round trip and restores pending mutation identity", async () => {
  globalThis.location = { origin: "https://farm.example" };
  const operation = JSON.stringify(["farm/v2/seeds/1/purchase", { packs: 1 }]);
  globalThis.sessionStorage = {
    getItem: () => JSON.stringify({ [operation]: "original-purchase" }),
    setItem: () => {},
  };
  const calls = [];
  globalThis.fetch = async (url, o) => {
    calls.push([url, o]);
    return Response.json(
      url.endsWith("/session")
        ? {
            userId: "u",
            sessionToken: "cookie-session",
            reauthenticateUrl: "https://farm.example/launch",
          }
        : url.endsWith("/state")
          ? {
              player: {
                userId: "u",
                warehouseState: { seeds: { 1: 60 }, crops: { 1: 406 } },
              },
              lands: [],
            }
          : { ok: true },
    );
  };
  const api = createFarmV2Api({
    baseUrl: "https://farm.example/api/farm-backend/",
    launchToken: "browser-session",
  });
  const state = await api.readState();
  assert.equal(state.player.userId, "u");
  await api.purchaseSeeds(1, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls[0][0].endsWith("/state"));
  assert.equal(calls[1][1].headers["x-request-id"], "original-purchase");
  assert.ok(calls.every(([, o]) => !o.headers?.Authorization));
});
test("cookie state resume rejects inactive sessions and still offers same-origin login", async () => {
  globalThis.location = { origin: "https://farm.example" };
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: "FARM_SESSION_NOT_ACTIVE" }, { status: 401 });
  };
  const api = createFarmV2Api({
    baseUrl: "https://farm.example/api/farm-backend/",
    launchToken: "browser-session",
  });
  await assert.rejects(api.readState(), /FARM_SESSION_NOT_ACTIVE/);
  assert.equal(calls, 1);
  assert.equal(
    api.getReauthenticationUrl(),
    "https://farm.example/api/apps/qiankun-futian/launch?farmV2=1",
  );
});
test("cookie state resume retains one retry for temporary failures without session preflight", async () => {
  globalThis.location = { origin: "https://farm.example" };
  const paths = [];
  globalThis.fetch = async (url) => {
    paths.push(url);
    return paths.length === 1
      ? Response.json({ error: "FARM_API_UNAVAILABLE" }, { status: 503 })
      : Response.json({ player: { userId: "u" }, lands: [] });
  };
  const api = createFarmV2Api({
    baseUrl: "https://farm.example/api/farm-backend/",
    launchToken: "browser-session",
  });
  assert.equal((await api.readState()).player.userId, "u");
  assert.equal(paths.length, 2);
  assert.ok(paths.every((url) => url.endsWith("/state")));
});
test("uncertain manual transfer retries original amount and key and blocks a different transfer", async () => {
  globalThis.location = { origin: "https://farm.example" };
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
  const calls = [];
  let fail = true;
  globalThis.fetch = async (url, o) => {
    if (url.endsWith("/session"))
      return Response.json({
        userId: "u",
        sessionToken: "cookie-session",
        reauthenticateUrl: "https://farm.example/launch",
      });
    calls.push(o);
    return fail
      ? Response.json({ error: "FARM_API_UNAVAILABLE" }, { status: 503 })
      : Response.json({ coins: 10, centralCoins: 90 });
  };
  const api = createFarmV2Api({
    baseUrl: "https://farm.example/api/farm-backend/",
    launchToken: "browser-session",
  });
  await assert.rejects(api.transferCoins("in", 10));
  await assert.rejects(api.transferCoins("out", 20), /FARM_TRANSFER_PENDING/);
  assert.deepEqual(api.pendingTransfers(), [{ direction: "in", amount: 10 }]);
  fail = false;
  await api.transferCoins("in", 10);
  assert.equal(new Set(calls.map((o) => o.headers["x-request-id"])).size, 1);
  assert.ok(calls.every((o) => JSON.parse(o.body).amount === 10));
  assert.deepEqual(api.pendingTransfers(), []);
});
test('parallel transfer submissions cannot create two different manual transfers',async()=>{
 globalThis.location={origin:'https://farm.example'};globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
 let transfers=0;
 globalThis.fetch=async(url)=>url.endsWith('/session')?Response.json({userId:'parallel-user',sessionToken:'cookie-session',reauthenticateUrl:'https://farm.example/launch'}):(transfers++,Response.json({coins:10,centralCoins:90}));
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 const result=await Promise.allSettled([api.transferCoins('in',10),api.transferCoins('out',20)]);
 assert.equal(transfers,1);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 assert.match(result.find(r=>r.status==='rejected').reason.message,/FARM_TRANSFER_PENDING/);
});
test('malformed saved operation keys cannot block wallet recovery',async()=>{
 globalThis.location={origin:'https://farm.example'};
 globalThis.sessionStorage={getItem:()=>JSON.stringify({'broken-json-key':'old-id',[JSON.stringify(['farm/v2/wallet/transfer',{direction:'in',amount:10}])]:'original-transfer'}),setItem:()=>{}};
 const ids=[];globalThis.fetch=async(url,o)=>url.endsWith('/state')?Response.json({player:{userId:'u'},lands:[]}):(ids.push(o.headers['x-request-id']),Response.json({coins:10,centralCoins:90}));
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 await api.readState();
 assert.deepEqual(api.pendingTransfers(),[{direction:'in',amount:10}]);
 await api.transferCoins('in',10);assert.deepEqual(ids,['original-transfer']);
});
test('resume lost seed request reuses original handler, quantity and request id through uncertain responses',async()=>{
 globalThis.location={origin:'https://farm.example'};globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
 const ids=[],paths=[],bodies=[];let calls=0;
 globalThis.fetch=async(url,o)=>{if(url.endsWith('/session'))return Response.json({userId:'u',sessionToken:'cookie-session',reauthenticateUrl:'https://farm.example/launch'});paths.push(url);ids.push(o.headers['x-request-id']);bodies.push(JSON.parse(o.body));return ++calls<=2?Response.json({error:'FARM_API_UNAVAILABLE'},{status:503}):Response.json({seedsAdded:20});};
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});
 const original={requestId:'original-seed-request',landId:1,packs:1};
 await assert.rejects(api.resumeSeedPurchase(original));await api.resumeSeedPurchase(original);
 assert.ok(paths.every(p=>p.endsWith('/farm/v2/seeds/1/purchase?snapshot=1')));assert.deepEqual(ids,['original-seed-request','original-seed-request','original-seed-request']);assert.ok(bodies.every(b=>b.packs===1));
});
test('recovery cannot overwrite a different unresolved purchase key',async()=>{
 globalThis.location={origin:'https://farm.example'};globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
 const ids=[];globalThis.fetch=async(url,o)=>url.endsWith('/session')?Response.json({userId:'u',sessionToken:'cookie-session',reauthenticateUrl:'https://farm.example/launch'}):(ids.push(o.headers['x-request-id']),Response.json({error:'FARM_API_UNAVAILABLE'},{status:503}));
 const api=createFarmV2Api({baseUrl:'https://farm.example/api/farm-backend/',launchToken:'browser-session'});await assert.rejects(api.purchaseSeeds(1,1));
 await assert.rejects(api.resumeSeedPurchase({requestId:'another-original',landId:1,packs:1}),/FARM_SEED_RECOVERY_CONFLICT/);assert.equal(ids.length,2);assert.equal(new Set(ids).size,1);
});
