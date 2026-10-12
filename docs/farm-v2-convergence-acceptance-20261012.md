# Farm V2 集中修正與驗收 — 2026-10-12

**判定：NO-GO。這是已完成集中修正的工程版本，不是符合全部原始規格的可上線版本。**

## 查證基準

- Repository：williamLee-codex/qiankun-futian。
- 原始分支 HEAD：codex/farm-v2-canonical-runtime = 09974935cc9377107bc4be47fd7a22558c7608e4。
- 修正分支起點：fix/farm-v2-direct-plot-actions = 0a0e6cd3125b5f133b6d7e5a3c6fd7520bef8bf4。
- 原始規格：使用者的《御策羅盤｜乾坤福田 V2 Canonical Master.xlsx》，version 2，修改時間 2026-10-10T08:40:01Z；RULES、MASTER_DATA、SUPERSEDED、CHANGELOG、IMPLEMENTATION 五頁完整讀取。
- 後續驗收：docs/farm-v2-interactive-scene-acceptance-v1.md；若與 Canonical Master 衝突，以 FINAL 規則為準。
- 平台 main 查證 SHA：63a6b38331e7061fce3436ae5efe60c19c9dc9d1。其 tree 無 /api/replit/farm-v2/wallet 或 paid-value。
- 在平台 codex/farm-v2-wallet-bridge 分支找到上述草稿路由，wallet route blob c6ee046349b5fc4ecd4a94a0b010f8e26b9873a1；未合併、未部署、未改其程式。
- 基準 Repository 沒有 Farm V2 SQL migration；本輪新增獨立 V2 migration，未套用遠端。平台 main 的 farm migrations 屬 V1。唯讀查證 imperial-compass-dev public schema 未見 V2 三表，不假定這個專案就是核准部署目標。

## 原始規格逐項狀態

「已符合並驗證」均限定下列證據環境；受控測試不等於正式服務驗收。

| 項目 | 狀態 | 證據／具體缺口 |
|---|---|---|
| 六田名稱、容量、時間 | 已符合並驗證 | canonicalLandData；20/10/6/4/3/1、4/6/8/10/12/60h；SQL 六田流程實測 |
| 田1–5種子包與價格 | 已符合並驗證 | 20/10/6/4/3 顆，各1金幣；HTTP及SQL測試以受控 Core 回應驗證 |
| 鎖田仍可購種 | 已符合並驗證 | 修復前端限制；API 測試購買仍鎖定田2，增加10種子 |
| 整批播種、缺種拒絕 | 已符合並驗證 | runtime測試；六田 SQL 播種數量與倉庫扣除 |
| 生長時間權威 | 已符合並驗證 | 伺服器 serverTime + maturesAt；瀏覽器時間不能自行成熟；成熟時重新讀取 |
| 成熟不腐敗／不減產 | 已符合並驗證 | landRuntime及六田成熟收成；並未套用 V1 損耗 |
| 收成入庫，不自動換幣 | 已符合並驗證 | SQL收成與HTTP兌換分開；無 Wallet 收成呼叫 |
| 新手7×24h、六田×6 | 已符合並驗證 | timeRuntime邊界；六田SQL收成含田6×6 |
| 部分兌換只消耗完整單位 | 已符合並驗證 | HTTP：12曜金粟消耗10、得2金幣、留2；重送不重複 |
| 田2/3永久主動支付解鎖 | 尚未符合 | 規則與runtime存在；正式 V2 API／UI未接通。Core草稿只提供種子／兌換／補償，不能臆造解鎖契約 |
| 付費里程碑、退款、恢復 | 已修正但待驗證 | runtime測試存在；真實 Core／Farm 兩庫退款並發未驗證；不保證嚴格跨庫原子切斷 |
| 田6首次種子不重複發 | 已符合並驗證 | runtime及SQL qualification初始化；首次 grant 狀態保存 |
| 混沌72h、pending≤3、anchor | 已符合並驗證 | 原runtime + 新狀態reconciliation結算；active5ticks→cap3、暫停／恢復不補發、下一個future tick生成1顆 |
| 混沌種子主動領取正式流程 | 已符合並驗證 | 已接claim API與UI；SQL／HTTP：3顆入庫、相同ID重送無額外種子、anchor／cursor不重置；四尺寸受控UI領取通過。尚未部署正式Core環境 |
| 正式玩家初始化與玩家隔離 | 已符合並驗證 | 實際HTTP驗證身份；SQL alice/bob隔離、firstFarmEnteredAt只初始化一次 |
| 播種／收成 snake_case映射 | 已符合並驗證 | 原SQL直接cast camelCase實測失敗，改 Drizzle select().for("update") 後通過 |
| 相同ID重送不重複播種／收成 | 已符合並驗證 | 六田SQL；不同ID再次收成拒絕 |
| Wallet意圖先保存、金額凍結 | 已修正但待驗證 | 基準負對照失敗、修正後通過；跨連線故障復原仍待真實 PostgreSQL |
| 回應遺失沿用原request ID | 已符合並驗證 | transport、saga受控測試與hook測試；401不能抹除未確認操作 |
| 重新整理找回未確認Wallet操作 | 已修正但待驗證 | /state回傳當前玩家pendingMutation，hook恢復原ID；正式服務待驗證 |
| 未確認交易封鎖其他資產異動 | 已修正但待驗證 | SQL測試拒絕其他寫入，Core資格仍讀取但延後資產grant；多連線尚未驗證 |
| 已扣款、Farm失敗復原／補償 | 已修正但待驗證 | durable WALLET_APPLIED／COMPENSATING／COMPENSATED；saga mock檢查；真實兩庫中斷待驗證 |
| Pool滿載／同玩家並發 | 已修正但待驗證 | journal獨立max2 pool避免被主交易pool等待鎖占滿；尚未多連線壓測 |
| 換帳號不帶入舊玩家請求 | 已符合並驗證 | hook session epoch；A→B、舊POST回應、401原ID三個測試 |
| 原始世界座標／真實場景 | 尚未符合 | FINAL FARM-SCENE-001/002要求LandEntity世界模型；当前畫面仍是舊手機底圖hotspot，沒有核准世界場景資產／座標文件 |
| 桌機／手機正式底圖 | 原始規格證據不足，待確認 | 現引用舊853×1844手機圖；沒有已核准V2桌機圖證據。不猜座標、不換底圖 |
| 五階作物畫面 | 已修正但待驗證 | 既有emoji階段依server時間；未取得符合原場景規格的CropEntity美術；未判定正式視覺通過 |
| 播種／收成飛行動畫 | 已修正但待驗證 | 成功POST+GET後播放；受控瀏覽器操作及reduced-motion通過；弧線與核准世界錨點尚未符合 |
| 倉庫、角色、靈獸 | 尚未符合 | 正式UI只有種子／作物數量；角色及靈獸未按伺服器狀態與核准立繪完整展示 |
| 響應式與操作文字可見 | 已符合並驗證 | 修復黑底黑字、禁止捲动與遮圖重複面板；320/390/768/1440無橫向溢出 |
| 瀏覽器Console | 已符合並驗證 | 四尺寸受控API／字型fixture Console error 0；不能推論正式Core／外部CDN無錯誤 |
| 農夫、好友、任務、盆栽、洞府 | 尚未符合 | 多個純runtime存在，但正式V2目前state/sow/harvest/purchase/exchange/chaos-claim/reconcile七類API；完整持久流程及UI未接通 |
| RLS／migration／資料隔離ACL | 已修正但待驗證 | 實際migration在PGlite執行；三表RLS、anon/authenticated全表權限撤銷、service_role讀取通過。遠端套用、真實backend連線角色及Supabase API隔離未驗證 |
| Wallet Catalog驗價／帳本一致性 | 尚未符合 | Core草稿接收Farm傳入amount；本輪不修改Core權威。需獨立Core契約與正式Ledger驗證 |

## 真正修改

- `artifacts/api-server/src/lib/farm-v2-sow.ts`、`farm-v2-harvest.ts`、`farm-v2-player-lock.ts`、`farm-v2-land-lock.ts`：改用實際 Drizzle 欄位映射，保留行鎖。
- `farm-v2-idempotency.ts`、`farm-v2-wallet-saga.ts`、`farm-v2-seed-purchase.ts`、`farm-v2-crop-exchange.ts`：Wallet reservation先提交，先保存精確意圖後聯絡Core；歧義重試不重新定價；未確認寫入防護、受鎖保護的preflight拒絕、補償狀態防競態。
- `lib/db/src/index.ts`：相同資料庫的獨立小型journal pool，不新增權威餘額或貨幣資料庫。
- `farm-v2-paid-access.ts`：未確認Wallet期間仍向Core讀資格，但延後會修改資產的reconciliation。
- `routes/farm-v2.ts`、`farm-v2-error-handler.ts`：serverTime、当前玩家未確認交易；證實的終止結果才標definitive。
- `farmV2SceneAdapter.ts`：不再從demo initialState取得正式六田metadata；使用Canonical數值與server時間。
- `useFarmV2Scene.ts`、`farmV2ApiClient.ts`：伺服器clock、成熟重新讀取、持久未確認請求恢復、換帳號epoch、4xx不自動假定未扣款。
- `FarmV2AuthenticatedView.tsx`、`index.css`：允許鎖田買種、顯示解鎖條件、可讀文字與捲動、移除遮圖重複面板。沒有更換底圖／六田座標／經濟值。
- `QuickActions.tsx`：修復真實literal \n把變數宣告吞進註解的編譯錯誤；此為demo檔案，不把demo行為搬進正式V2。
- 測試依賴、test script與錯放目錄修復；保留Node與Vitest各自runner，沒有拿測試總數當完成度。

## 實際驗證與限制

| 命令 | 結果 |
|---|---|
| `git ls-remote origin refs/heads/...` | 兩個指定HEAD吻合原指令；push前再核對修正分支 |
| `pnpm install --frozen-lockfile` | 首次invalid allowBuilds阻擋；修正esbuild設定後完成 |
| `pnpm run typecheck` | 通過 |
| `pnpm run test` | 40個Vitest檔、153案例通過；另4個Node guard案例通過 |
| `PORT=4173 BASE_PATH=/ pnpm run build` | API、Farm、mockup全workspace build通過；PORT/BASE_PATH是原sandbox config所需環境值 |
| `pnpm run test:browser:fixture` | 配合測試瀏覽器／本地字型環境，320/390/768/1440各13次操作（六田播種／收成＋混沌領取）、無溢出、Console error 0；320另驗證reduced-motion |
| `git diff --check` | 通過 |

負對照：保留原版本測試曾重現warehouse.seeds undefined；修正映射後六田SQL通過。將四個Wallet檔暫時回復0a0e6cd，reservation測試立即失敗（交易開始前找不到紀錄），還原修正後通過。

初始失敗與修復：缺vitest、錯放petEffectsRuntime測試、literal \n編譯錯誤、sandbox build缺PORT、靜態guard對formatter換行過度敏感。嵌入式DB對跨連線呼叫曾逾時，測試adapter明確改為同連線SQL流程；這不是多連線成功證據。

瀏覽器：預設下載被環境截斷，改以npm portable Chromium本地執行。外部字型CDN在受限網路失敗，因此字型由受控fixture供應。截圖是實際React畫面，資料來源為fixture，並非正式玩家資料。截圖呈現的桌機窄版場景不符合原世界場景驗收，沒有標為通過。

隔離SQL：PGlite真實PostgreSQL引擎＋實際V2 migration SQL；單連線測試adapter將outer query轉入active transaction。可驗證SQL/HTTP/映射/順序/重送，**不能**驗證journal獨立提交、PostgreSQL pool、並發行鎖、進程中斷或Core兩庫原子性。Saga的故障測試為mock persistence boundary，沒有把它冒充真實扣款。

獨立review指出的pool耗盡、歧義401誤拒、preflight retry trap、grant繞過pending、換帳號狀態污染、拒絕競態與補償retry trap已集中修正；最後一次靜態review無新增Critical/Important。這不替代缺少的多連線驗證。

## 上線阻擋與下一個具體動作

1. **Core整合**：對照兩個草稿分支完成Core正式Catalog／Wallet／paid-value契約；需要使用者授權才能合併與部署。現在不能使用V1端點替代。
2. **原場景**：定位／提供已核准V2世界場景資產與六田錨點。禁止以舊手機hotspot繼續假定原場景已完成。
3. **缺接線**：以既有FINAL規格完成田2/3支付解鎖、原規格的角色／農夫／倉庫等持久流程；未定Core契約不臆造。
4. **真正交易Gate**：在可啟動独立PostgreSQL的隔離環境執行至少11個並發請求、同ID／不同ID、Core成功後丟回應、journal寫入失敗、Farm提交失敗、補償丟回應、進程重啟後重試、退款與資格讀取競態；本環境不能啟動OS PostgreSQL服務，PGlite不冒充這一Gate。
5. **正式資料庫**：migration SQL與基本約束／ACL／RLS已在PGlite驗證；仍需確認核准目標、真實PostgreSQL及backend角色，正式套用須另外授權。

本輪沒有修改正式資料庫，沒有合併main，沒有部署，沒有手動觸發GitHub Actions或Vercel Build。修正分支的workflow只監聽canonical分支；首次集中修正一次提交；使用者要求繼續後，混沌領取另集中一筆提交。


## 後續收斂：混沌種子領取

使用者要求繼續後，已將原有 `settleAndClaimChaosSeeds` 接上 `POST /farm/v2/chaos-seeds/claim`，由伺服器固定領取整個待領池，不接受客戶端指定顆數。使用目前玩家身份、行鎖與既有request-ID交易機制；不呼叫Wallet扣款／入帳，不修改經濟規則。UI顯示伺服器pending，0顆時禁止領取，成功後重新讀取庫存。

同時修復真正缺口：paidAccessTransactions原先沒有結算72h pending，因此正式state讀取的池不會更新。現在在既有qualification交易內結算，只有前後皆具有有效田6資格才生成；暫停與恢复都推進cursor但不補發，已存pending保留。最初回歸測試期望pending3/processedCycle5，舊碼實際pending0/cursor0，已重現失敗後修正。

已執行：`pnpm run test`（151 Vitest案例＋4 guard）、`PORT=4173 BASE_PATH=/ pnpm run build`、`git diff --check`；四尺寸`test:browser:fixture`各13次操作、Console0，320 reduced-motion通過。SQL仍為前述PGlite隔離環境，Core與瀏覽器API仍使用受控fixture，沒有扩大驗證主張。

新增檔案：`artifacts/api-server/src/lib/farm-v2-chaos-claim.ts`。主要修改：`routes/farm-v2.ts`、`paidAccessTransactions.ts`、`useFarmV2Scene.ts`、`farmV2ApiClient.ts`、`FarmV2AuthenticatedView.tsx`及相應實際SQL／HTTP／transport／瀏覽器測試。

這一項已從阻擋清單移除。**整体仍NO-GO**：原場景、田2/3解鎖契約、其他原有完整流程、Core正式接線、V2 migration／ACL與真實多連線／中斷復原尚未通過。


## 後續收斂：V2 migration 與直接存取隔離

使用 Supabase CLI `pnpm dlx supabase migration new farm_v2_runtime` 產生 `supabase/migrations/20261012034556_farm_v2_runtime.sql`。只建立既有三張V2表，與Drizzle欄位及CHECK約束一致；不修改Core Wallet、V1、角色權威或經濟數值。三表啟用RLS、無客戶端policy，撤銷PUBLIC/anon/authenticated權限，授予既有service_role CRUD。部署時API須使用核准的可信backend連線；migration不建立或更改BYPASSRLS角色。

現有SQL／HTTP流程改為執行這份migration，移除重複手寫測試DDL。初始空migration測試6項失敗；補齊後6項通過，包括非法田號／負數拒絕、客戶端七類表權限全部撤銷、實際SELECT/DELETE拒絕、service_role讀取與三表RLS確認。測試角色僅建立在PGlite記憶體DB。`pnpm run test`（153案例＋4 guards）、`PORT=4173 BASE_PATH=/ pnpm run build`通過；UI未更動，沿用先前四尺寸實際截圖。

沒有執行db push、遠端migration或正式資料庫變更。這項補齊可重現SQL來源，但不宣稱真實Supabase／多連線交易驗收通過。整體仍NO-GO。
