export type FarmV2Stage = "authority_connect" | "authority_lock" | "authority_register" | "authority_begin" | "authority_end" | "paid_access" | "domain_sow" | "domain_harvest" | "domain_purchase" | "domain_exchange" | "snapshot_settle" | "snapshot_read" | "platform_validate" | "platform_wallet" | "platform_other";
export async function measureFarmV2Stage<T>(stage: FarmV2Stage, run: () => Promise<T>, traceId?: string): Promise<T> {
  const allowed = new Set<string>(["authority_connect", "authority_lock", "authority_register", "authority_begin", "authority_end", "paid_access", "domain_sow", "domain_harvest", "domain_purchase", "domain_exchange", "snapshot_settle", "snapshot_read", "platform_validate", "platform_wallet", "platform_other"]);
  if (!allowed.has(stage)) return run();
  const start = performance.now();
  let success = false;
  let sqlstate: string | undefined;
  const safeTraceId = typeof traceId === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(traceId) ? traceId : undefined;
  try {
    const result = await run();
    success = true;
    return result;
  } catch (error) {
    // Only the five-character SQLSTATE is diagnostic; never log the error message.
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) sqlstate = code;
    throw error;
  } finally {
    // Logging must never change a committed result or expose request/error data.
    try {
      console.info(JSON.stringify({ code: "FARM_V2_STAGE_TIMING", stage,
        durationMs: Math.round((performance.now() - start) * 10) / 10, success,
        ...(safeTraceId ? { traceId: safeTraceId } : {}),
        ...(sqlstate ? { sqlstate } : {}) }));
    } catch { /* Preserve the original operation result. */ }
  }
}

export function timeFarmV2Function<A extends unknown[], T>(stage: FarmV2Stage, run: (...args: A) => Promise<T>) {
  return (...args: A): Promise<T> => measureFarmV2Stage(stage, () => run(...args));
}
