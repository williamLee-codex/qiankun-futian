import { farmV2PlatformConnection, farmV2OperationBridgeHeaders } from "./farm-v2-platform";
import { farmV2PlatformFetch } from "./farm-v2-platform-fetch";

export async function farmFirstPurchasePlatformRequest(
 launchToken: string,
 action: "status" | "claim",
 planId?: "A" | "B" | "C",
 day?: 1 | 2 | 3,
): Promise<{statusCode:number; body:unknown}> {
 const {base,secret} = farmV2PlatformConnection();
 const path = action === "status"
   ? "/api/replit/farm-v2/first-purchase/status"
   : "/api/replit/farm-v2/first-purchase";
 const response = await farmV2PlatformFetch(new URL(path,base),{
   method:"POST",redirect:"error",cache:"no-store",
   headers:{"content-type":"application/json",...farmV2OperationBridgeHeaders(launchToken,secret)},
   body:JSON.stringify({launchToken,...(action === "claim" ? {planId,day} : {})}),
   signal:AbortSignal.timeout(10000),
 });
 return {statusCode:response.status,body:await response.json().catch(()=>({error:"INVALID_PLATFORM_RESPONSE"}))};
}
