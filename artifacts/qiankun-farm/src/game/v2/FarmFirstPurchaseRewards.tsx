import { useEffect,useMemo,useState } from "react";
import { createFarmV2Api } from "./farmV2ApiClient";
type Plan="A"|"B"|"C";
type Status={plans:{plan_id:Plan;paid_at:string;purchased_crystals:number;bonus_crystals_total:number}[];claimedDays:{plan_id:string;claim_day:number}[]};
const plans:[Plan,string,number][]=[["A","NT$390",20],["B","NT$990",60],["C","NT$1,790",120]];
function availableDay(paidAt:string){
 const day=(iso:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));
 const rewardDate=(iso:string)=>{const parts=day(iso);const value=(key:string)=>parts.find(p=>p.type===key)?.value??"0";return Date.UTC(Number(value("year")),Number(value("month"))-1,Number(value("day")))-(Number(value("hour"))<5?86400000:0);};
 if(Date.now()<Date.parse(paidAt))return 0;
 return Math.min(3,1+Math.floor((rewardDate(new Date().toISOString())-rewardDate(paidAt))/86400000));
}
export function FarmFirstPurchaseRewards({apiBaseUrl,launchToken}:{apiBaseUrl:string;launchToken:string}){
 const api=useMemo(()=>createFarmV2Api({baseUrl:apiBaseUrl,launchToken}),[apiBaseUrl,launchToken]);
 const [data,setData]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function refresh(){try{setData(await api.readFirstPurchase());setMessage("");}catch{setMessage("首儲資料讀取失敗，請稍後重試");}}
 useEffect(()=>{void refresh();},[api]);
 async function claim(planId:Plan,day:1|2|3){
  if(busy)return;setBusy(true);
  try{const result=await api.claimFirstPurchase(planId,day);await refresh();setMessage(result.status==="claimed"?"領取成功":"領取結果："+result.status);}
  catch{setMessage("領取未確認，請重新查詢後再試，系統不會重複發獎");}
  finally{setBusy(false);}
 }
 return <section aria-label="首儲三日獎勵" style={{padding:"12px 0"}}>
  <p>三種首儲方案各限購一次。每日 05:00（台灣時間）開放下一日獎勵，未領取可補領。</p>
  {plans.map(([id,price,crystals])=>{
   const purchased=data?.plans.find(p=>p.plan_id===id);const available=purchased?availableDay(purchased.paid_at):0;
   return <div key={id} style={{border:"1px solid #90794e",borderRadius:8,padding:10,marginBottom:10}}>
    <strong>{id} 方案 {price}</strong><p>{purchased?"已購買":"尚未購買"} · 每日贈送 {crystals} 水晶，共三日</p>
    {([1,2,3] as const).map(day=>{
     const claimed=data?.claimedDays.some(c=>c.plan_id===id&&c.claim_day===day);
     return <button type="button" key={day} disabled={busy||!purchased||day>available||claimed}
      onClick={()=>void claim(id,day)} style={{marginRight:8,marginBottom:6,padding:"6px 10px",border:"1px solid #bda66c",borderRadius:6}}>
      第 {day} 天 · {claimed?"已領取":day>available?"未開放":"領取"}
     </button>;
    })}
   </div>;
  })}
  {message&&<p role="status">{message}</p>}
  <button type="button" onClick={()=>void refresh()} disabled={busy}>重新查詢領獎狀態</button>
 </section>;
}
