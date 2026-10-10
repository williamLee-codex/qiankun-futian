# Farm V2 好友、護陣來源與場景互動交付

本輪承接農場 b55d410d、平台 4ea260ca，保留既有 Core Wallet、Migration 0123–0130 及盆栽 Saga。全部驗證只使用本機隔離 PostgreSQL；不代表正式環境驗收。208 條有效 FINAL 的母表不變。

## 已接通的流程

- 好友列表 → 唯讀農場 → 借運／助力 → 伺服器結算 → 更新自己的庫存與好友田地。次數各每日五次、每好友各 24 小時；借運成熟後一小時，助力不必等待一小時。只允許第二至第五田；農夫有效時先拒絕。麒麟／狻猊看地主，諦聽看操作者，第一田結算後才判斷額外田。
- 双方權限用 Core 的既有 paid-operation permits，兩個玩家資源鎖按同一順序取得。平台新增 0131 使好友移除／帳號停用在未結案操作期間拒絕（55P03），既有 Core 資格退款屏障保留。不得當作跨庫 ACID；中斷後依既有人工 fencing／reconciliation 分別結案兩個 permit，兩者結案才解除好友屏障。未知結果禁止強制刪除 permit。
- Farm DB 內地主作物、助力獎勵、田地、次數與冷卻同一交易，與地主自行收成共享玩家鎖。失敗不扣次數。傳輸遺失保留原始冪等鍵，可用「查核／重試原好友交易」重送；沒有樂觀複製資產。
- 登入日由伺服器 05:00 台北日界紀錄；自然月 ceil(90%)，次月固定天道酬勤，手動啟用、不自動替換，過期卸下。
- 節慶碼只送 SHA256；伺服器 `FARM_V2_FESTIVAL_CODES` 提供年度及生效時段，沒有有效官方碼時拒絕。平台 `FARM_V2_FORMATION_ACHIEVEMENT_MAP` 僅對應正式 achievement UUID，查 canonical Core user 的 completed achievement_progress 與有效 source_domain，客戶端不能宣告完成。
- 手機／桌機分開配置六田、六盆栽、四寵物、洞口、護陣熱區；播種／成熟／收成依實際 API 狀態。洞府六陳設位展示真實資料，好友只讀，離開仍返回同一好友農場，再另行返回自己農場。

## 必須保留的上線阻擋

`POT-ATOMIC-001`／`POT-GALLERY-004` **BLOCKED**。目前 Core Wallet 金幣與 Farm 盆栽、材料、圖鑑分處兩個 PostgreSQL 交易，HTTP Saga 只能恢復／補償，不能保證三者同時原子提交。即使已有 owner 鎖、資產預留與冪等 journal，也會出現 Core 已提交而 Farm 未提交的可觀察窗口。

可實作的最小架構修正：將涉及金幣的盆栽結果／材料／圖鑑永久首獲記錄，遷至平台私有 Farm 經濟資料域；單一 PostgreSQL 函式鎖帳號資產及 Core Wallet，驗證來源、材料、作物、金額與冪等鍵，透過既有 Core Wallet 權威函式扣款／獎勵，於同一交易寫盆栽及圖鑑。Farm API 作為驗證過的代理及唯讀投影；遷移期間禁止雙寫，切換前校對資產及 journal，完成整批 rollback／首次首獲／併發驗收後再開啟入口。不能把 Core 餘額搬到 Farm 或增加假錢包。本轮未執行此跨庫資產遷移，入口旗標仍須關閉。

**ASSET BLOCKED**：未找到 `0915手機版(2).png`／`0915電腦版(2).png`。平台現有 farm-scene-\* 為 git 99a45ad3 的 Farm V1 素材，不替代定版圖。目前交付是可操作互動線框，不是定版 2D 美術遊戲；洞府、主角、稱號、牌匾與動畫仍須原圖精確定位验收。

**營運來源 BLOCKED**：官方年度碼／時段與 RPG／活動精確 achievement ID 未提供配置。工程橋接可用隔離 fixtures 驗證，不能宣稱正式來源已啟用。

## 本機 Migration 計畫

平台映射：0130 → `20261010000130`；新增 0131 → `20261010000131`。順序為既有 0123→…→0129→0130→0131。0130 必須已有正式 platform_friendships 的欄位、ordered UUID pair、auth 外鍵及 active/blocked 約束；缺少時 preflight 停止，禁止猜測建表。0131 另需該表 trigger 權限與完整前置歷史／RPC 身體／ACL。正式版本是否已被他人占用仍須唯讀正式 history 核對。

`node scripts/production-migration-authority.mjs --migration 0130 --plan` 與 0131 為離線計畫，不執行 SQL。0131 只新增好友 barrier 及公開好友資格投影，未修改既有 Migration。正式套用仍須另輪授權。

## 實際本機驗證

- Farm：10 個相關測試檔 98/98 通過（含 38 個隔離 PostgreSQL／瀏覽器整合案例）。鎖定、重複請求、地主／助力競態、資格退款、資產預留、官方碼冪等與既有補償案例通過。
- Platform：3 個相關測試檔 9/9 通過；Migration 0123–0129 工具回歸 11/11、0130–0131 工具 4/4 通過，缺少 friendship 依賴時停在 preflight，無 source/history 寫入。
- 兩端 TypeScript、平台架構檢查與 Farm 前端／API 本機建置通過。未執行平台 Next build（本輪路由變更已 typecheck，避免無關建置）。
- Chromium 桌機 1280×900、手機 390×844：實際隔離 API 播種／收成與洞府導航通過；截圖在 `/tmp/farm-v2-interaction-desktop.png`、`/tmp/farm-v2-interaction-mobile.png`。測試使用隔離身分與橋接 fixture，非正式站验收。
- 兩端正式入口仍由 server `FARM_V2_ENTRY_ENABLED=1` 才開啟，未變更正式設定，未執行正式 SQL、推送、部署或觸發 hosted build。

## 修改檔案

### Farm

- `artifacts/api-server/src/lib/farm-v2-authority-context.ts`
- `artifacts/api-server/src/lib/farm-v2-formation-sources.ts`
- `artifacts/api-server/src/lib/farm-v2-friend-actions.ts`
- `artifacts/api-server/src/lib/farm-v2-friend-authority.ts`
- `artifacts/api-server/src/lib/farm-v2-friends.ts`
- `artifacts/api-server/src/lib/farm-v2-gameplay.ts`
- `artifacts/api-server/src/lib/farm-v2-idempotency.ts`
- `artifacts/api-server/src/lib/farm-v2-wallet-saga.integration.test.ts`
- `artifacts/api-server/src/lib/farm-v2-workshop.ts`
- `artifacts/api-server/src/middlewares/farm-v2-error-handler.ts`
- `artifacts/api-server/src/routes/farm-v2-entry.test.ts`
- `artifacts/api-server/src/routes/farm-v2.ts`
- `artifacts/qiankun-farm/src/App.tsx`
- `artifacts/qiankun-farm/src/game/v2/FarmSceneInteractionLayer.tsx`
- `artifacts/qiankun-farm/src/game/v2/FarmV2AuthenticatedView.tsx`
- `artifacts/qiankun-farm/src/game/v2/FarmWorkshopPanel.tsx`
- `artifacts/qiankun-farm/src/game/v2/borrowRuntime.test.ts`
- `artifacts/qiankun-farm/src/game/v2/borrowRuntime.ts`
- `artifacts/qiankun-farm/src/game/v2/farmSceneInteraction.css`
- `artifacts/qiankun-farm/src/game/v2/farmV2ApiClient.test.ts`
- `artifacts/qiankun-farm/src/game/v2/farmV2ApiClient.ts`
- `artifacts/qiankun-farm/src/game/v2/formationSourcesRuntime.test.ts`
- `artifacts/qiankun-farm/src/game/v2/formationSourcesRuntime.ts`
- `artifacts/qiankun-farm/src/game/v2/friendFarmerGuard.test.ts`
- `artifacts/qiankun-farm/src/game/v2/friendFarmerGuard.ts`
- `artifacts/qiankun-farm/src/game/v2/publicCave.ts`
- `artifacts/qiankun-farm/src/game/v2/sceneInteractionRuntime.test.ts`
- `artifacts/qiankun-farm/src/game/v2/sceneInteractionRuntime.ts`
- `artifacts/qiankun-farm/src/game/v2/useFarmV2Scene.ts`
- `artifacts/qiankun-farm/src/game/v2/workshopRuntime.ts`
- `docs/farm-v2-final-rule-matrix.md`
- `docs/farm-v2-friend-scene-delivery.md`

### Platform

- `scripts/farm-v2-migration-contract.mjs`
- `scripts/farm-v2-workshop-migration-db.mjs`
- `src/app/api/replit/farm-v2/formations/route.ts`
- `src/app/api/replit/farm-v2/friends/authorization/route.ts`
- `src/features/farm/formationBridge.ts`
- `src/features/farm/friendOperation.test.ts`
- `src/features/farm/friendOperation.ts`
- `src/platform/farm-v2/formationSources.test.ts`
- `src/platform/farm-v2/formationSources.ts`
- `src/platform/farm-v2/friends.ts`
- `supabase/migrations/0131_farm_v2_friend_operation_barrier.sql`
- `supabase/production-migration-map.json`

平台 `BASELINE.md` 為本輪開始前既有修改，保留、不納入提交。

結論：本輪功能與工具本機驗證 PASS；整體上線仍 NO-GO（嚴格原子性、定版素材、正式營運來源及正式環境預備驗收未解除）。
