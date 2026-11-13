import { useEffect, useState } from 'react';

export type DailyActivitySnapshot = {
  initialized: boolean;
  activityDay: string;
  assignedTaskIds: string[];
  completedTaskIds: string[];
  points: number;
  claimedMilestones: number[];
  claimableMilestones: number[];
};
export type DailyActivityBridge = {
  /** Host authenticates the user; browser never supplies a userId or reward amount. */
  load: () => Promise<DailyActivitySnapshot>;
  claim: (milestone: 30 | 60 | 100) => Promise<{ status: string }>;
};
const titles: Record<string,string> = {
  plant_once:'播種一次',plant_5:'播種 5 株',plant_10:'播種 10 株',
  harvest_5:'收成 5 株',harvest_10:'收成 10 株',
  buy_seeds_once:'購買種子一次',buy_seeds_5:'購買種子 5 份',buy_seeds_10:'購買種子 10 份',
  synthesize_pot:'合成盆栽一次',place_pot:'放置或更換盆栽一次',
  open_warehouse:'查看倉庫',feed_pet:'餵食靈寵一次',view_pet:'查看靈寵狀態',
  friend_interaction:'好友互動一次',visit_friend:'拜訪好友農田',
  plant_distinct_2:'種植兩種靈植',harvest_distinct_2:'收成兩種靈植',
};
const rewards = [{milestone:30,label:'金幣 ×10'},{milestone:60,label:'隨機黃級盆栽 ×1'},{milestone:100,label:'蘊靈砂 ×1'}] as const;

export default function DailyActivityDialog({bridge,onClose}:{bridge:DailyActivityBridge;onClose:()=>void}) {
  const [snapshot,setSnapshot] = useState<DailyActivitySnapshot|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState<number|null>(null);
  useEffect(()=>{
    let active=true;
    bridge.load().then(v=>{if(active)setSnapshot(v);}).catch(()=>{if(active)setError('每日任務暫時無法讀取');});
    return ()=>{active=false;};
  },[bridge]);
  async function claim(milestone:30|60|100) {
    setBusy(milestone);setError('');
    try {
      const result=await bridge.claim(milestone);
      if(result.status!=='claimed' && result.status!=='already_claimed') throw new Error(result.status);
      setSnapshot(await bridge.load());
    } catch {setError('領取失敗，請稍後再試；不會重複發獎');}
    finally {setBusy(null);}
  }
  return <div className="coin-conversion-backdrop" onClick={e=>e.stopPropagation()}>
    <section className="coin-conversion-dialog" role="dialog" aria-modal="true" aria-label="每日活躍任務"
      style={{maxHeight:'80%',overflowY:'auto'}}>
      <h2>每日活躍任務</h2>
      <p>每天 05:00 更新六項任務，每項 20 分，最高 120 分</p>
      {snapshot && <p>今日活躍度：<strong>{snapshot.points} / 120</strong></p>}
      {snapshot?.initialized===false && <p>今日任務尚未初始化</p>}
      {snapshot?.assignedTaskIds.map(id=><p key={id}>
        {snapshot.completedTaskIds.includes(id)?'✓':'○'} {titles[id]??id}
        {snapshot.completedTaskIds.includes(id)?'　+20':''}
      </p>)}
      {rewards.map(({milestone,label})=>{
        const claimed=snapshot?.claimedMilestones.includes(milestone)??false;
        const available=snapshot?.claimableMilestones.includes(milestone)??false;
        // Only the 30-point coin award has an authoritative claim endpoint.
        const issuanceEnabled=milestone===30;
        return <p key={milestone}>{milestone} 分：{label}{' '}
          <button type="button" disabled={!issuanceEnabled||!available||claimed||busy!==null}
            onClick={()=>claim(milestone)}>{claimed?'已領取':!issuanceEnabled?'待開放':busy===milestone?'領取中…':'領取'}</button>
        </p>;
      })}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={onClose}>關閉</button>
    </section>
  </div>;
}
