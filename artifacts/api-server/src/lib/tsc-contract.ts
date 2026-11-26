/**
 * Transaction Safety Core: the interface a 御策羅盤 App implements to use the
 * shared transaction safety. Farm V2 is the first implementation; the fortune
 * Apps are expected to adopt it later without changing their own features.
 */
export type TscWalletScope = "central" | "farm";

export type TscRefusal = {
  code: string;
  wallet?: TscWalletScope;
  details?: Record<string, unknown>;
};

export type TscPrecheck = { ok: true } | ({ ok: false } & TscRefusal);

export type TscAnomalyClass =
  | "RESOURCE_SHORTAGE"
  | "AWAITING_CONFIRMATION"
  | "ASSET_LOCKED"
  | "COMPENSATED"
  | "UNRECOVERED";

export interface TransactionSafetyCore {
  /** Refuse before any journal, charge or reservation exists. */
  precheck(input: {
    app: string;
    userId: string;
    requestId: string;
    wallet: TscWalletScope;
    currency: "coin" | "crystal";
    amount: number;
  }): Promise<TscPrecheck>;
  /** Idempotent atomic charge: the same request and wallet charge once. */
  charge(input: {
    app: string;
    userId: string;
    requestId: string;
    wallet: TscWalletScope;
    currency: "coin" | "crystal";
    amount: number;
  }): Promise<{ transactionId: string; duplicate: boolean }>;
  /** Deliver the goods; a lost answer must be recoverable, never re-charged. */
  deliver(input: {
    app: string;
    userId: string;
    requestId: string;
    transactionId: string;
  }): Promise<{ delivered: boolean }>;
  /** Full coin refund when delivery is unconfirmed; crystals are excluded. */
  compensate(input: {
    app: string;
    userId: string;
    requestId: string;
    evidence: string;
  }): Promise<{ status: "posted" | "duplicate" | "not_due" | "failed" }>;
  /** Repair unresolved requests from a schedule, not from a resident process. */
  sweep(input: { owner: string; limit?: number }): Promise<{
    claimed: number;
    done: number;
    retried: number;
    abandoned: number;
  }>;
  /** Classify, never guess: a shortage is usage, not a fault. */
  classify(row: { severity: string }): TscAnomalyClass;
  /** Operator audit, isolated from players. */
  audit(input: { since: Date; limit?: number }): Promise<{ rows: unknown[] }>;
}
