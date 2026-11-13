import {useEffect,useState} from 'react';
import type {SignInBridge,SignInSnapshot} from '../signInBridge';
export default function SignInDialog({bridge,onClose}:{bridge:SignInBridge;onClose:()=>void}){
 const [data,setData]=useState<SignInSnapshot|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;bridge.load().then(v=>{if(active)setData(v);})
 .catch(()=>{if(active)setError('簽到資料暫時無法讀取');});return()=>{active=false;};},[bridge]);
 async function submit(action:()=>Promise<{status:string}>){
  setBusy(true);setError('');
  try{const result=await action();
   if(result.status!=='claimed'&&result.status!=='already_claimed'&&result.status!=='already_signed')
    throw new Error(result.status);
   setData(await bridge.load());
  }catch{setError('操作未完成，請稍後再試；系統會防止重複發獎');}
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
   <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:5}}>
    {Array.from({length:30},(_,i)=>i+1).map(day=>
     <div key={day} aria-label={`第${day}天${signed.has(day)?'已簽到':''}`}
      style={{padding:'7px 2px',textAlign:'center',border:'1px solid #bfa67c',borderRadius:4,
       background:signed.has(day)?'#335b42':'transparent'}}>
      {day}{makeup.has(day)?' 補':signed.has(day)?' ✓':''}
     </div>)}
   </div>
   <p><button type="button" disabled={busy||!data?.todayClaimable}
    onClick={()=>submit(bridge.claimToday)}>領取今日簽到</button></p>
   {data?.makeupClaimable&&data.nextMakeupDay!=null&&<p>
    <button type="button" disabled={busy||!data.nextMakeupRewardSupported}
     onClick={()=>submit(()=>bridge.claimMakeup(data.nextMakeupDay!))}>
     補簽第 {data.nextMakeupDay} 天</button></p>}
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
