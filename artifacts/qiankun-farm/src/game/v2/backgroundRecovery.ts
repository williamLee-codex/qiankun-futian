export type RecoveryPlan =
  | { action: "idle" }
  | { action: "retry"; delayMs: number; attempt: number }
  | { action: "give_up"; reason: "permanent" | "attempts_exhausted" };

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 300_000;
const MAX_ATTEMPTS = 8;

/**
 * Background recovery never guesses: a permanent failure stops at once, and a
 * bounded exponential backoff keeps a broken request from hammering the server.
 */
export function planBackgroundRecovery(input: {
  attempts: number;
  permanent: boolean;
  nextAt: number | null;
  now: number;
}): RecoveryPlan {
  if (input.permanent) return { action: "give_up", reason: "permanent" };
  if (input.attempts >= MAX_ATTEMPTS) return { action: "give_up", reason: "attempts_exhausted" };
  if (input.nextAt !== null && input.now < input.nextAt) return { action: "idle" };
  const attempt = input.attempts + 1;
  return {
    action: "retry",
    attempt,
    delayMs: Math.min(BASE_DELAY_MS * 2 ** input.attempts, MAX_DELAY_MS),
  };
}
