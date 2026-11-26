# Approved Farm V2 scene integration

Date: 2026-10-10 (Asia/Taipei). Base: `74a290fe37e48a40abaf46ab3f2538f6c0c3dde0`.

The user explicitly confirmed the two existing platform files, by their dimensions and SHA-256, as the approved originals. This supersedes the earlier uncertainty about their Farm V1 history. The files were copied byte-for-byte, not regenerated, cropped or re-encoded.

| Farm public file | Dimensions | SHA-256 |
| --- | --- | --- |
| `artifacts/qiankun-farm/public/images/farm/farm-scene-desktop.png` | 1215 × 1295 | `706748aef924482d9a7a7bd5398b2080572ae8c919056b1a855c1822e1b69382` |
| `artifacts/qiankun-farm/public/images/farm/farm-scene-mobile.png` | 941 × 1672 | `d5a2faf9b01e3bad2978f5b52ee583e1ad995c353df4aeaa6b1cf92ad7511288` |

The public URL is `<BASE_URL>images/farm/farm-scene-{desktop|mobile}.png`. This repository's actual Vite public directory is `artifacts/qiankun-farm/public`, not a new unused root-level `public` directory. Desktop and mobile keep their independent native aspect ratios and coordinates. The full scene is displayed with `object-fit: contain`, without a viewport-height crop; shorter screens scroll vertically.

## Delivered changes

- Six field hotspots align with the two rows of colored fields in each image. Cave entry aligns with the cave mouth; formation interaction aligns with the central circular platform. Four pet hotspots align with the left-side rest platforms. Six pot display controls are on the desktop porch and the mobile lower paved approach, away from pet/field targets.
- Click a field to open its existing server-backed operation card. Sowing, harvesting, seed purchases and crop exchange keep the existing API client and server authority. The old inline action buttons were moved into the operation dialog to avoid extending beyond the mobile field.
- Formation, pet and pot hotspots open the existing corresponding workshop panel. Existing navigation remains accessible below the scene. Dialogs use bounded viewport dimensions, internal scrolling, readable opaque backgrounds, keyboard dismissal and focus trapping. No new gameplay operation was added.
- Maturity, inventory and ownership still come from existing server data. No local save fallback, synthetic game state, new animation, wallet change or production configuration change was introduced. The existing cave interior and readonly visit logic were preserved; the exterior artwork does not establish a new finished interior illustration or new pet character art.

## Local verification

- Scene geometry, exact PNG bytes/dimensions and API-to-scene adapter: **8 tests passed**. The new asset regression test failed before the files were installed and passed afterward.
- Targeted Chromium acceptance: **1 test passed**, 46 unrelated integration cases intentionally not selected. Viewports: desktop 1280×900, phone 390×844, narrow phone 320×568. Verified correct popup for all six field centers, both devices' real sow and harvest requests, cave entry/return, all four pet and six pot targets, formation target, image natural/rendered ratios, dialog boundaries/opaque background and no horizontal overflow. JavaScript page errors: none.
- Game state used a fresh loopback-only PostgreSQL database. The test supplies an isolated identity/session fixture and calls the real Farm API client and backend sow/harvest functions over HTTP. It does not verify production launch authentication, production hosting or database topology. No browser request route interception or fake asset results are used.
- Database evidence after device flows: 40 first-field seeds consumed, field-2 crop inventory 20→30, field-3 inventory 20→26, four COMPLETED mutation records. The first field is reset only inside the isolated test fixture between device flows so each device can independently demonstrate sowing.
- Workspace TypeScript and Farm frontend production build: **PASS**. No unrelated full suite, GitHub Actions or hosted build was run.

Screenshots produced by the acceptance run:

- `/tmp/farm-v2-approved-desktop.png`
- `/tmp/farm-v2-approved-mobile.png`
- `/tmp/farm-v2-approved-mobile-320.png`
- `/tmp/farm-v2-approved-desktop-dialog.png`
- `/tmp/farm-v2-approved-mobile-dialog.png`

Reproduce using the existing local PostgreSQL test service and a **fresh** `farm_v2_...` database on `127.0.0.1`:

```sh
pnpm --filter @workspace/qiankun-farm run build
FARM_V2_TEST_DATABASE_URL='<isolated loopback connection>' \
FARM_V2_PLATFORM_CHECKOUT=/path/to/imperial-compass-platform \
FARM_V2_BROWSER_ACCEPTANCE=1 \
pnpm exec vitest run artifacts/api-server/src/lib/farm-v2-wallet-saga.integration.test.ts -t 'approved scene:'
```

## Gate

Approved exterior asset access and this local desktop/mobile integration: **PASS / ASSET BLOCKED removed**. Related rules: `FARM-SOW-001`, `FARM-MATURE-001`, `FARM-HARVEST-001`, `CAVE-RESPONSIVE-001`, and the scene interaction portion of `PET-REST-002`. This does not certify all visual subrules or production operation.

Formal database topology, restricted runtime privileges, reviewed migrations and runtime cutover remain independently **BLOCKED / NO-GO** as described in `farm-v2-atomic-pot-release-gate.md`. Unconfigured official festival/RPG sources remain disabled and optional for initial launch. No push, merge, deployment, formal migration or production data write was performed.
