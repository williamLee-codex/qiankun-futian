# Farm V2 FINAL implementation matrix

- Source: 御策羅盤｜乾坤福田 六田正式規格母表 V1.1.xlsx; SHA256 `6cff66614990543b9327e9b6f2f3a3dbf9b7fe2b79d851a333da3491fcadc74f`.
- Source: 御策羅盤｜乾坤福田 V2 Canonical Master.xlsx; SHA256 `24332f7d6b5d79818f234c660cedad11c57183e0f14e05332c07d05fbd1dbf49`.

All worksheets read: Sheet1 (0 rows), 六田基本規格 (7 rows), 正式規則 (29 rows), 修訂紀錄 (3 rows), RULES (219 rows), MASTER_DATA (181 rows), SUPERSEDED (20 rows), CHANGELOG (58 rows), IMPLEMENTATION (53 rows).

RULES: 209 FINAL rows; 208 effective FINAL rules. PET-REFUND-001 is still marked FINAL but explicitly replaced by PET-REFUND-002, SUPERSEDED and CHG-041. Only PET-REFUND-002 applies. IMPLEMENTATION contains historical audit notes, not current product rules.

Canonical overrides supplementary conflicts: pending cap=3, assist fields=2–5, borrow formula=ceil, farmer early guard, first chaos seed and cursor. Supplement initial farmer ON is applied only to new state; existing preferences are preserved.

Delivered before this batch: authenticated idempotent chaos claim, farmer per-land settings and lazy settlement, seven-day blessing and seed purchases. Preserved.

This batch: authenticated workshop API, Core-priced pot/decor/mission/pet/food/premium-formation transactions, unique persisted pot/decor instances and galleries, same-species one-grade synthesis, six display slots and lingyun, six cave decor positions with compatibility and collapse recovery, mission claims, pet feeding, formation switching, authoritative friend list and readonly cave projection. Frontend exposes real saved state and same-key interruption retry. See `farm-v2-workshop-delivery.md` for evidence and limits.

Remaining: final 2D cave/scene/art, decor gallery images, rest-position pet rendering and official festival/RPG acquisition mappings. Approved exterior scene originals are integrated; see `farm-v2-approved-scene-integration.md`. Interior/pet character art remains outside this batch. POT-ATOMIC-001/POT-GALLERY-004 now have isolated verification of a same-database Core/Farm transaction; production co-location, restricted roles and cutover remain BLOCKED. Legacy cross-database journals retain a Saga, **not a single ACID transaction**. See `farm-v2-atomic-pot-release-gate.md`. No production acceptance is claimed.

| Rule ID | Module | Status |
|---|---|---|
| PET-FOOD-001 | 靈寵 | Server logic + management UI; isolated local verification, not production acceptance |
| PET-ACTIVE-001 | 靈寵 | PARTIAL: backend operation delivered; final scene/remaining ownership sources pending |
| PET-SWAP-001 | 靈寵 | Server logic + management UI; isolated local verification, not production acceptance |
| FRIEND-BORROW-DAILY-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| FRIEND-ASSIST-DAILY-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| FRIEND-BORROW-CD-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| FRIEND-ASSIST-CD-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| FARMER-FRIEND-001 | 專屬農夫 | Pending integration or focused verification |
| FARMER-FRIEND-002 | 專屬農夫 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| FARMER-SETTLE-001 | 專屬農夫 | Implemented in server/client; local validation |
| CAVE-POSE-001 | 洞府 | Pending integration or focused verification |
| CAVE-ALCHEMY-001 | 洞府 | Pending integration or focused verification |
| CAVE-HONOR-001 | 洞府 | Pending integration or focused verification |
| FARM-LAND-001 | 福田 | Pending integration or focused verification |
| FARM-SOW-001 | 福田 | Approved exterior + real API popup/sowing locally verified; remaining visual subrules/production acceptance pending |
| FARM-MATURE-001 | 福田 | Server maturity/status on calibrated approved scene; remaining visual subrules/production acceptance pending |
| FARM-HARVEST-001 | 福田 | Approved exterior + real API popup/harvest locally verified; remaining visual subrules/production acceptance pending |
| FARM-NEWBIE-001 | 福田 | Pending integration or focused verification |
| FARM-EXCHANGE-001 | 福田 | Pending integration or focused verification |
| SEED-MARKET-001 | 商店 | Pending integration or focused verification |
| SEED-MARKET-002 | 商店 | Implemented in server/client; local validation |
| LAND-UNLOCK-001 | 福田 | Pending integration or focused verification |
| LAND-UNLOCK-002 | 福田 | Pending integration or focused verification |
| CHAOS-SEED-001 | 福田 | Pending integration or focused verification |
| CHAOS-SEED-002 | 福田 | Pending integration or focused verification |
| CHAOS-SEED-003 | 福田 | Pending integration or focused verification |
| MISSION-D-001 | 任務 | Server logic + management UI; isolated local verification, not production acceptance |
| MISSION-W-001 | 任務 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-GRADE-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-RATIO-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-RATIO-002 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-COST-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-DISPLAY-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-GALLERY-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-GALLERY-002 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| FRIEND-CAP-001 | 好友 | Pending integration or focused verification |
| BORROW-001 | 好友 | Pending integration or focused verification |
| BORROW-002 | 好友 | Pending integration or focused verification |
| BORROW-003 | 好友 | Pending integration or focused verification |
| ASSIST-001 | 好友 | Pending integration or focused verification |
| ASSIST-002 | 好友 | Pending integration or focused verification |
| FRIEND-REL-001 | 好友 | Pending integration or focused verification |
| PET-EFFECT-001 | 靈寵 | Pending integration or focused verification |
| PET-EFFECT-002 | 靈寵 | Pending integration or focused verification |
| PET-EFFECT-003 | 靈寵 | Pending integration or focused verification |
| WAREHOUSE-001 | 福田倉庫 | Pending integration or focused verification |
| LINGYUN-001 | 洞府 | Server logic + management UI; isolated local verification, not production acceptance |
| LINGYUN-SLOT-001 | 洞府 | Server logic + management UI; isolated local verification, not production acceptance |
| LINGYUN-FX-001 | 洞府 | Pending integration or focused verification |
| CAVE-VISIT-001 | 洞府 | PARTIAL: real API scene interaction delivered; final artwork ASSET BLOCKED |
| CAVE-NAV-001 | 洞府 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| CAVE-SHOT-001 | 洞府 | Pending integration or focused verification |
| FORMATION-001 | 洞府護陣 | Pending integration or focused verification |
| FORMATION-PAID-001 | 洞府護陣 | Pending integration or focused verification |
| FORMATION-FEST-001 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-ATTEND-001 | 洞府護陣 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| POT-BONUS-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-BONUS-002 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-DISPLAY-002 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-DISPLAY-003 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| FRIEND-CAP-002 | 好友 | Pending integration or focused verification |
| DONGFU-SLOT-001 | 洞府 | Pending integration or focused verification |
| DONGFU-SLOT-002 | 洞府 | Pending integration or focused verification |
| DECOR-CORE-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-CORE-002 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-CORE-003 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-VERSION-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-GALLERY-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-GALLERY-002 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| FORMATION-CORE-002 | 洞府護陣 | PARTIAL: backend operation delivered; final scene/remaining ownership sources pending |
| FORMATION-CORE-003 | 洞府護陣 | Server logic + management UI; isolated local verification, not production acceptance |
| FORMATION-SOURCE-001 | 洞府護陣 | Pending integration or focused verification |
| FORMATION-ATTEND-002 | 洞府護陣 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| FORMATION-HISTORY-001 | 洞府護陣 | Pending integration or focused verification |
| PAID-MILESTONE-001 | 付費里程碑 | Pending integration or focused verification |
| PAID-MILESTONE-002 | 付費里程碑 | Pending integration or focused verification |
| PAID-MILESTONE-003 | 付費里程碑 | Pending integration or focused verification |
| LAND-SUSPEND-001 | 福田 | Pending integration or focused verification |
| CHAOS-SUSPEND-001 | 福田 | Pending integration or focused verification |
| CAVE-EXTERIOR-001 | 洞府 | Pending integration or focused verification |
| PET-REST-001 | 靈寵 | Pending integration or focused verification |
| CAVE-INTERIOR-001 | 洞府 | Pending integration or focused verification |
| CAVE-RPGREF-001 | 洞府 | Pending integration or focused verification |
| CAVE-ALCHEMY-002 | 洞府 | Pending integration or focused verification |
| MISSION-CLAIM-001 | 任務 | Server logic + management UI; isolated local verification, not production acceptance |
| MISSION-CLAIM-002 | 任務 | Server logic + management UI; isolated local verification, not production acceptance |
| MISSION-EXCHANGE-001 | 任務 | Pending integration or focused verification |
| EXCHANGE-ATOMIC-001 | 福田 | Pending integration or focused verification |
| EXCHANGE-CHOICE-001 | 福田 | Pending integration or focused verification |
| POT-ATOMIC-001 | 盆栽 | Same-DB Core/Farm ACID locally verified; legacy Saga preserved; production topology/cutover BLOCKED |
| POT-UPGRADE-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-NOREVERSE-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-LOCATION-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-UPGRADE-CHOICE-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-VISUAL-001 | 盆栽 | Pending integration or focused verification |
| FRIEND-REQUEST-001 | 好友 | Pending integration or focused verification |
| FRIEND-REMOVE-001 | 好友 | Pending integration or focused verification |
| FRIEND-BLOCK-001 | 好友 | Pending integration or focused verification |
| FRIEND-CAP-003 | 好友 | Pending integration or focused verification |
| BORROW-RESULT-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| ASSIST-RESULT-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| ASSIST-RACE-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| PET-OWN-001 | 靈寵 | PARTIAL: backend operation delivered; final scene/remaining ownership sources pending |
| PET-ACTIVE-002 | 靈寵 | Server logic + management UI; isolated local verification, not production acceptance |
| PET-EFFECT-004 | 靈寵 | Pending integration or focused verification |
| FARMER-PREF-001 | 專屬農夫 | Implemented in server/client; local validation |
| FARMER-SEED-001 | 專屬農夫 | Implemented in server/client; local validation |
| FARMER-SCOPE-001 | 專屬農夫 | Pending integration or focused verification |
| FARMER-CHAOS-001 | 專屬農夫 | Implemented in server/client; local validation |
| FARMER-NEWBIE-001 | 專屬農夫 | Implemented in server/client; local validation |
| FARMER-ACCESS-001 | 專屬農夫 | Pending integration or focused verification |
| CAVE-FIXED-001 | 洞府 | Pending integration or focused verification |
| CAVE-CUSHION-001 | 洞府 | Pending integration or focused verification |
| CAVE-THEME-001 | 洞府 | Pending integration or focused verification |
| CAVE-HONOR-002 | 洞府 | Pending integration or focused verification |
| CAVE-HONOR-003 | 洞府 | Pending integration or focused verification |
| CAVE-CHAR-001 | 洞府 | Pending integration or focused verification |
| CAVE-NOSTAT-001 | 洞府 | Pending integration or focused verification |
| TITLE-001 | RPG稱號 | Pending integration or focused verification |
| TITLE-002 | RPG稱號 | Pending integration or focused verification |
| BORROW-ORDER-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| BORROW-QILIN-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| BORROW-SUANNI-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| BORROW-TING-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| BORROW-COOLDOWN-002 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| ASSIST-ORDER-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| FRIEND-SERVER-001 | 好友 | Pending integration or focused verification |
| CHAOS-CURSOR-001 | 福田 | Implemented in server/client; local validation |
| CHAOS-CLAIM-001 | 福田 | Implemented in server/client; local validation |
| CHAOS-OFFLINE-001 | 福田 | Pending integration or focused verification |
| TX-IDEMPOTENCY-001 | 福田 | Pending integration or focused verification |
| DECOR-PURCHASE-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-LOCATION-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-COMPAT-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-UNIQUE-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| CAVE-RENDER-001 | 洞府 | Pending integration or focused verification |
| CAVE-RESPONSIVE-001 | 洞府 | Independent native-ratio exterior layouts and bounded dialogs locally verified at 1280/390/320px; production acceptance pending |
| CAVE-ASSETFAIL-001 | 洞府 | Pending integration or focused verification |
| FARM-SCENE-001 | 福田 | Pending integration or focused verification |
| FARM-SCENE-002 | 福田 | Pending integration or focused verification |
| FARM-TIMER-001 | 福田 | Pending integration or focused verification |
| ASTRA-AUTH-001 | 治理 | Pending integration or focused verification |
| ASTRA-BLOCK-001 | 治理 | Pending integration or focused verification |
| ASTRA-SUPERSEDED-001 | 治理 | Pending integration or focused verification |
| LAND-STATE-001 | 福田 | Pending integration or focused verification |
| LAND-STATE-002 | 福田 | Pending integration or focused verification |
| LAND-UNLOCK-003 | 福田 | Pending integration or focused verification |
| PAID-STATE-001 | 付費里程碑 | Pending integration or focused verification |
| LAND6-FIRST-001 | 福田 | Pending integration or focused verification |
| SEED-ASSET-001 | 福田倉庫 | Pending integration or focused verification |
| SEED-ASSET-002 | 福田倉庫 | Pending integration or focused verification |
| WAREHOUSE-CAT-001 | 福田倉庫 | Pending integration or focused verification |
| WAREHOUSE-SORT-001 | 福田倉庫 | Pending integration or focused verification |
| POT-CONFIRM-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-GALLERY-003 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-GALLERY-004 | 盆栽 | Inventory/display/gallery/reward commit together locally verified; production topology/cutover BLOCKED |
| LINGYUN-CALC-001 | 洞府 | Server logic + management UI; isolated local verification, not production acceptance |
| LINGYUN-NOSTAT-001 | 洞府 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-ARRANGE-001 | 洞府陳設 | Pending integration or focused verification |
| DECOR-ARRANGE-002 | 洞府陳設 | Pending integration or focused verification |
| DECOR-NOTSIZE-001 | 洞府陳設 | Pending integration or focused verification |
| CAVE-POT-VISUAL-001 | 洞府外觀 | Pending integration or focused verification |
| CAVE-PLAQUE-001 | 洞府外觀 | Pending integration or focused verification |
| CAVE-OWNER-001 | 洞府 | Pending integration or focused verification |
| CAVE-VISIT-002 | 洞府 | PARTIAL: real API scene interaction delivered; final artwork ASSET BLOCKED |
| CAVE-VISIT-003 | 洞府 | PARTIAL: real API scene interaction delivered; final artwork ASSET BLOCKED |
| FORMATION-ATTEND-003 | 洞府護陣 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| FORMATION-FEST-002 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-EXPIRE-001 | 洞府護陣 | Server logic + management UI; isolated local verification, not production acceptance |
| FORMATION-EFFECT-001 | 洞府護陣 | Pending integration or focused verification |
| FORMATION-RPG-002 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| RULE-PROVENANCE-001 | 治理 | Pending integration or focused verification |
| RULE-ID-001 | 治理 | Pending integration or focused verification |
| NEWBIE-ANCHOR-001 | 福田 | Pending integration or focused verification |
| NEWBIE-SCOPE-001 | 福田 | Pending integration or focused verification |
| UNLOCK-ATOMIC-001 | 福田 | Pending integration or focused verification |
| PAID-REWARD-001 | 付費里程碑 | Pending integration or focused verification |
| BORROW-MATURE-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| ASSIST-NOPET-001 | 好友 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| PET-REST-002 | 靈寵 | Four approved-scene rest targets and live ownership locally verified; character art/production acceptance pending |
| POT-SPECIES-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-SLOT-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| POT-SIZE-001 | 盆栽 | Pending integration or focused verification |
| POT-NUMBER-001 | 盆栽 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-RELEASE-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-PRICE-001 | 洞府陳設 | Server logic + management UI; isolated local verification, not production acceptance |
| DECOR-GALLERY-003 | 洞府陳設 | Pending integration or focused verification |
| FORMATION-NOUPGRADE-001 | 洞府護陣 | Pending integration or focused verification |
| FORMATION-PREMIUM-001 | 洞府護陣 | Server logic + management UI; isolated local verification, not production acceptance |
| FORMATION-ATTEND-004 | 洞府護陣 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |
| CAVE-BRAND-001 | 洞府 | Pending integration or focused verification |
| CAVE-NEXT-001 | 洞府外觀 | Pending integration or focused verification |
| PET-REFEED-001 | 靈寵 | Server logic + management UI; isolated local verification, not production acceptance |
| DAILY-TZ-001 | 好友/任務 | Pending integration or focused verification |
| PET-REFUND-002 | 靈寵 | Pending integration or focused verification |
| FORMATION-RPG-PROP-001 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-RPG-PROP-002 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-RPG-PROP-003 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-RPG-PROP-004 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-RPG-PROP-005 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-EVENT-PROP-001 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-EVENT-PROP-002 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-EVENT-PROP-003 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-EVENT-PROP-004 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| FORMATION-SOURCE-PROP-001 | 洞府護陣 | PARTIAL: trusted source adapter implemented; official source mapping/code configuration BLOCKED |
| WEEKLY-TZ-001 | 任務 | Pending integration or focused verification |
| MONTHLY-TZ-001 | 洞府護陣 | Pending integration or focused verification |
| FORMATION-ATTEND-005 | 洞府護陣 | Server/API integrated; focused isolated local verification; final artwork/production acceptance pending |

Current delivery evidence and strict atomicity remediation: [friend/scene delivery](farm-v2-friend-scene-delivery.md).
