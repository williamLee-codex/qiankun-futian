export function farmV2ErrorDiagnostic(error: unknown): Record<string, string> {
  const diagnostic: Record<string, string> = {};
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const item = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof item.code === "string" && /^[0-9A-Z]{5}$/.test(item.code))
      diagnostic.sqlState = item.code;
    if (typeof item.message === "string" && /^FARM_[A-Z0-9_]{1,90}$/.test(item.message))
      diagnostic.domainCode = item.message;
    current = item.cause;
  }
  return diagnostic;
}
