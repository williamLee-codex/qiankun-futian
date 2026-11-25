export async function resolveFarmV2MutationSnapshot<T>(
  result: unknown,
  read: () => Promise<T>,
): Promise<T> {
  if (result && typeof result === "object" && "snapshot" in result) {
    const snapshot = result.snapshot;
    if (snapshot && typeof snapshot === "object" &&
      "player" in snapshot && "lands" in snapshot &&
      Array.isArray(snapshot.lands) && snapshot.player &&
      typeof snapshot.player === "object" && "warehouseState" in snapshot.player) {
      return snapshot as T;
    }
  }
  // Compatibility with servers that do not yet support snapshot responses.
  return read();
}
