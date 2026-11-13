import { SIGN_IN_MAKEUP_GRANT_DAYS, SIGN_IN_REWARDS, SIGN_IN_PERFECT_ATTENDANCE } from './farmV2Catalog';

export type SignInDay = number;
export type SignInCycle = Readonly<{
  signedDays: readonly SignInDay[];
  makeupDays: readonly SignInDay[];
  makeupCreditsUsed: number;
  perfectAttendanceClaimed: boolean;
}>;

export type SignInAction = Readonly<{
  kind: 'sign_in' | 'makeup' | 'claim_perfect';
  day?: number;
}>;

export function evaluateSignInAction(
  cycle: SignInCycle,
  todayCycleDay: number,
  action: SignInAction,
): { accepted: boolean; reason: string; reward?: typeof SIGN_IN_REWARDS[number] | typeof SIGN_IN_PERFECT_ATTENDANCE[number][] } {
  if (!Number.isInteger(todayCycleDay) || todayCycleDay < 1 || todayCycleDay > 30)
    return { accepted: false, reason: 'INVALID_CYCLE_DAY' };
  const signed = new Set(cycle.signedDays);
  const makeup = new Set(cycle.makeupDays);
  if ([...signed, ...makeup].some(d => !Number.isInteger(d) || d < 1 || d > 30))
    return { accepted: false, reason: 'INVALID_SIGN_IN_STATE' };
  if ([...makeup].some(d => !signed.has(d)) || !Number.isInteger(cycle.makeupCreditsUsed) || cycle.makeupCreditsUsed < 0)
    return { accepted: false, reason: 'INVALID_SIGN_IN_STATE' };
  if (action.kind === 'sign_in') {
    if (action.day !== todayCycleDay) return { accepted: false, reason: 'NOT_TODAY' };
    if (signed.has(todayCycleDay)) return { accepted: false, reason: 'ALREADY_SIGNED' };
    return { accepted: true, reason: 'READY', reward: SIGN_IN_REWARDS[todayCycleDay - 1] };
  }
  if (action.kind === 'makeup') {
    const day = action.day;
    if (!Number.isInteger(day) || day! < 1 || day! >= todayCycleDay)
      return { accepted: false, reason: 'NOT_PREVIOUS_DAY' };
    if (signed.has(day!)) return { accepted: false, reason: 'ALREADY_SIGNED' };
    const earned = SIGN_IN_MAKEUP_GRANT_DAYS.filter(d => d <= todayCycleDay).length;
    if (cycle.makeupCreditsUsed >= earned) return { accepted: false, reason: 'NO_MAKEUP_CREDITS' };
    // Makeup must proceed in chronological order of missed dates.
    for (let i = 1; i < day!; i++) if (!signed.has(i))
      return { accepted: false, reason: 'EARLIER_MISSED_DAY' };
    return { accepted: true, reason: 'READY', reward: SIGN_IN_REWARDS[day! - 1] };
  }
  if (action.kind === 'claim_perfect') {
    if (cycle.perfectAttendanceClaimed) return { accepted: false, reason: 'ALREADY_CLAIMED' };
    if (signed.size !== 30 || makeup.size > 0) return { accepted: false, reason: 'NOT_COMPLETE' };
    return { accepted: true, reason: 'READY', reward: [...SIGN_IN_PERFECT_ATTENDANCE] };
  }
  return { accepted: false, reason: 'UNKNOWN_ACTION' };
}
