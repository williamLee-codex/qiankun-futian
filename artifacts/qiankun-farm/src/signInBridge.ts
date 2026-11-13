/** Authenticated same-origin sign-in API. Never send user IDs or reward quantities. */
export type SignInSnapshot = {
  status:string; cycleNumber?:number; cycleDay?:number; signedDays?:number[];
  makeupDays?:number[]; makeupCreditsAvailable?:number;
  todayClaimable?:boolean; todayClaimDay?:number|null;
  nextMakeupDay?:number|null; makeupClaimable?:boolean;
  nextMakeupRewardSupported?:boolean;
  perfectAttendanceReady?:boolean; perfectAttendanceClaimed?:boolean;
  pendingPerfectCycle?:number|null;
};
export type SignInBridge = {
  load:()=>Promise<SignInSnapshot>;
  claimToday:()=>Promise<{status:string}>;
  claimMakeup:(cycleDay:number)=>Promise<{status:string}>;
  claimPerfect:()=>Promise<{status:string}>;
};
const root='/api/farm-backend/farm/v2/signin';
async function request<T>(path:string,method:'GET'|'POST',body?:object):Promise<T>{
  const response=await fetch(root+path,{
    method,credentials:'same-origin',cache:'no-store',
    headers:method==='POST'?{'Content-Type':'application/json'}:undefined,
    body:body?JSON.stringify(body):undefined,
  });
  const payload:unknown=await response.json().catch(()=>null);
  if(!response.ok){
    const code=payload && typeof payload==='object' && 'status' in payload
      ? String((payload as {status:unknown}).status)
      : payload && typeof payload==='object' && 'error' in payload
        ? String((payload as {error:unknown}).error) : 'SIGNIN_BACKEND_UNAVAILABLE';
    throw new Error(code);
  }
  return payload as T;
}
export const signInBridge:SignInBridge={
  load:()=>request<SignInSnapshot>('','GET'),
  claimToday:()=>request('/claim','POST',{}),
  claimMakeup:(cycleDay)=>request('/makeup','POST',{cycleDay}),
  claimPerfect:()=>request('/perfect','POST',{}),
};
