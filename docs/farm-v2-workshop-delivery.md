# Farm V2 workshop delivery — local only

Base Farm commit: `57842d9d57324fa6a628caa9004a2dbe0ab962a8`. Both uploaded workbooks and all their worksheets remain the authority; 208 effective FINAL rules. Prior chaos/farmer/blessing/seed functions are preserved.

## Playable local operations

- `POST /farm/v2/workshop`: six-species, six-grade one-step synthesis; material and gross-gold affordability; distinct asset IDs; optional displayed input; replacement in the original species slot; immutable first acquisition gallery and once-only reward. Display/removal preserve one asset location.
- V2 DF001–DF018 decor purchase, permanent inventory instances, first gallery reward, six compatible locations, bilateral swap checks and automatic return to inventory when lingyun falls. The other 32 catalog entries are version metadata, not purchasable products.
- Existing daily/weekly mission progress is actively claimed through Core; currency, materials and claimed flag recover together. Old periods cannot be claimed.
- Direct dog/lion purchases retain their specified coin/crystal currencies. Food costs 2 coins; complete feeding consumes 1/2/3/4 and resets 24 hours; one active pet. Milestone pet feeding rechecks the current authority qualification.
- Permanent premium formation purchase: 388 crystal, no duplicate, no automatic activation; free exclusive switching/off; expiration removes timed rights without fallback or history. No attendance/festival/RPG grant source is invented.
- `GET /farm/v2/friends` and `/farm/v2/friends/:targetId/cave`: platform-owned active reciprocal relationships and active identities. Cave projection excludes warehouse, wallet, instance IDs and private RPG data. Removed/blocked/inactive relationships deny access. No friend borrow/assist write has been implemented.
- Management controls use real API snapshots, server actor identity, session validation, authority fences and the existing default-off entry gate. Interrupted commands expose same-key retry, including when the state read is blocked by a reservation.

## Integrity and important limitation

All Farm mutations lock the owner row. Pending workshop plans durably reserve inputs across the Core network boundary; another request cannot consume them. Request IDs bind the exact action. Recovery replays the immutable wallet intent, checks reserved snapshots, and commits asset/gallery/material/mission/pet changes in one Farm transaction. Permanent conflicts invoke the existing audited, once-only compensation and closure guards. Definitive insufficient funds releases inputs while retaining decline evidence; uncertain outcomes remain reserved.

Core enforces the exact canonical price/reward/reference/currency under its own wallet row lock, including **gross cost affordability before a first reward**. A single ledger posting records the net monetary effect; its canonical reference identifies gross cost and first reward separately. This does not count crystal spending or rewards as paid deposits. The Farm journal records explicit cost, reward and before/after snapshots.

**Core and Farm are separate transaction boundaries. This is a durable saga, not cross-database ACID.** A Core posting can precede the Farm commit; an interrupted operation is pending/recoverable, never reported as successful. Consequently strict POT-ATOMIC-001/POT-GALLERY-004 “all three in one atomic transaction” remains BLOCKED until an approved cross-database settlement design is provided. Compensation of a credit can also be delayed if that credit has been spent elsewhere; the existing reconciliation process must close it. Do not use local recovery tests as proof of strict atomicity or production acceptance.

## Local evidence

Results: Farm 72/72 across five focused suites (including 30 PostgreSQL integration tests and desktop/mobile browser acceptance), platform 8/8; both TypeScript checks and platform architecture checks passed. Farm API build and frontend build with loopback `VITE_FARM_API_BASE_URL=http://127.0.0.1:3000` passed; the latter bundle was checked to contain the workshop controls. Unconfigured production build remains fail-closed.

Necessary suites: Farm wallet saga PostgreSQL integration (original seed/crop/refund-barrier/closure tests included), workshop runtime, default-off entry routes, wallet client and API client; platform wallet/friends bridge tests; both TypeScript checks; platform layer boundaries; Farm API/frontend builds. Browser acceptance uses actual isolated PostgreSQL state and the production management component at desktop 1280×900 and mobile 390×844: synthesize, display, buy decor, place and remove, persisted inventory checks, no horizontal overflow.

The browser harness uses **test identity and a stubbed HTTP boundary invoking actual isolated Core RPCs**. It does not verify production login, deployment or real payment callbacks. Screenshots: `/tmp/farm-v2-workshop-desktop.png`, `/tmp/farm-v2-workshop-mobile.png`.

## Files and release dependencies

Farm implementation: `workshopRuntime.ts`, `decorCatalog.ts`, `FarmWorkshopPanel.tsx`, `farm-v2-workshop.ts`, `farm-v2-friends.ts`; routes/client/scene/idempotency/saga/error handling and focused tests. Full status matrix: `farm-v2-final-rule-matrix.md`.

Platform implementation: wallet reason schema, friends route/feature/platform adapter, and **new forward-only** `supabase/migrations/0130_farm_v2_workshop_wallet_contract.sql`.

0130 SHA256: `893d6e12194cf9467e8bc9af3565ad120b7e31eaa709f71efcc9429c4175c5e2`.

0123–0129 SQL is unchanged. 0130 extends the latest wallet wrapper, reconciliation reason allowlist and append-only closed-ledger guard; first-wallet creation, suspension row locks and 0128 transaction closure protections remain. It also adds a service-role-only friend-access RPC. Requires 0123→0124→0125→0126→0127→0128→0129, Core runtime and authoritative `platform_friendships`. Farm uses its existing JSON warehouse/player/mutation schema; no new Farm table or direct Drizzle push is needed.

**0130 is not yet registered in the existing seven-migration production version map/preflight.** That engineering review and version-history collision check is a release blocker, not a reason to claim the old tool Gate covers 0130. No formal SQL, data change, push, hosted build, merge or deployment was performed.

## Still missing

Friend borrow/assist two-owner authoritative transactions; exact final 2D cave and exterior scene, rest-position pets, decor/gallery images and configuration experience; attendance/festival/RPG source integration. The approved 0915 originals remain ASSET BLOCKED. Current management screens are operational controls, **not the completed final 2D game**. Production API/DB identification and migration/session/operational acceptance remain separate deployment gates.
