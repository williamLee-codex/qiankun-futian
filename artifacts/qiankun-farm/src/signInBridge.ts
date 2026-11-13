/** Authenticated same-origin sign-in API. Never send user IDs or reward quantities. */
export type SignInSnapshot = {
  status:string; cycleNumber?:number; cycleDay?:number; signedDays?:number[];
  makeupDays?:number[]; makeupCreditsAvailable?:number;
  todayClaimable?:boolean; todayClaimDay?:number|null;
  nextMakeupDay?:number|null; makeupClaimable?:boolean;
  nextMakeupRewardSupported?:boolean;
  perfectAttendanceReady?:boolean; perfectAttendanceClaimed?:boolean;
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
  if(!response.ok)throw new Error('SIGNIN_BACKEND_UNAVAILABLE');
  return response.json() as Promise<T>;
}
export const signInBridge:SignInBridge={
  load:()=>request<SignInSnapshot>('','GET'),
  claimToday:()=>request('/claim','POST',{}),
  claimMakeup:(cycleDay)=>request('/makeup','POST',{cycleDay}),
  claimPerfect:()=>request('/perfect','POST',{}),
};
