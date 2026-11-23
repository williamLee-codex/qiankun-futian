import { useEffect,useMemo,useRef,useState } from "react";
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
// The three empty bars painted at the foot of each day column of the approved
// art (A/C 1774x887, B 1672x941) now carry the claim state.
const BAR_LEFT = [5.0, 36.2, 67.4];
const BAR_TOP = 72;
const BAR_W = 28.2;
const BAR_H = 12;
const RECHARGE_ICON = "/farm-v2/images/farm/recharge-cta.png";
const SWIPE_MIN = 40;

const arrowBase:React.CSSProperties = {
  position:"absolute",top:"50%",transform:"translateY(-50%)",width:"clamp(28px,4vw,52px)",height:"clamp(28px,4vw,52px)",
  borderRadius:"50%",border:"2px solid #f0c14b",background:"rgba(24,14,4,.72)",color:"#ffe9a8",
  fontSize:"clamp(18px,2.6vw,32px)",fontWeight:900,lineHeight:1,padding:0,zIndex:3,
  display:"grid",placeItems:"center",
};

export function FarmFirstPurchaseRewards({apiBaseUrl,launchToken}:{apiBaseUrl:string;launchToken:string}){
 const api=useMemo(()=>createFarmV2Api({baseUrl:apiBaseUrl,launchToken}),[apiBaseUrl,launchToken]);
 const [data,setData]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [error,setError]=useState(false);
 const [bannerFailures,setBannerFailures]=useState<Partial<Record<Plan,boolean>>>({});
 const [iconFailures,setIconFailures]=useState<Partial<Record<Plan,boolean>>>({});
 const [index,setIndex]=useState(0);
 const touchStart=useRef<number|null>(null);
 const plan=plans[index];
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
 function go(delta:number){setIndex(current=>Math.min(plans.length-1,Math.max(0,current+delta)));}
 function onTouchStart(event:React.TouchEvent){touchStart.current=event.touches[0]?.clientX??null;}
 function onTouchEnd(event:React.TouchEvent){
  const start=touchStart.current;touchStart.current=null;
  if(start==null)return;
  const delta=(event.changedTouches[0]?.clientX??start)-start;
  if(Math.abs(delta)>=SWIPE_MIN)go(delta<0?1:-1);
 }
 const purchased=data?.plans.find(p=>p.plan_id===plan.id);
 const available=purchased?availableDay(purchased.paid_at):0;
 return <section aria-label="首儲三日獎勵" style={{display:"grid",gap:6}}>
  {error && <p role="alert" style={{margin:0,fontSize:"clamp(10px,1.2vw,15px)",color:"#ffd0c0"}}>{message}
    <button type="button" onClick={()=>void refresh()} disabled={busy} style={{marginLeft:8}}>重新讀取</button></p>}
  <div role="group" aria-roledescription="輪播" aria-label={`首儲方案 ${index+1}／${plans.length}：${plan.name} ${plan.price}`}
    onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{position:"relative",touchAction:"pan-y"}}>
   <article aria-label={`${plan.id} 方案 ${plan.name} 首儲獎勵`} style={{position:"relative",padding:0,background:"transparent"}}>
    {!bannerFailures[plan.id] && <div style={{position:"relative",marginTop:0}}>
      <img
        src={`/farm-v2/first-purchase/${plan.id}.png`}
        alt={`${plan.name}三日獎勵：${plan.days.map(([day,reward])=>`${day} ${reward}`).join("；")}`}
        onError={()=>setBannerFailures(current=>({...current,[plan.id]:true}))}
        style={{display:"block",width:"100%",height:"auto",borderRadius:9}}
      />
      {plan.days.map(([,],i)=>{
        const day=(i+1) as 1|2|3;
        const claimed=data?.claimedDays.some(c=>c.plan_id===plan.id&&c.claim_day===day)??false;
        const open=!!purchased&&day<=available&&!claimed;
        const label=claimed?"已領取":open?"點擊領取":purchased?`第${day}天尚未開放`:"購買後開放";
        return <button type="button" key={day} disabled={busy||!open} onClick={()=>void claim(plan.id,day)}
          aria-label={`${plan.name}第${day}天：${label}`}
          style={{position:"absolute",left:`${BAR_LEFT[i]}%`,top:`${BAR_TOP}%`,width:`${BAR_W}%`,height:`${BAR_H}%`,background:"transparent",border:0,padding:0,cursor:open?"pointer":"default",
            display:"grid",placeItems:"center",fontSize:"clamp(9px,1.35vw,20px)",fontWeight:800,letterSpacing:1,
            color:claimed?"#ffe9a8":open?"#fff6c8":"#e8dfc4",textShadow:"0 2px 4px #123018",whiteSpace:"nowrap"}}>
          {label}
        </button>;
      })}
    </div>}
    {bannerFailures[plan.id] && <div role="list" aria-label={`${plan.id} 方案三日獎勵卡`} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8,marginTop:8}}>
      {plan.days.map(([label,reward],i)=><div role="listitem" key={i} style={{border:"1px solid #4d6a58",borderRadius:9,padding:10,background:"#1b332a"}}>
        <strong style={{color:"#ffd76a"}}>{label}</strong><p style={{fontSize:13}}>{reward}</p>
      </div>)}
    </div>}
    <form action="/api/checkout/create" method="post" target="_top" style={iconFailures[plan.id]?{margin:0}:{position:"absolute",left:"0.6%",top:"0.6%",width:"11%",zIndex:2,margin:0}}>
      <input name="packageId" type="hidden" value={plan.packageId} />
      <button type="submit" aria-label={`我要儲值（${plan.id} 方案 ${plan.price}）`}
        style={iconFailures[plan.id]
          ? {marginTop:10,padding:"8px 14px",border:0,borderRadius:8,background:"#d6b76c",color:"#14221c",fontWeight:700,cursor:"pointer"}
          : {display:"block",width:"100%",aspectRatio:1,padding:0,border:0,background:"transparent",cursor:"pointer"}}>
        {iconFailures[plan.id]
          ? `我要儲值（${plan.id} 方案 ${plan.price}）`
          : <img src={RECHARGE_ICON} alt="" onError={()=>setIconFailures(current=>({...current,[plan.id]:true}))} style={{display:"block",width:"100%",height:"100%"}} />}
      </button>
    </form>
   </article>
   <button type="button" aria-label="上一檔首儲方案" onClick={()=>go(-1)} disabled={index===0}
     style={{...arrowBase,left:"-2%",opacity:index===0?0.25:1,cursor:index===0?"default":"pointer"}}>‹</button>
   <button type="button" aria-label="下一檔首儲方案" onClick={()=>go(1)} disabled={index===plans.length-1}
     style={{...arrowBase,right:"-2%",opacity:index===plans.length-1?0.25:1,cursor:index===plans.length-1?"default":"pointer"}}>›</button>
  </div>
  <div role="tablist" aria-label="首儲方案切換" style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8}}>
   {plans.map((item,i)=>
    <button type="button" role="tab" key={item.id} aria-selected={i===index} aria-label={`${item.name} ${item.price}`}
      onClick={()=>setIndex(i)}
      style={{padding:"2px 10px",borderRadius:999,border:i===index?"1px solid #f0c14b":"1px solid transparent",
        background:i===index?"rgba(240,193,75,.22)":"transparent",color:i===index?"#ffe9a8":"#cbb894",
        fontSize:"clamp(9px,1.1vw,14px)",fontWeight:i===index?800:600,cursor:"pointer"}}>
      {item.price}
    </button>)}
  </div>
  {!error && message && <p role="status" style={{margin:0,fontSize:"clamp(10px,1.2vw,15px)"}}>{message}</p>}
 </section>;
}
