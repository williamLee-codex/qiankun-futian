# Farm Preview latency measurement — 2026-11-03

Baseline real UI exchange: 5 first-land crops consumed, 1 coin credited, one ledger entry; API 2016 ms. Harvest 1987 ms, sow 723 ms, seed purchase 1698 ms. These totals include platform/network/DB work, not phase measurements.

Adds bounded FARM_V2_STAGE_TIMING logs with static stage, durationMs, success only. No token, identity, body, URL, exception, SQL or credentials. Logging failure cannot replace transaction results. Nested stages overlap and must not be added together; platform fetch measures response headers, not JSON parsing. Authority end can finish after response delivery; it is recorded separately.

Stages: connection acquisition, advisory lock wait, authority begin/end, launch validation, wallet HTTP, domain commands, paid-access reconciliation, settlement and snapshot read. No cache/permission/transaction/ledger/timeout changes. Existing Preview project only; no schema or asset changes.

Verification: Node 5/5 tests, timing helper TypeScript noEmit pass. Existing full API integration suite not run locally; deployed build and health to be verified. Real phase evidence requires one authenticated request after deployment. Current crop exchange baseline request: 7ff50d96-9528-4519-8324-f1f694fc8df9.
