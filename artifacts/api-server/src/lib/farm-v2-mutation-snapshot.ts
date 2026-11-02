export async function completeFarmV2Mutation<T extends object, S>(input: {
  mutate: () => Promise<T>;
  settle: () => Promise<unknown>;
  read: () => Promise<S>;
}) {
  const result = await input.mutate();
  // A replayed mutation receipt is historical. Always read current committed
  // state after settlement rather than attaching state to the durable receipt.
  await input.settle();
  const snapshot = await input.read();
  return { ...result, snapshot };
}
