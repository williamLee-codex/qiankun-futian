import { useCallback, useEffect, useRef, useState } from "react";

export type DailyActivitySnapshot = {
  status: string;
  day: string;
  points: number;
  maximum: number;
  tasks: { id: string; label: string; target: number; progress: number; complete: boolean }[];
  milestones: { activity: number; reward: string; eligible: boolean; claimed: boolean }[];
};

export function FarmDailyActivityPanel(props: {
  read: () => Promise<DailyActivitySnapshot>;
  claim: (milestone: number) => Promise<DailyActivitySnapshot>;
  onReward: () => unknown;
}) {
  const [snapshot, setSnapshot] = useState<DailyActivitySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setBusy(true);
    try {
      const result = await props.read();
      if (current !== sequence.current) return;
      if (result.status !== "ready" || result.tasks.length !== 6) throw new Error("not_ready");
      setSnapshot(result);
      setError("");
    } catch {
      if (current !== sequence.current) return;
      setSnapshot(null);
      setError("每日活躍資料暫時無法讀取，請重新讀取後再領獎");
    } finally { if (current === sequence.current) setBusy(false); }
  }, [props.read]);
  useEffect(() => { void refresh(); return () => { sequence.current += 1; }; }, [refresh]);
  const claim = async (milestone: number) => {
    if (busy) return;
    const current = ++sequence.current;
    setBusy(true);
    try {
      const result = await props.claim(milestone);
      if (current !== sequence.current) return;
      if (result.tasks?.length === 6) setSnapshot(result);
      if (!["claimed", "already_claimed"].includes(result.status)) {
        setError(result.status === "recovery_required" ? "尚有未完成交易，請先在農田重試原交易，再領取獎勵" : result.status === "locked" ? "活躍度尚未達到這項獎勵門檻" : "獎勵尚未領取，請重新讀取後重試");
        return;
      }
      setError("");
      if (result.status === "claimed") await props.onReward();
    } catch {
      if (current !== sequence.current) return;
      setSnapshot(null);
      setError("尚未確認領獎結果，請重新讀取；同一階段不會重複發獎");
    } finally { if (current === sequence.current) setBusy(false); }
  };
  return <section aria-label="每日活躍任務">
    <h3>每日活躍</h3>
    <p>每日 05:00 更新六項任務，每項 20 活躍度；獎勵請自行領取</p>
    {snapshot && <>
      <p>{snapshot.day}・活躍度 <strong>{snapshot.points} / 120</strong></p>
      <ul style={{ paddingLeft: 22 }}>
        {snapshot.tasks.map(task => <li key={task.id} style={{ padding: "6px 0" }}>
          <span>{task.label}</span>・{task.progress}/{task.target}・{task.complete ? "已完成 +20" : "未完成"}
        </li>)}
      </ul>
      <div aria-label="每日活躍獎勵" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {snapshot.milestones.map(milestone => <article key={milestone.activity} style={{ border: "1px solid #90703d", borderRadius: 8, padding: 10 }}>
          <p>{milestone.activity} 活躍・{milestone.reward}</p>
          <button type="button" disabled={busy || !milestone.eligible || milestone.claimed}
            aria-label={milestone.claimed ? `${milestone.activity} 活躍獎勵已領取` : `領取 ${milestone.activity} 活躍獎勵`}
            onClick={() => void claim(milestone.activity)}>{milestone.claimed ? "已領取" : "領取獎勵"}</button>
        </article>)}
      </div>
    </>}
    {busy && !snapshot && <p role="status">正在讀取每日活躍…</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()}>重新讀取每日活躍</button>
  </section>;
}
