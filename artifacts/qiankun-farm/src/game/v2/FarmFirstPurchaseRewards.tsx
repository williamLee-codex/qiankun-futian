import { useEffect,useMemo,useState } from "react";
import { createFarmV2Api } from "./farmV2ApiClient";
type Plan="A"|"B"|"C";
type Status={plans:{plan_id:Plan;paid_at:string;purchased_crystals:number;bonus_crystals_total:number}[];claimedDays:{plan_id:string;claim_day:number}[]};
// Canonical plan terms. Prices and crystal amounts mirror the platform's
// NewebPay catalog (crystal_60/180/360) and the first-purchase entitlement
// constraints; reward bundles mirror the server-side reward intent spec.
const plans:readonly {
  id:Plan;name:string;price:string;packageId:string;crystals:number;dailyCrystals:number;
  days:readonly [string,string][];
}[]=[
  {id:"A",name:"靈田初耕",price:"NT$390",packageId:"crystal_60",crystals:60,dailyCrystals:20,days:[
    ["第 1 天","水晶 ×20、蘊靈砂 ×6、隨機玄級盆栽 ×1"],
    ["第 2 天","水晶 ×20、九霄玉髓 ×3、收成雙倍符 ×4"],
    ["第 3 天","水晶 ×20、收成雙倍符 ×4、隨機地級盆栽 ×1"],
  ]},
  {id:"B",name:"仙田豐穰",price:"NT$990",packageId:"crystal_180",crystals:180,dailyCrystals:60,days:[
    ["第 1 天","水晶 ×60、蘊靈砂 ×18、隨機天級盆栽 ×1"],
    ["第 2 天","水晶 ×60、九霄玉髓 ×9、收成雙倍符 ×12"],
    ["第 3 天","水晶 ×60、收成雙倍符 ×12、隨機天級盆栽 ×1"],
  ]},
  {id:"C",name:"神田天賜",price:"NT$1,790",packageId:"crystal_360",crystals:360,dailyCrystals:120,days:[
    ["第 1 天","水晶 ×120、蘊靈砂 ×36、隨機仙級盆栽 ×1"],
    ["第 2 天","水晶 ×120、九霄玉髓 ×18、收成雙倍符 ×24"],
    ["第 3 天","水晶 ×120、收成雙倍符 ×24、隨機仙級盆栽 ×1"],
  ]},
];
function availableDay(paidAt:string){
 const day=(iso:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));
 const rewardDate=(iso:string)=>{const parts=day(iso);const value=(key:string)=>parts.find(p=>p.type===key)?.value??"0";return Date.UTC(Number(value("year")),Number(value("month"))-1,Number(value("day")))-(Number(value("hour"))<5?86400000:0);};
 if(Date.now()<Date.parse(paidAt))return 0;
 return Math.min(3,1+Math.floor((rewardDate(new Date().toISOString())-rewardDate(paidAt))/86400000));
}
export function FarmFirstPurchaseRewards({apiBaseUrl,launchToken}:{apiBaseUrl:string;launchToken:string}){
 const api=useMemo(()=>createFarmV2Api({baseUrl:apiBaseUrl,launchToken}),[apiBaseUrl,launchToken]);
 const [data,setData]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [error,setError]=useState(false);
 async function refresh(){try{setData(await api.readFirstPurchase());setMessage("");setError(false);}catch{setError(true);setMessage("首儲資料讀取失敗，請稍後重試");}}
 useEffect(()=>{void refresh();},[api]);
 async function claim(planId:Plan,day:1|2|3){
  if(busy)return;setBusy(true);
  try{const result=await api.claimFirstPurchase(planId,day);await refresh();setMessage(result.status==="claimed"?"領取成功":"領取結果："+result.status);}
  catch{setMessage("領取未確認，請重新查詢後再試，系統不會重複發獎");}
  finally{setBusy(false);}
 }
 return <section aria-label="首儲三日獎勵" style={{padding:"12px 0",display:"grid",gap:12}}>
  <p style={{margin:0}}>三種首儲方案各限購一次。付款完成後，每日 05:00（台灣時間）開放下一日獎勵，未領取可補領。每張卡依購買資格開放領取。</p>
  {error && <p role="alert">{message}<button type="button" onClick={()=>void refresh()} disabled={busy} style={{marginLeft:8}}>重新讀取</button></p>}
  {plans.map((plan)=>{
   const purchased=data?.plans.find(p=>p.plan_id===plan.id);const available=purchased?availableDay(purchased.paid_at):0;
   return <article key={plan.id} aria-label={`${plan.id} 方案 ${plan.name} 首儲獎勵`} style={{border:"1px solid #90794e",borderRadius:10,padding:12,background:"#16281f"}}>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
      <strong>{plan.id} 方案・{plan.name}・{plan.price}</strong>
      <span style={{fontSize:13,color:"#d4c6a5"}}>{plan.crystals} 水晶・每日贈 {plan.dailyCrystals} 水晶</span>
    </header>
    <div role="list" aria-label={`${plan.id} 方案三日獎勵卡`} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8,marginTop:8}}>
     {plan.days.map(([label,reward],i)=>{
      const day=(i+1) as 1|2|3;
      const claimed=data?.claimedDays.some(c=>c.plan_id===plan.id&&c.claim_day===day)??false;
      const open=!!purchased&&day<=available&&!claimed;
      const stateText=!purchased?"尚未購買":claimed?"已領取":day>available?"未開放":"可領取";
      return <div role="listitem" key={day} style={{border:open?"2px solid #ffe17b":"1px solid #4d6a58",borderRadius:9,padding:10,background:"#1b332a",display:"grid",gap:6}}>
        <strong style={{color:"#ffd76a"}}>{label}・{stateText}</strong>
        <span style={{fontSize:13,lineHeight:1.45}}>{reward}</span>
        <button type="button" disabled={busy||!open} onClick={()=>void claim(plan.id,day)}
          style={{padding:"6px 10px",border:"1px solid #bda66c",borderRadius:6,background:open?"#d6b76c":"#243b30",color:open?"#14221c":"#9fb2a6",cursor:open?"pointer":"not-allowed"}}>
          {claimed?"已領取":open?"領取獎勵":day>available&&purchased?"尚未開放":"未符合資格"}
        </button>
      </div>;
     })}
    </div>
    <form action="/api/checkout/create" method="post" target="_top" style={{marginTop:10}}>
      <input name="packageId" type="hidden" value={plan.packageId} />
      <button type="submit" style={{padding:"8px 14px",border:0,borderRadius:8,background:"#d6b76c",color:"#14221c",fontWeight:700,cursor:"pointer"}}>
        我要儲值（{plan.id} 方案 {plan.price}）
      </button>
    </form>
   </article>;
  })}
  {!error && message && <p role="status">{message}</p>}
  <button type="button" onClick={()=>void refresh()} disabled={busy}>重新查詢領獎狀態</button>
 </section>;
}
