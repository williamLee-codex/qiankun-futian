# Farm V2 integrated repair and release checklist

Base: qiankun-futian@34919cee625aeadd4cd21d0c44961a304de9a08a.
Branch: codex/farm-v2-nine-repairs-20261121.

## Constraints
Preserve V1 /farm, approved artwork, player data, authentication, OAuth, membership, and existing links. No unrelated applications or database changes. One integrated repair branch and review. Production promotion requires tested dependencies and a recorded rollback target.

## Integrated acceptance matrix
All rows start NOT VERIFIED. Unit tests alone do not constitute functional acceptance.

| Item | Existing implementation | Required acceptance |
|---|---|---|
| Dual wallet | FarmCoinWallet / wallet saga | in/out, amount controls, insufficient funds, retry without duplicate debit, balances |
| 30-day attendance | FarmDailyActivityPanel | approved art, 30 clickable days, make-up, reward persistence |
| First purchase | FarmFirstPurchaseRewards | three approved cards, checkout links, reward states, no nested scrollbar |
| Bag | FarmWorkshopPanel | approved art/icons, categories, authoritative quantities |
| Warehouse | FarmV2AuthenticatedView | crops/materials, harvest refresh, synthesis deduction |
| Newbie x6 | FarmNewbieBoost / harvest | single close, countdown, six lands multiplier |
| Pets | FarmWorkshopPanel | individual images, abilities/descriptions, existing unlock/feed state |
| Sow / harvest | authenticated view / scene layer | flights, countdown, buy seeds, four stages |
| Cave P0 | FarmSceneInteractionLayer | enter, nonzero image/canvas, six restored controls, panel operations, return, desktop/mobile |

## Execution
- [x] Verify live alias and staged deployment via Vercel API. Alias remains dpl_5RevYhC86a7QzHZR3WazdJbCGtmj; staged 62b1450b is READY.
- [x] Isolate work from unrelated RPG checkout and preserve existing dirty worktrees.
- [ ] Reproduce regressions with component tests and desktop/mobile browser evidence.
- [ ] Apply minimal V2-only repairs preserving approved assets and transaction authority.
- [ ] Run TypeScript, Vitest, node tests, production build, API compatibility and isolation checks.
- [ ] Run real authenticated end-to-end acceptance; distinguish fixtures from live data.
- [ ] Review complete diff, commit, PR, CI, stage release, verify exact artifact SHA.
- [ ] Promote only safe accepted milestones; capture alias/commit and post-release operations. Roll back on regression.

## Verified engineering results (not production functional acceptance)
- Farm frontend, API, script TypeScript checks and project-reference build completed with exit 0.
- Vitest: 74 files passed, 4 skipped; 337 tests passed, 58 skipped. Skips remain excluded from acceptance.
- Required Node suites: 52 passed, 0 failed.
- Farm API bundle and frontend production build completed. Frontend was rebuilt using BASE_PATH=/farm-v2/ and VITE_FARM_API_BASE_URL=/api/farm-backend/; the bundle contains the repaired UI.
- Real Chrome: reproduced production cave blank. Canvas measured about 1023x576, but the scene wrapper inherited visibility:hidden. This establishes ancestor visibility as the observed cause; zero height was not observed.
- Real Chrome local fixture: desktop and 390x844 mobile entered cave, displayed original art and six slot controls, opened existing decor panel, and returned to farm. This fixture performs no production writes and does not prove persistence.
- Four approved pet description PNGs and two material PNGs installed unchanged from existing Drive assets; source IDs and SHA256 recorded in farm-v2-approved-assets-20261121.json.
- Main-site wallet shortcut suppresses an enabled Farm API when the host switch is absent. Main integration delegates to API by default, retaining explicit 0 fallback and existing credential/origin checks; two Node tests pass.
- Independent code review found no confirmed significant introduced defect. Live wallet transfers, decor persistence, sign-in/makeup claims, harvest settlement, synthesis deduction, first-purchase entitlement claims, and six-field server multipliers still require authenticated acceptance.
