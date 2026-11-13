import {useEffect,useState} from 'react';
import type {SignInBridge,SignInSnapshot,ConsumableInventory} from '../signInBridge';
import {signInRewards} from '../signInRewards';
export default function SignInDialog({bridge,onClose}:{bridge:SignInBridge;onClose:()=>void}){
 const [data,setData]=useState<SignInSnapshot|null>(null);
 const [busy,setBusy]=useState(false);
 const [inventory,setInventory]=useState<ConsumableInventory|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;bridge.loadConsumables().then(v=>{if(active)setInventory(v);}).catch(()=>{});return()=>{active=false;};},[bridge]);
 useEffect(()=>{let active=true;bridge.load().then(v=>{if(active)setData(v);})
 .catch(()=>{if(active)setError('簽到資料暫時無法讀取');});return()=>{active=false;};},[bridge]);
 const errors:Record<string,string>={
  not_today:'今日尚未到簽到日期，或今天已完成簽到',
  not_past_day:'只能補簽今天以前的日期',
  no_makeup_credit:'補簽額度不足',
  earlier_day_missing:'請依照日期順序補簽',
  incomplete:'尚未完成本輪 30 天簽到',
  cycle_inactive:'本輪簽到已結束，請重新開啟日曆',
  cycle_not_found:'找不到本輪簽到資料',
  already_signed:'該日已完成簽到',
  inventory_overflow:'道具庫存已達上限',
  unverified_identity:'帳號身分尚未完成驗證',
  FARM_SESSION_NOT_ACTIVE:'登入已失效，請重新登入',
 };
 async function submit(action:()=>Promise<{status:string}>){
  setBusy(true);setError('');
  try{const result=await action();
   if(result.status!=='claimed'&&result.status!=='already_claimed'&&result.status!=='already_signed')
    throw new Error(result.status);
   setData(await bridge.load());
   try{setInventory(await bridge.loadConsumables());}catch{setInventory(null);}
  }catch(e){const code=e instanceof Error?e.message:'';
   setError(errors[code]??'操作未完成，請稍後再試；系統會防止重複發獎');}
  finally{setBusy(false);}
 }
 const signed=new Set(data?.signedDays??[]);
 const makeup=new Set(data?.makeupDays??[]);
 const pendingPriorCycle=data?.pendingPerfectCycle!=null && data.pendingPerfectCycle!==data.cycleNumber;
 const canClaimPerfect=Boolean(data?.perfectAttendanceReady) &&
   (pendingPriorCycle || !data?.perfectAttendanceClaimed);
 return <div className="coin-conversion-backdrop" onClick={e=>e.stopPropagation()}>
  <section className="coin-conversion-dialog" role="dialog" aria-modal="true" aria-label="30日簽到"
   style={{maxHeight:'82%',overflowY:'auto'}}>
   <h2>30 日簽到</h2>
   <p>依序簽到，補簽計入全勤。30 日完成後重置新週期。</p>
   {data?.cycleNumber!=null&&<p>第 {data.cycleNumber} 輪 · 今日第 {data.cycleDay??'—'} 天 · 補簽額度 {data.makeupCreditsAvailable??0}</p>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:5}}>
    {Array.from({length:30},(_,i)=>i+1).map(day=>
     <div key={day} aria-label={`第${day}天，${signInRewards[day-1]}，${makeup.has(day)?'已補簽':signed.has(day)?'已簽到':'未簽到'}`}
      style={{padding:'7px 3px',textAlign:'center',border:'1px solid #bfa67c',borderRadius:4,
       background:signed.has(day)?'#335b42':day===data?.cycleDay?'#56472d':'transparent'}}>
      <strong>第 {day} 天 {makeup.has(day)?'補':signed.has(day)?'✓':''}</strong>
      <div style={{fontSize:11,lineHeight:1.4}}>{signInRewards[day-1]}</div>
     </div>)}
   </div>
   <p><button type="button" disabled={busy||!data?.todayClaimable}
    onClick={()=>submit(bridge.claimToday)}>領取今日簽到</button></p>
   {data?.makeupClaimable&&data.nextMakeupDay!=null&&<p>
    <button type="button" disabled={busy||!data.nextMakeupRewardSupported}
     onClick={()=>submit(()=>bridge.claimMakeup(data.nextMakeupDay!))}>
     補簽第 {data.nextMakeupDay} 天</button></p>}
   {inventory&&<div aria-label="功能道具庫存">
    <strong>目前功能道具庫存</strong>
    <p>瞬收符 ×{inventory.instant_harvest} · 收成雙倍符 ×{inventory.double_harvest} · 靈田保護（1小時）×{inventory.farm_protection_1h}</p>
    <p>黃級升級符 ×{inventory.yellow_upgrade} · 玄級升級符 ×{inventory.mystic_upgrade}</p>
   </div>}
   <p>全勤獎勵：徽章 ×1、水晶 ×3、金幣 ×200、蘊靈砂 ×2、九霄玉髓 ×2</p>
   {pendingPriorCycle && <p>第 {data?.pendingPerfectCycle} 輪全勤獎勵尚未領取，可補領。</p>}
   <button type="button" disabled={busy||!canClaimPerfect}
    onClick={()=>submit(bridge.claimPerfect)}>
    {!canClaimPerfect && data?.perfectAttendanceClaimed?'全勤已領取':pendingPriorCycle?'補領上一輪全勤':'領取全勤獎勵'}</button>
   {error&&<p role="alert">{error}</p>}
   <p><button type="button" onClick={onClose}>關閉</button></p>
  </section>
 </div>;
}
