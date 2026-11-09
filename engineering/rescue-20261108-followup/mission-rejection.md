# Mission rejection replay — 2026-11-09 Asia/Taipei

On the isolated Supabase project the earlier MISSION_D01 request was PENDING with no wallet plan, amount, response, primary ledger entry, receipt or inverse transaction. Existing recovery inspection returned REPLAY_ORIGINAL_HANDLER. No historical journal was edited.

New definitive mission rejections retain the original code in the journal only before any wallet plan, amount or response. An identical request returns the same rejection even after progress becomes eligible. The browser removes those definitive outcomes from the retry list while unknown 409 outcomes retain the request key.

Node 24 with local PostgreSQL 17.11 and isolated platform migration fixtures: `pnpm exec vitest run artifacts/api-server/src/lib/farm-v2-wallet-saga.integration.test.ts artifacts/qiankun-farm/src/game/v2/farmV2ApiClient.test.ts` passed 60 with 2 browser skips. Added client-specific rejection cases passed in a subsequent 17-test client run. `pnpm run typecheck` passed before the two client test cases were added. Tests verified rejected replay after fresh eligibility retains zero wallet intent and no additional reward. Deployment/browser acceptance remains outstanding.
