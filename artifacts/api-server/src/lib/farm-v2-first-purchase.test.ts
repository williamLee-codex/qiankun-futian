import { beforeEach,describe,expect,it,vi } from "vitest";
const {fetchMock}=vi.hoisted(()=>({fetchMock:vi.fn()}));
vi.mock("./farm-v2-platform-fetch",()=>({farmV2PlatformFetch:fetchMock}));
vi.mock("./farm-v2-platform",()=>({
 farmV2PlatformConnection:()=>({base:new URL("https://platform.example"),secret:"server-only"}),
 farmV2OperationBridgeHeaders:()=>({"x-replit-shared-secret":"server-only"}),
}));
import { farmFirstPurchasePlatformRequest } from "./farm-v2-first-purchase";
describe("first-purchase bridge",()=>{
 beforeEach(()=>fetchMock.mockReset());
 it("queries status through platform POST with server credentials",async()=>{
  fetchMock.mockResolvedValue({status:200,json:async()=>({plans:[],claimedDays:[]})});
  const r=await farmFirstPurchasePlatformRequest("verified-token","status");
  expect(r).toEqual({statusCode:200,body:{plans:[],claimedDays:[]}});
  const [url,init]=fetchMock.mock.calls[0];
  expect(url.toString()).toBe("https://platform.example/api/replit/farm-v2/first-purchase/status");
  expect(init.method).toBe("POST");
  expect(init.headers["x-replit-shared-secret"]).toBe("server-only");
  expect(JSON.parse(init.body)).toEqual({launchToken:"verified-token"});
 });
 it("sends only selected plan and day to platform",async()=>{
  fetchMock.mockResolvedValue({status:200,json:async()=>({status:"claimed"})});
  const r=await farmFirstPurchasePlatformRequest("verified-token","claim","B",2);
  expect(r.body).toEqual({status:"claimed"});
  const [url,init]=fetchMock.mock.calls[0];
  expect(url.pathname).toBe("/api/replit/farm-v2/first-purchase");
  expect(JSON.parse(init.body)).toEqual({launchToken:"verified-token",planId:"B",day:2});
 });
 it("preserves authorization failure and does not report a successful claim",async()=>{
  fetchMock.mockResolvedValue({status:401,json:async()=>({error:"INVALID_REPLIT_SECRET"})});
  const r=await farmFirstPurchasePlatformRequest("bad-token","claim","A",1);
  expect(r.statusCode).toBe(401);
  expect(r.body).toEqual({error:"INVALID_REPLIT_SECRET"});
 });
});
