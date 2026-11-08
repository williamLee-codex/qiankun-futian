/** Presentation only: do not reinterpret an uncertain transaction as failed. */
export function farmV2ErrorMessage(code: string): string {
  if (
    /AUTH_REQUIRED|UNAUTHORIZED|NOT_AUTHORIZED|FORBIDDEN|SESSION|LAUNCH_TOKEN|LOGIN|TOKEN_EXPIRED/.test(
      code,
    )
  )
    return "登入已失效或未獲授權，請重新登入後查核原操作。";
  if (code === "MISSION_NOT_COMPLETE")
    return "任務尚未完成或已跨過重置時間，請更新農田確認當期進度；保留原請求紀錄。";
  if (code === "MISSION_ALREADY_CLAIMED")
    return "此任務獎勵已領取，請更新農田確認狀態；保留原請求紀錄。";
  if (/ENTRY_DISABLED/.test(code))
    return "農場 V2 尚未開放，請返回原農場入口。";
  if (/COMPENSATED/.test(code))
    return "原交易已補償，請重新查核庫存與錢包狀態。";
  if (
    /RECOVERY|COMPENSATING|RECONCILIATION|ATOMIC_JOURNAL|MUTATION_IN_PROGRESS/.test(
      code,
    )
  )
    return "原交易仍待查核或復原，請保留原請求，暫勿重新建立交易。";
  if (
    /TIMEOUT|RESULT_UNKNOWN|55P03|LOCK|UNAVAILABLE|Failed to fetch|timeout|aborted/i.test(
      code,
    )
  )
    return "尚無法確認交易結果。請重試同一項操作，系統會沿用原請求鍵；不要重新建立交易。";
  if (/INSUFFICIENT/.test(code)) return "餘額或庫存不足，請重新查核目前狀態。";
  if (/INVALID|REQUIRED/.test(code))
    return "操作資料不完整或不符合規則，請確認後再操作。";
  return "暫時無法確認操作結果，請稍後查核狀態。";
}
