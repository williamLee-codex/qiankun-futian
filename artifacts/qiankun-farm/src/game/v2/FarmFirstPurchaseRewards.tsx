import { useEffect,useMemo,useState } from "react";
import { createFarmV2Api } from "./farmV2ApiClient";
type Plan="A"|"B"|"C";
type Status={plans:{plan_id:Plan;paid_at:string;purchased_crystals:number;bonus_crystals_total:number}[];claimedDays:{plan_id:string;claim_day:number}[]};
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
const BAR_LEFT = [5.0, 36.2, 67.4];
const BAR_TOP = 72;
const BAR_W = 28.2;
const BAR_H = 12;
const RECHARGE_ICON = "/farm-v2/images/farm/recharge-cta.png";
const planArt=(plan:Plan)=>`/farm-v2/first-purchase/${plan}.png`;
const dayArt=(plan:Plan,day:number)=>`/farm-v2/first-purchase/daily/${plan}-${day}.png`;

function useWide(){
 const [wide,setWide]=useState(()=>typeof window!=="undefined"&&window.matchMedia("(min-width:900px)").matches);
 useEffect(()=>{
  const query=window.matchMedia("(min-width:900px)");
  const sync=()=>setWide(query.matches);
  sync();query.addEventListener("change",sync);
  return ()=>query.removeEventListener("change",sync);
 },[]);
 return wide;
}

export function FarmFirstPurchaseRewards({apiBaseUrl,launchToken}:{apiBaseUrl:string;launchToken:string}){
 const api=useMemo(()=>createFarmV2Api({baseUrl:apiBaseUrl,launchToken}),[apiBaseUrl,launchToken]);
 const [data,setData]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [error,setError]=useState(false);
 const [artFailures,setArtFailures]=useState<Record<string,boolean>>({});
 const [iconFailures,setIconFailures]=useState<Partial<Record<Plan,boolean>>>({});
 const [selected,setSelected]=useState(0);
 const wide=useWide();
 async function refresh(){
  try{setData(await api.readFirstPurchase());setMessage("");setError(false);}
  catch(e){const status=(e as {status?:number})?.status;setError(true);
   setMessage(status?`首儲資料讀取失敗（HTTP ${status}），請稍後重試`:"首儲資料讀取失敗，請稍後重試");}
 }
 useEffect(()=>{void refresh();},[api]);
 async function claim(planId:Plan,day:1|2|3){
  if(busy)return;setBusy(true);
  try{const result=await api.claimFirstPurchase(planId,day);await refresh();setMessage(result.status==="claimed"?"領取成功":"領取結果："+result.status);}
  catch{setMessage("領取未確認，請重新查詢後再試，系統不會重複發獎");}
  finally{setBusy(false);}
 }
 function state(planId:Plan){
  const purchased=data?.plans.find(p=>p.plan_id===planId);
  const available=purchased?availableDay(purchased.paid_at):0;
  const claimed=[1,2,3].map(day=>data?.claimedDays.some(c=>c.plan_id===planId&&c.claim_day===day)??false);
  const pending=[1,2,3].find(day=>day<=available&&!claimed[day-1])??0;
  // A purchased plan shows the art of the day it is on: the first claimable
  // day, otherwise the latest unlocked day.
  const shownDay=purchased?(pending||Math.min(available,3)):0;
  return {purchased,available,claimed,pending,shownDay};
 }
 function PlanCard({index,compact}:{index:number;compact?:boolean}){
  const plan=plans[index];
  const s=state(plan.id);
  const src=s.shownDay?dayArt(plan.id,s.shownDay):planArt(plan.id);
  const failed=artFailures[src];
  return <article aria-label={`${plan.id} 方案 ${plan.name} 首儲獎勵`} style={{position:"relative",minWidth:0}}>
   {!failed && <div style={{position:"relative"}}>
     <img src={src} alt={`${plan.name}${s.shownDay?`第 ${s.shownDay} 天`:""}三日獎勵`}
       onError={()=>setArtFailures(current=>({...current,[src]:true}))}
       style={{display:"block",width:"100%",height:"auto",borderRadius:9}} />
     {plan.days.map(([,],i)=>{
       const day=(i+1) as 1|2|3;
       const claimed=s.claimed[i];
       const open=!!s.purchased&&day<=s.available&&!claimed;
       const label=claimed?"已領取":open?"點擊領取":s.purchased?`第${day}天尚未開放`:"購買後開放";
       return <button type="button" key={day} disabled={busy||!open} onClick={()=>void claim(plan.id,day)}
         aria-label={`${plan.name}第${day}天：${label}`}
         style={{position:"absolute",left:`${BAR_LEFT[i]}%`,top:`${BAR_TOP}%`,width:`${BAR_W}%`,height:`${BAR_H}%`,background:"transparent",border:0,padding:0,cursor:open?"pointer":"default",
           display:"grid",placeItems:"center",fontSize:compact?"clamp(8px,1.1vw,16px)":"clamp(9px,1.35vw,20px)",fontWeight:800,letterSpacing:1,
           color:claimed?"#ffe9a8":open?"#fff6c8":"#e8dfc4",textShadow:"0 2px 4px #123018",whiteSpace:"nowrap"}}>
         {label}
       </button>;
     })}
   </div>}
   {failed && <div role="list" aria-label={`${plan.id} 方案三日獎勵卡`} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8}}>
     {plan.days.map(([label,reward],i)=><div role="listitem" key={i} style={{border:"1px solid #4d6a58",borderRadius:9,padding:10,background:"#1b332a"}}>
       <strong style={{color:"#ffd76a"}}>{label}</strong><p style={{fontSize:13}}>{reward}</p>
     </div>)}
   </div>}
   <form action="/api/checkout/create" method="post" target="_top" style={iconFailures[plan.id]?{margin:0}:{position:"absolute",left:"0.6%",top:"0.6%",width:"11%",zIndex:2,margin:0}}>
     <input name="packageId" type="hidden" value={plan.packageId} />
     <button type="submit" aria-label={`我要儲值（${plan.id} 方案 ${plan.price}）`}
       style={iconFailures[plan.id]
         ? {marginTop:8,padding:"8px 14px",border:0,borderRadius:8,background:"#d6b76c",color:"#14221c",fontWeight:700,cursor:"pointer"}
         : {display:"block",width:"100%",aspectRatio:1,padding:0,border:0,background:"transparent",cursor:"pointer"}}>
       {iconFailures[plan.id]
         ? `我要儲值（${plan.id} 方案 ${plan.price}）`
         : <img src={RECHARGE_ICON} alt="" onError={()=>setIconFailures(current=>({...current,[plan.id]:true}))} style={{display:"block",width:"100%",height:"100%"}} />}
     </button>
   </form>
  </article>;
 }
 if(!wide) return <section aria-label="首儲三日獎勵" style={{display:"grid",gap:12,padding:"4px 0"}}>
  {error && <p role="alert" style={{margin:0,fontSize:14,color:"#ffd0c0"}}>{message}
    <button type="button" onClick={()=>void refresh()} disabled={busy} style={{marginLeft:8}}>重新讀取</button></p>}
  {plans.map((plan,i)=><div key={plan.id}><PlanCard index={i} compact /></div>)}
  {!error && message && <p role="status" style={{margin:0,fontSize:14}}>{message}</p>}
 </section>;
 return <section aria-label="首儲三日獎勵" style={{display:"grid",gap:10,padding:"4px 0"}}>
  {error && <p role="alert" style={{margin:0,fontSize:15,color:"#ffd0c0"}}>{message}
    <button type="button" onClick={()=>void refresh()} disabled={busy} style={{marginLeft:8}}>重新讀取</button></p>}
  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 190px",gap:12,alignItems:"start"}}>
   <PlanCard index={selected} />
   <div role="tablist" aria-label="首儲方案切換" style={{display:"grid",gap:8}}>
    {plans.map((plan,i)=>
     <button type="button" role="tab" key={plan.id} aria-selected={i===selected} aria-label={`${plan.name} ${plan.price}`}
       onClick={()=>setSelected(i)}
       style={{padding:0,border:i===selected?"2px solid #f0c14b":"2px solid transparent",borderRadius:9,background:"transparent",cursor:"pointer",position:"relative"}}>
       <img src={planArt(plan.id)} alt="" style={{display:"block",width:"100%",height:"auto",borderRadius:7}} />
       <span style={{position:"absolute",left:0,right:0,bottom:0,padding:"2px 4px",fontSize:12,fontWeight:800,
         color:"#ffe9a8",background:"rgba(10,18,14,.72)",borderRadius:"0 0 7px 7px"}}>{plan.price}</span>
     </button>)}
   </div>
  </div>
  {!error && message && <p role="status" style={{margin:0,fontSize:15}}>{message}</p>}
 </section>;
}
