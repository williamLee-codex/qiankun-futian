import { createDatabaseConnection, pool } from "@workspace/db";
import { farmAuthorityLockKey } from "./farm-v2-authority";
export type ReconciliationInput = {
  userId: string;
  requestId: string;
  caseId: string;
  actor: string;
  evidence: string;
  apply: boolean;
};
export type CoreOperatorRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<any>;
/** Operator-only service credentials. No browser route or player credential impersonation. */
export async function reconcileFarmWallet(
  input: ReconciliationInput,
  core: CoreOperatorRpc,
) {
  if (
    !/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestId) ||
    !input.userId ||
    !input.caseId ||
    !input.actor ||
    !input.evidence
  )
    throw new Error("RECONCILIATION_EVIDENCE_REQUIRED");
  const { pool: lockPool } = createDatabaseConnection({
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  const client = await lockPool.connect();
  const args = {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_case_id: input.caseId,
    p_actor: input.actor,
    p_evidence: input.evidence,
  };
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1,0))", [
      farmAuthorityLockKey(input.userId),
    ]);
    const journal = (
      await pool.query(
        "select * from farm_v2_mutation where user_id=$1 and request_id=$2",
        [input.userId, input.requestId],
      )
    ).rows[0];
    if (!journal) throw new Error("FARM_MUTATION_NOT_FOUND");
    const snapshot = await core("farm_v2_operator_wallet_reconcile", {
      ...args,
      p_mode: "inspect",
    });
    if (!input.apply)
      return {
        journalState: journal.transaction_state,
        primary: snapshot.primary,
        dryRun: true,
      };
    await pool.query(
      "insert into farm_v2_reconciliation_case(id,user_id,request_id,actor,evidence,status) values($1,$2,$3,$4,$5,'OPEN') on conflict(user_id,request_id) do nothing",
      [
        input.caseId,
        input.userId,
        input.requestId,
        input.actor,
        input.evidence,
      ],
    );
    const existingCase = (
      await pool.query(
        "select * from farm_v2_reconciliation_case where user_id=$1 and request_id=$2",
        [input.userId, input.requestId],
      )
    ).rows[0];
    if (existingCase.id !== input.caseId)
      throw new Error("RECONCILIATION_CASE_CONFLICT");
    const event = async (action: string, details: object = {}) =>
      pool.query(
        "insert into farm_v2_reconciliation_event(case_id,actor,action,evidence,details) values($1,$2,$3,$4,$5)",
        [input.caseId, input.actor, action, input.evidence, details],
      );
    await event("INSPECTED", {
      state: journal.transaction_state,
      primaryCount: snapshot.primary?.length,
    });
    if (Array.isArray(snapshot.primary) && snapshot.primary.length === 1) {
      const primary = snapshot.primary[0];
      const command = journal.wallet_transaction?.command;
      const fields = {
        amount: "amount",
        currency: "currency",
        direction: "direction",
        reason: "reason",
        referenceId: "reference_id",
        referenceType: "reference_type",
      };
      const action =
        /^(seed-purchase|crop-exchange):([1-6]):([1-9][0-9]*)$/.exec(
          journal.action,
        );
      const reference = /^([1-6]):([1-9][0-9]*)$/.exec(
        primary.reference_id ?? "",
      );
      const actionConflict =
        !action ||
        !reference ||
        action[2] !== reference[1] ||
        (action[1] === "seed-purchase"
          ? primary.reason !== "farm_seed_purchase" ||
            action[3] !== reference[2]
          : primary.reason !== "farm_crop_exchange" ||
            Number(reference[2]) > Number(action[3]));
      const conflict =
        command &&
        Object.entries(fields).some(
          ([intent, ledger]) => command[intent] !== primary[ledger],
        );
      const saved = journal.wallet_transaction?.result?.transaction;
      const summaryConflict = [
        [journal.wallet_amount, primary.amount],
        [journal.wallet_currency, primary.currency],
        [journal.wallet_direction, primary.direction],
      ].some(([expected, actual]) => expected != null && expected !== actual);
      if (
        actionConflict ||
        conflict ||
        summaryConflict ||
        (saved && saved.id !== primary.id)
      ) {
        await pool.query(
          "update farm_v2_reconciliation_case set status='ESCALATED',updated_at=now() where id=$1",
          [input.caseId],
        );
        await event("ESCALATED", { reason: "IMMUTABLE_INTENT_CONFLICT" });
        return { status: "ESCALATED" };
      }
    }
    // This waits for domain FOR SHARE locks. Once committed, every late callback
    // is fenced before writes; only then may Core authorization be settled.
    await pool.query(
      "update farm_v2_authorization_attempt set state='FENCED',settled_at=coalesce(settled_at,now()) where user_id=$1 and core_settled_at is null",
      [input.userId],
    );
    const attempts = (
      await pool.query(
        "select id from farm_v2_authorization_attempt where user_id=$1 and core_settled_at is null",
        [input.userId],
      )
    ).rows;
    for (const attempt of attempts) {
      await core("farm_v2_end_paid_operation", {
        p_user_id: input.userId,
        p_operation_id: attempt.id,
      });
      await pool.query(
        "update farm_v2_authorization_attempt set core_settled_at=now() where id=$1",
        [attempt.id],
      );
      await event("AUTHORIZATION_FENCED", { operationId: attempt.id });
    }
    // Acquire the exact mutation lock too: online compensation uses it.
    await client.query("select pg_advisory_lock(hashtextextended($1,0))", [
      input.userId + ":" + input.requestId,
    ]);
    const current = (
      await pool.query(
        "select * from farm_v2_mutation where user_id=$1 and request_id=$2",
        [input.userId, input.requestId],
      )
    ).rows[0];
    if (!Array.isArray(snapshot.primary) || snapshot.primary.length > 1) {
      await pool.query(
        "update farm_v2_reconciliation_case set status='ESCALATED',updated_at=now() where id=$1",
        [input.caseId],
      );
      await event("ESCALATED", { reason: "AMBIGUOUS_CORE_EVIDENCE" });
      return { status: "ESCALATED" };
    }
    if (
      existingCase.status === "CLOSED" &&
      current.transaction_state === "COMPENSATED"
    ) {
      const consistent =
        snapshot.closure?.outcome === "CANCELED"
          ? snapshot.primary.length === 0
          : snapshot.closure?.outcome === "COMPENSATED" &&
            snapshot.primary.length === 1 &&
            snapshot.compensation?.reversal_of === snapshot.primary[0].id;
      if (consistent) {
        await event("VERIFIED_CLOSED");
        return { status: "CLOSED" };
      }
      await pool.query(
        "update farm_v2_reconciliation_case set status='ESCALATED',updated_at=now() where id=$1",
        [input.caseId],
      );
      await event("ESCALATED", { reason: "CLOSED_CORE_EVIDENCE_CONFLICT" });
      return { status: "ESCALATED" };
    }
    if (
      current.response !== null ||
      current.transaction_state === "COMPLETED"
    ) {
      if (
        !Array.isArray(snapshot.primary) ||
        snapshot.primary.length !== 1 ||
        snapshot.compensation ||
        snapshot.closure
      ) {
        await pool.query(
          "update farm_v2_reconciliation_case set status='ESCALATED',updated_at=now() where id=$1",
          [input.caseId],
        );
        await event("ESCALATED", {
          reason: "COMPLETED_CORE_EVIDENCE_CONFLICT",
        });
        return { status: "ESCALATED" };
      }
      const saved = journal.wallet_transaction?.result?.transaction;
      if (saved && saved.id !== snapshot.primary[0].id)
        throw new Error("RECONCILIATION_EVIDENCE_CONFLICT");
      await pool.query(
        "update farm_v2_reconciliation_case set status='CLOSED',resolution='FARM_COMPLETED',updated_at=now() where id=$1",
        [input.caseId],
      );
      await event("CLOSED", { resolution: "FARM_COMPLETED" });
      return { status: "CLOSED", resolution: "FARM_COMPLETED" };
    }
    // Freeze normal retries before an authority-side inverse or cancellation.
    await pool.query(
      "update farm_v2_mutation set transaction_state='COMPENSATING',updated_at=now() where user_id=$1 and request_id=$2",
      [input.userId, input.requestId],
    );
    let result;
    try {
      result = await core("farm_v2_operator_wallet_reconcile", {
        ...args,
        p_mode: snapshot.primary.length === 1 ? "compensate" : "cancel",
      });
    } catch (error) {
      await event("RETRY_PENDING", { reason: "CORE_RESULT_UNCONFIRMED" });
      throw error;
    }
    if (!["created", "duplicate", "canceled"].includes(result.result_status)) {
      const status =
        result.result_status === "insufficient_funds"
          ? "NEEDS_FUNDS"
          : "ESCALATED";
      await pool.query(
        "update farm_v2_reconciliation_case set status=$2,updated_at=now() where id=$1",
        [input.caseId, status],
      );
      await event(status, { coreStatus: result.result_status });
      return { status };
    }
    await client.query("BEGIN");
    try {
      await client.query(
        "update farm_v2_mutation set transaction_state='COMPENSATED',failure_code='OPERATOR_RECONCILED',updated_at=now() where user_id=$1 and request_id=$2",
        [input.userId, input.requestId],
      );
      await client.query(
        "update farm_v2_reconciliation_case set status='CLOSED',resolution=$2,updated_at=now() where id=$1",
        [
          input.caseId,
          result.result_status === "canceled"
            ? "CORE_NO_EFFECT"
            : "CORE_INVERSE_CONFIRMED",
        ],
      );
      await client.query(
        "insert into farm_v2_reconciliation_event(case_id,actor,action,evidence,details) values($1,$2,'CLOSED',$3,$4)",
        [
          input.caseId,
          input.actor,
          input.evidence,
          {
            primaryId: snapshot.primary[0]?.id ?? null,
            reversalId: result.transaction?.id ?? null,
          },
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    return { status: "CLOSED" };
  } finally {
    client.release(true);
    await lockPool.end();
  }
}

export async function fenceFarmAuthorization(
  input: ReconciliationInput & { operationId: string },
  core: CoreOperatorRpc,
) {
  if (!input.actor || !input.evidence || !input.caseId)
    throw new Error("RECONCILIATION_EVIDENCE_REQUIRED");
  const { pool: lockPool } = createDatabaseConnection({
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  const client = await lockPool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1,0))", [
      farmAuthorityLockKey(input.userId),
    ]);
    const row = (
      await client.query(
        "select * from farm_v2_authorization_attempt where id=$1 and user_id=$2",
        [input.operationId, input.userId],
      )
    ).rows[0];
    if (!row) throw new Error("FARM_AUTHORIZATION_NOT_FOUND");
    if (!input.apply) return { authorization: row, dryRun: true };
    const request = "authorization:" + input.operationId;
    await client.query(
      "insert into farm_v2_reconciliation_case(id,user_id,request_id,actor,evidence,status) values($1,$2,$3,$4,$5,'OPEN') on conflict(user_id,request_id) do nothing",
      [input.caseId, input.userId, request, input.actor, input.evidence],
    );
    const existing = (
      await client.query(
        "select id from farm_v2_reconciliation_case where user_id=$1 and request_id=$2",
        [input.userId, request],
      )
    ).rows[0];
    if (existing.id !== input.caseId)
      throw new Error("RECONCILIATION_CASE_CONFLICT");
    await client.query(
      "update farm_v2_authorization_attempt set state='FENCED',settled_at=coalesce(settled_at,now()) where id=$1 and core_settled_at is null",
      [input.operationId],
    );
    await client.query(
      "insert into farm_v2_reconciliation_event(case_id,actor,action,evidence,details) values($1,$2,'AUTHORIZATION_FENCED',$3,$4)",
      [
        input.caseId,
        input.actor,
        input.evidence,
        { operationId: input.operationId },
      ],
    );
    await core("farm_v2_end_paid_operation", {
      p_user_id: input.userId,
      p_operation_id: input.operationId,
    });
    await client.query("BEGIN");
    try {
      await client.query(
        "update farm_v2_authorization_attempt set core_settled_at=now() where id=$1",
        [input.operationId],
      );
      await client.query(
        "update farm_v2_reconciliation_case set status='CLOSED',resolution='AUTHORIZATION_FENCED',updated_at=now() where id=$1",
        [input.caseId],
      );
      await client.query(
        "insert into farm_v2_reconciliation_event(case_id,actor,action,evidence,details) values($1,$2,'CLOSED',$3,$4)",
        [
          input.caseId,
          input.actor,
          input.evidence,
          { operationId: input.operationId },
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    return { status: "CLOSED", resolution: "AUTHORIZATION_FENCED" };
  } finally {
    client.release(true);
    await lockPool.end();
  }
}
