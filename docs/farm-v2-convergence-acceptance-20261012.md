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
| 田2/3永久主動支付解鎖 | 已實作，待正式驗證 | Farm V2持久化API／UI已接 staged Core coin-land contract；88/888固定扣款、永久權利、重送與歷史資格已有隔離SQL／HTTP測試。Core與Farm仍在未合併分支，正式遷移、全鏈部署與真實服務驗證未完成 |
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
| 共用六田實體／世界座標基本接線 | 已符合並驗證 | 六田共用immutable world surfaces與server snapshot；一個LandEntity元件各自綁定作物與操作。兩張原圖透過原有terrain correspondences呈現同一世界。四尺寸及空田／生長中跨640切換保留身份、world座標與狀態，無額外POST；完整場景美術／動畫仍另待驗收 |
| 桌機／手機正式底圖 | 已修正但待驗證 | 使用者提供0915手機版(4)/電腦版(4)及本機public/images/farm截圖；原圖已納入V2靜態資產。正式view已接原圖與既有美術定位；共用LandEntity已接線；完整場景美術／動畫仍待驗收 |
| 五階作物畫面 | 已修正但待驗證 | 既有emoji階段依server時間；未取得符合原場景規格的CropEntity美術；未判定正式視覺通過 |
| 播種／收成飛行動畫 | 尚未符合 | 原倉庫16%,35%錨點在新原圖落在山水／崖壁；已移除錯位動畫，等待可查證倉庫世界錨點。收成入庫功能仍運作 |
| 倉庫種子／靈植集中庫存 | 已符合並驗證 | 正式UI可開啟倉庫，六田按canonical順序顯示伺服器庫存；四尺寸實際收成與混沌領取同步檢查。其他四類資產尚未持久化 |
| 角色、靈獸及完整倉庫 | 尚未符合 | 角色／靈獸未按核准立繪完整展示；培養材料／盆栽／洞府陳設等持久流程未接通 |
| 響應式與操作文字可見 | 已符合並驗證 | 修復黑底黑字、禁止捲动與遮圖重複面板；320/390/768/1440無橫向溢出 |
| 瀏覽器Console | 已符合並驗證 | 四尺寸受控API／字型fixture Console error 0；不能推論正式Core／外部CDN無錯誤 |
| 農夫登入結算與逐田ON/OFF | 已符合並驗證 | 正式API／UI已接原runtime；隔離SQL3批60株新手入庫360、庫存種子扣除、重讀不重複、退款停止；HTTP逐田開關及四尺寸操作通過。真實Core仍待驗證 |
| 任務進度與領獎 | Farm 已接線，Core 已上隔離分支 | 八項定稿任務進度由 Farm server state 投影；claim API 使用固定獎勵、耐久 journal、Core receipt 復原與 Farm 材料 transaction。Core trusted HTTP handler／migration 已推至隔離分支 `a4a7228`；Farm 的 28 項定向測試通過。Core 自身 CI 啟動失敗且零 job，完整 Core tests、migration chain、遠端 ACL 與真實多連線仍未驗證，migration 未套用 |
| 好友、盆栽、洞府 | 尚未符合 | 純runtime存在；完整持久 API 及 UI 尚未接通；不納入本次任務領獎範圍 |
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
| `pnpm run test` | 41個Vitest檔、158案例通過；另4個Node guard案例通過 |
| `PORT=4173 BASE_PATH=/ pnpm run build` | API、Farm、mockup全workspace build通過；PORT/BASE_PATH是原sandbox config所需環境值 |
| `pnpm run test:browser:fixture` | 配合測試瀏覽器／本地字型環境，320/390/768/1440各13次操作（六田播種／收成＋混沌領取）、無溢出、Console error 0；320另驗證reduced-motion |
| `git diff --check` | 通過 |

負對照：保留原版本測試曾重現warehouse.seeds undefined；修正映射後六田SQL通過。將四個Wallet檔暫時回復0a0e6cd，reservation測試立即失敗（交易開始前找不到紀錄），還原修正後通過。

初始失敗與修復：缺vitest、錯放petEffectsRuntime測試、literal \n編譯錯誤、sandbox build缺PORT、靜態guard對formatter換行過度敏感。嵌入式DB對跨連線呼叫曾逾時，測試adapter明確改為同連線SQL流程；這不是多連線成功證據。

瀏覽器：預設下載被環境截斷，改以npm portable Chromium本地執行。外部字型CDN在受限網路失敗，因此字型由受控fixture供應。截圖是實際React畫面，資料來源為fixture，並非正式玩家資料。截圖呈現的桌機窄版場景不符合原世界場景驗收，沒有標為通過。

隔離SQL：PGlite真實PostgreSQL引擎＋實際V2 migration SQL；單連線測試adapter將outer query轉入active transaction。可驗證SQL/HTTP/映射/順序/重送，**不能**驗證journal獨立提交、PostgreSQL pool、並發行鎖、進程中斷或Core兩庫原子性。Saga的故障測試為mock persistence boundary，沒有把它冒充真實扣款。

獨立review指出的pool耗盡、歧義401誤拒、preflight retry trap、grant繞過pending、換帳號狀態污染、拒絕競態與補償retry trap已集中修正；最後一次靜態review無新增Critical/Important。這不替代缺少的多連線驗證。

## 上線阻擋與下一個具體動作

1. **Core整合**：Core coin-land contract 與 Farm V2持久化API／UI已分別推到隔離分支；仍須整合進核准主線，並在正式Core Catalog／Wallet／paid-value及資料庫環境完成驗證。現在不能使用V1端點替代。
2. **完整場景**：原圖與共用六田實體／世界面／美術投影已接線；原規格的角色、靈獸、完整CropEntity美術及倉庫飛行動畫尚未驗收。不得恢復錯位倉庫錨點。
3. **缺接線**：田2/3解鎖與任務領獎均有 Farm 隔離 API/UI 及 Core handler／migration staged 在隔離分支；仍要取得可用的 Core CI／本機檢查，按唯一 Supabase 專案核對完整 migration chain、ACL/RLS、多連線中斷復原和端到端 Wallet/Ledger。Core service 尚未通過這些 Gate 前不可合併、部署或套用 migration。好友／盆栽／洞府完整持久流程與角色素材仍缺，未定契約或素材不臆造。
4. **真正交易Gate**：在可啟動独立PostgreSQL的隔離環境執行至少11個並發請求、同ID／不同ID、Core成功後丟回應、journal寫入失敗、Farm提交失敗、補償丟回應、進程重啟後重試、退款與資格讀取競態；本環境不能啟動OS PostgreSQL服務，PGlite不冒充這一Gate。
5. **正式資料庫**：migration SQL與基本約束／ACL／RLS已在PGlite驗證；仍需確認核准目標、真實PostgreSQL及backend角色，正式套用須另外授權。

本輪沒有修改正式資料庫，沒有合併main，沒有部署，沒有手動觸發GitHub Actions或Vercel Build。修正分支的workflow只監聽canonical分支；首次集中修正一次提交；使用者要求繼續後，混沌領取另集中一筆提交。


## 後續收斂：混沌種子領取

使用者要求繼續後，已將原有 `settleAndClaimChaosSeeds` 接上 `POST /farm/v2/chaos-seeds/claim`，由伺服器固定領取整個待領池，不接受客戶端指定顆數。使用目前玩家身份、行鎖與既有request-ID交易機制；不呼叫Wallet扣款／入帳，不修改經濟規則。UI顯示伺服器pending，0顆時禁止領取，成功後重新讀取庫存。

同時修復真正缺口：paidAccessTransactions原先沒有結算72h pending，因此正式state讀取的池不會更新。現在在既有qualification交易內結算，只有前後皆具有有效田6資格才生成；暫停與恢复都推進cursor但不補發，已存pending保留。最初回歸測試期望pending3/processedCycle5，舊碼實際pending0/cursor0，已重現失敗後修正。

已執行：`pnpm run test`（151 Vitest案例＋4 guard）、`PORT=4173 BASE_PATH=/ pnpm run build`、`git diff --check`；四尺寸`test:browser:fixture`各13次操作、Console0，320 reduced-motion通過。SQL仍為前述PGlite隔離環境，Core與瀏覽器API仍使用受控fixture，沒有扩大驗證主張。

新增檔案：`artifacts/api-server/src/lib/farm-v2-chaos-claim.ts`。主要修改：`routes/farm-v2.ts`、`paidAccessTransactions.ts`、`useFarmV2Scene.ts`、`farmV2ApiClient.ts`、`FarmV2AuthenticatedView.tsx`及相應實際SQL／HTTP／transport／瀏覽器測試。

這一項已從阻擋清單移除。**整体仍NO-GO**：原場景、其他原有完整流程、Core正式整合、V2 migration／ACL與真實多連線／中斷復原尚未通過。


## 後續收斂：V2 migration 與直接存取隔離

使用 Supabase CLI `pnpm dlx supabase migration new farm_v2_runtime` 產生 `supabase/migrations/20261012034556_farm_v2_runtime.sql`。只建立既有三張V2表，與Drizzle欄位及CHECK約束一致；不修改Core Wallet、V1、角色權威或經濟數值。三表啟用RLS、無客戶端policy，撤銷PUBLIC/anon/authenticated權限，授予既有service_role CRUD。部署時API須使用核准的可信backend連線；migration不建立或更改BYPASSRLS角色。

現有SQL／HTTP流程改為執行這份migration，移除重複手寫測試DDL。初始空migration測試6項失敗；補齊後6項通過，包括非法田號／負數拒絕、客戶端七類表權限全部撤銷、實際SELECT/DELETE拒絕、service_role讀取與三表RLS確認。測試角色僅建立在PGlite記憶體DB。`pnpm run test`（153案例＋4 guards）、`PORT=4173 BASE_PATH=/ pnpm run build`通過；UI未更動，沿用先前四尺寸實際截圖。

沒有執行db push、遠端migration或正式資料庫變更。這項補齊可重現SQL來源，但不宣稱真實Supabase／多連線交易驗收通過。整體仍NO-GO。


## 後續收斂：過期讀取不能覆蓋交易結果

重現失敗：先啟動GET，POST因網路中斷未確認，較早GET最後返回；舊hook重新顯示舊資料並清除錯誤。現在於mutation開始和失敗時淘汰在途read sequence，清除過期loading；保留原request ID與pending retry。另實測POST已成功但GET失敗，重新讀取只有GET，不重送已完成POST；介面明确提示操作已完成、無須重做交易。

`pnpm run test`：155 Vitest案例＋4 guards通過。`PORT=4173 BASE_PATH=/ pnpm run build`（含Typecheck）、`git diff --check`通過。真正PostgreSQL Gate仍未通過：系統沒有postgres/initdb，實際非root身份切換因PermissionError被拒絕；CapEff=0、NoNewPrivs=1。未以PGlite代替跨連線驗收，未修改遠端資料庫／部署／合併。

本輪再次執行四尺寸瀏覽器fixture：320/390/768/1440各13操作、Console error 0；320 reduced-motion通過。獨立review無新增Critical/Important。仍是受控API，非正式Core玩家驗收。


## 使用者提供原底圖：2026-10-12

使用者提供0915手機版(4).png、0915電腦版(4).png與Windows檔案總管截圖，指向 `C:\ImperialCompass\qiankun-futian-main\public\images\farm`。附件實際已可讀取，不需重傳。截圖檔名為farm-scene-desktop/mobile。Farm repository main未有該目錄；平台repository main則有同名圖片但blob SHA不同，未以同名假定檔案相同。

原圖逐byte保留於 `artifacts/qiankun-farm/public/images/farm/farm-scene-desktop.png`（1215×1295，SHA2567615f3f13bee097708726716cce9239cb471089e470f55cfbdcb9ae53cea7691）及 `farm-scene-mobile.png`（941×1672，SHA25685d384d4fdb0e9f312ce69c26fc105915a44833020e857aa6951a5cbc1bf5010）。Vite public目錄由artifact提供靜態資產。沒有重畫、裁切或改圖。

`PORT=4173 BASE_PATH=/ pnpm --filter @workspace/qiankun-farm build`通過；dist/public/images/farm二圖與附件SHA256一致。這次只完成資產入庫與来源確認；正式view仍用舊圖，沒有把舊點擊範圍套到新圖。世界座標／LandEntity及桌機手機視覺Gate仍未通過。


## 原底圖接線與美術定位修正

正式view改用picture：640px以上desktop、以下mobile，保留原图比例，不再將桌機鎖在390px手機場景。六田視覺定位唯一來源為平台scene blob `f1cda92d4655aea98cd8419151fb5bbe0eaeb5b9` 的既有FARM_LAND_HOTSPOTS；提取到 `farmV2ScenePlacement.ts`，只帶美術頂點，不引用V1 runtime/catalog/API/經濟數值。依伺服器plot.id+1查找田號，點擊與作物共用定位；rect為原頂點外框、clip形狀依原頂點換算，不重新猜座標。

這是既有底圖與錯位修正，**不是LandEntity世界場景完成**；兩份美術projection尚未轉為可查證單一world/camera模型。獨立review發現舊倉庫飛行錨點16%,35%在新圖落在山水／崖壁，已刪除錯位flight狀態、markup與keyframes；等待倉庫權威位置才恢復動畫，不能將無動畫說成動畫驗收成功。庫存與交易不受影響。

完整155 tests＋4 guards與workspace Typecheck/Build通過。瀏覽器320/390/768/1440各13次操作、Console error0；直接檢查currentSrc及naturalWidth/Height，確定手機941×1672、桌機1215×1295正確載入且顯示比例無拉伸。新fixture驗證所有操作無錯位warehouse flight；320要求reduced-motion，但動畫Gate尚未通過。實際四尺寸畫面更新至既有視覺證據包；API為受控fixture。整體仍NO-GO。


## 農夫正式接線

依FINAL FARMER-SETTLE/PREF/SEED/SCOPE/CHAOS/NEWBIE規則，把既有executeFarmerLandTransaction接入两條paid reconciliation交易的明確settleFarmer選項，只有正式state GET啟用；其他mutation的資格刷新不順帶自動耕作；未確認Wallet早退出仍在結算之前。使用Core當前999資格、逐田開關、實際庫存種子及既有作物時間。Warehouse與六田在同一鎖定交易寫回，田地狀態變更才遞增version；不買種、不換幣、不領pending混沌、不領任務，不修改Wallet或經濟。

新增 `POST /farm/v2/lands/:landId/farmer`：launch身份、request ID、strict boolean、Core刷新、玩家行鎖、既有idempotency；僅保存該玩家的逐田設定。前端讀伺服器farmerState，有999資格時顯示六田ON/OFF；未確認操作沿用原ID，其他操作停用。API回傳已失去資格可確認此設定未執行。

最初SQL回歸舊實作收成0、預期360；接線後通過：已有20株與60顆種子，13h結算3批60株×6入庫360，剩餘一批在12h播種／16h成熟；重讀無重复、退款後不收成且保留作物時間。HTTP實測600資格403、999開啟、相同ID重送200、state用20顆庫存播整批、關閉、字串boolean400、Wallet呼叫數不增加。

`pnpm run test`156案例＋4 guards通過；workspace Typecheck/Build、diff check通過。四尺寸瀏覽器fixture各15次操作（原13＋農夫ON/OFF），15個不同request ID，Console0。獨立review無新增Critical/Important，另實跑farmer runtime＋SQL共13案例。新截圖包含逐田農夫設定；資料仍為受控fixture。真實Core、多連線及其他原規格流程尚未完成，整體NO-GO。


## 倉庫集中可見庫存

正式view新增原規格已有的倉庫入口，以native details集中顯示六田種子／靈植庫存；從既有server snapshot與safe-integer映射读取，不保存本機資產、不新增Wallet/API。交易或讀取中顯示同步中；GET失敗時原hook清空data，倉庫不繼續展示過期值。其他材料／盆栽／陳設分類不捏造資產。

盆栽runtime升階需金幣、首次圖鑑需金幣獎勵；Core草稿目前只有seed purchase、crop exchange、compensation原因，沒有盆栽扣款／獎勵契約。正式盆栽持久化、材料與Core交易未接通，不假冒購種／兌換／補償來入帳。

本輪`pnpm run test`156案例＋4 guards、workspace Typecheck/Build通過；四尺寸browser仍15次mutation，另開啟倉庫實測六行初始庫存、各田收成×6作物同步、混沌領取後種子3；Console0、無橫向溢出。新截圖含倉庫表格。這只是種子／靈植集中庫存，不代表六分類完整倉庫或盆栽流程完成。仍NO-GO。


## 共用六田實體與世界面

撤回先前自行加入的「全場景必須共用一個平面相機投影」判定；原規格沒有此限制，也未要求更換兩張原圖。沒有據此修改規格或要求使用者重新批准。

`farmV2SceneWorld.ts`建立同一組immutable六田世界面，基準來自已查證的既有定位，不自行猜座標。每個實體按固定田號绑定validated server snapshot；缺田／重複田號拒絕。`FarmV2LandEntity.tsx`讓各田同時擁有作物顯示及操作身份，取代整張圖片上的獨立button-map＋crop-map。原底圖為背景；viewport不生成遊戲狀態。hook只有收到新server snapshot才建立新實體快照，換尺寸只更新render projection。

Renderer直接接受entity.world幾何：桌機使用世界頂點，手機依原有四角correspondence做bilinear terrain mapping；六個terrain surface共用世界定義，不施加全場景共平面的額外假設，不改原定位。獨立review逐田數值檢查手機bounds與原定位差異小於1e-8百分點。

`pnpm run test`41檔158案例＋4 guards通過；`PORT=4173 BASE_PATH=/ pnpm run build`包含Typecheck通過；`git diff --check`通過。四尺寸browser各15操作，Console0；每尺寸另於空田及第一田已播種時跨640切換，檢查全部六田ID、world coordinates、lifecycle保持不變，沒有新增POST。倉庫／收成／混沌／農夫流程仍通過。兩個新world單元案例核對身份、world immutability及缺田／重複拒絕。中途元件拆分的JSX閉合、import path與重複landId型別問題已由Typecheck抓出並修復。

新增生長中320截圖。Portable Chromium原先缺emoji字型而顯示tofu；以測試環境本地Noto Emoji補齐，同繁中字型皆為受控fixture，不加入產品依賴、不生成新美術。截圖證據包包含四尺寸及生長中畫面。原規格完整CropEntity美術／人物／靈獸／倉庫動畫、Core契約與真正多連線Gate仍未完成，整體NO-GO。

## 後續收斂：種子多包購買入口

依 FINAL SEED-ASSET-002 補齊正式畫面的包數輸入。田1–5使用既有 purchaseSeeds mutation、伺服器驗價及原request-ID復原流程；每包仍1金幣、種子數仍20/10/6/4/3，不新增Wallet契約。畫面顯示包數與總成本，拒絕空白、零、負數、小數及非安全整數。鎖田仍可囤種；購買不自動播種；田6仍不販售。選田或換登入身份後包數回1。

新增正式view元件回歸：3包傳入既有mutation、非法包數禁用、鎖田購種不播種。先重現畫面沒有包數輸入，再補UI。完整161案例＋4 guards通過；Typecheck/Build通過。元件测试的hook為受控fixture，不代表正式Core扣款驗證。瀏覽器fixture本輪因環境缺少Chromium及headless-shell，啟動失敗，未執行四尺寸視覺驗收；先前截圖不代表本次新控制項已驗收。

曾嘗試以場景外文字倉庫入口作飛行終點；確認不符合場景倉庫驗收後已完整撤除，沒有將替代動畫留入產品。場景動畫、Core契約與其他原有缺口仍為NO-GO。


### 種子多包購買：四尺寸瀏覽器補驗

Chromium官方下載遭截斷；改用scratch中的portable Chromium 153及本地測試字型。初始解壓因chown環境限制失敗，完整解壓後啟動成功；不修改產品依賴或正式環境。320/390/768/1440各20筆不同ID mutation，包含原有六田播種收成、混沌領取、農夫開關與田1–5各購買3包。實際請求packs=3，種子分別增加60/30/18/12/9，作物庫存與田地生命週期不變；田2鎖定仍可購種，資格仍鎖定。非法包數禁用且不送POST，田6無購種控制。新控制顯示時無橫向溢出，Console error 0。320截圖發現輸入框缺少可見邊界，補邊框、44px高度及鍵盤焦點標示後重新驗證。

這是實際React與受控API的瀏覽器驗證，不代表Core扣款／Ledger正式驗收。場景建築動畫仍未接通。未推送：自動審核要求明確GitHub推送授權，使用者後續單點訊息未當成該授權。

## Core coin-land unlock contract: staged, not wired

Added `contracts/core/farm-v2-coin-land-unlock.sql` for FINAL LAND-UNLOCK-001/003 and UNLOCK-ATOMIC-001. It accepts verified Auth owner ID, land ID and request ID, never caller price. It maps Core identity, uses existing platform lifetime entitlements, requires Land 2 before Land 3 and fixes the costs to 88/888 coins. Debit, Core ledger, permanent entitlement and purchase event are a single Core transaction. Wallet-row locking serializes the owner; replay preserves the first grant without additional debit; conflicting request reuse is rejected. SECURITY INVOKER and service-role-only RPC access avoid an additional privileged client API.

Eleven SQL contract tests execute actual pinned Core wallet/entitlement migrations on PGlite. They verify prerequisites, fixed debits, both replay forms, conflict, insufficient funds, isolation, event-failure full rollback, role denial/trusted execution, invalid inputs and suspended wallets. The suspended-wallet regression initially debited; adding a post-lock status check fixed it. Complete Farm suite: 172 cases + 4 guards; workspace Typecheck/Build and diff check pass.

This is **staged executable Core contract evidence only**. Reference migrations are test inputs, not deployment instructions. The Farm branch separately wires the persistent entitlement reconciliation, request recovery and unlock UI to this contract. The full current platform migration chain, live launch authentication, true multi-connection locking, trusted Core endpoints and end-to-end service flow remain unvalidated. Land 2/3 remain NO-GO for release until integration and live verification pass. No V1 unlock fallback, remote migration, merge or deployment occurred.


Independent review reproduced two related historical-state defects: inactive lifetime rights were omitted from duplicate detection and Land 3 prerequisites. Both were fixed without reactivating inactive rights. A follow-up review caught the valid old-inactive/new-active regrant case; current access is now resolved independently from earliest historical grant metadata. Suspended/revoked/expired and regrant regressions verify no repeat charge and preserved first unlock time.

## Scene follow-up: server clock and legacy anchor audit

The authenticated scene now derives its display clock from the last server snapshot (`serverTime + elapsed since receipt`), rather than the device wall clock. Crop growth remains a visual projection; sow/harvest eligibility still comes from the server snapshot. The maturity timer in the existing scene hook triggers a server refresh at the boundary. A component regression exercises the five displayed states and confirms the mature interaction routes through the existing harvest mutation. Scene tests (8), workspace Typecheck, workspace Build and `git diff --check` passed.

The only warehouse-flight anchor found in the checked-in legacy code is `(13%, 22%)` in `HarvestAnimation.tsx`, calibrated to the old 390×843 scene and its separate `PLOT_CENTERS`. It is not a verified anchor for either current original artwork. The current image files show warehouse-like buildings, but no source hotspot/anchor metadata exists for them; no new coordinates were inferred or added. The checked-in public asset directory contains only the two scene backgrounds and generic site art, with no approved farmer/pet portrait sprites or crop-stage sprites. Those visual deliverables remain open.

Verification limits this follow-up: the full Vitest run had 187 passing tests and one HTTP integration test blocked because the sandbox rejects binding `127.0.0.1` (`listen EPERM`). The browser fixture could not launch portable Chromium in this run; Chromium terminated with `sandbox_host_linux` “Operation not permitted” (`SIGTRAP`). Neither failure is counted as a product assertion pass. No database, merge or deployment action occurred.


## Farm V2 mission claim implementation — 2026-10-13

依核准設計新增 Farm 的每日／每週任務主動領獎流程。畫面標題逐項對齊 Canonical Master `MASTER_DATA` rows 80–87：今日播種、今日收成、福田交易、今日福田全勤、耕耘不輟、靈植豐收、福田通商、七日福田；金幣與材料固定值同列核對。前端只送 mission ID 和 request ID，不送 reward、material、period 或 completion 欄位。伺服器 state 投影日／週週期與八項 progress；未確認交易會顯示 pending 並沿用原 request ID，其他 mutation 暫停。倉庫顯示蘊靈砂與九霄玉髓數量。

Farm migration 在 `farm_v2_mutation` 加入固定任務／週期／材料欄位、允許值與金額一致性檢查、週期唯一索引；新增材料庫存 safe-integer 累加。Claim 在接 Core 前提交凍結 intent，Core receipt 後以 Farm transaction 同步入材料、更新同週期 claimed 狀態與完成 journal。若復原跨過 05:00，只完成舊 intent，不把新週期標成已領。明確 Core 拒絕會結束並釋放週期 reservation；`UNKNOWN` 或網路中斷則保留 intent、不得換 ID。

Core 任務 SQL、HTTP handler 與 route 已推至平台 repo 的隔離分支 `fix/farm-v2-core-coin-land-api`（最新 HEAD `a4a72283869b086b41e8249ff3f78098621e25e3`）。PGlite 以 pinned Wallet migration 驗證 8 個固定 credit、精確重放、request key 衝突、無效身份／request ID、suspended wallet、停用身分重送已成功領取、帳戶隔離、ledger failure rollback 及 service-role-only（15 cases）。handler contract test 驗證 trusted secret、launch token、body allowlist、8 個 mission IDs、stable request ID、RPC allowlist 與錯誤分類（7 cases）。Farm transport 仍按契約測試；Core 本機 checkout 未掛載，Actions startup_failure 零 job，因此實際 Core 測試未完成，也不能視為正式 Core 連線。

本輪完整 `pnpm test` 通過：48 個 Vitest 檔案／225 項測試，加 4 項 paid-route guard；`PORT=4173 BASE_PATH=/ pnpm run build`（workspace Typecheck 與各 build）及 `git diff --check` 通過。任務聚焦案例包含八項任務逐次 claim、重放只入庫一次、未完成拒絕、明確拒絕後新 request 可安全申領、`WALLET_APPLIED` 跨每日 05:00 復原及不污染新週期，以及 authenticated Express route fixture。PGlite 是單連線證據；它不能驗證獨立 journal pool 的真正 durable commit、多連線競爭、程序重啟或 Core/Farm 跨庫中斷。

四尺寸受控 browser fixture 已新增任務 claim 回應不明後使用原 ID 重試、材料只增加一次的案例；本輪無法執行，因 Playwright 缺少 `chromium_headless_shell` executable，環境未提供可用 portable Chromium。這項 fixture 更新未計入瀏覽器驗收通過。正式 Core HTTP route、完整平台 migration chain、Supabase ACL/RLS、多連線故障與正式端到端交易仍是 Gate，整體維持 **NO-GO**。沒有推送、合併、部署或執行遠端 Migration。

後續唯讀核對已連到使用者指定的 `imperial-compass-dev`（project ref `qowjznvinqoxekiyjyvy`）：migration 清單最新項目為 `20261006000121`；`public` 與 `platform` 中沒有名稱含 `farm_v2` 的 base table。這證明本輪 Farm migration 尚未套用，並非資料庫連線不存在。只查詢 migration metadata 與 `information_schema.tables`；未讀取玩家資料，未寫入或變更遠端資料庫。

Core Wallet 來源核對：遠端 Core 分支的 `supabase/migrations/0019_create_core_wallet_runtime.sql` 與 Farm contract test 的 pinned reference 相同（正規化換行後逐字一致）；任務 RPC 呼叫的 `core_wallet_get_or_create(uuid)`、`core_wallet_apply_transaction(uuid, integer, text, text, text, text, text, text, uuid)` 簽章相符。該分支後續權限 migration 只讓 `service_role` 執行 Wallet RPC。這項只讀來源比對確認 SQL 契約依據版本一致；仍未在 Core repo 實作或測試 mission handler。

2026-10-13 後續本機工作補上 Core 任務獎勵 handler／Next route 的 staged source mirrors，並加 7 項 handler contract tests；handler 依既有 coin-land route pattern，僅接受 `missionId`、`launchToken`，以 `x-request-id` 呼叫 allowlisted Core RPC。當時它們仍只存在 Farm repo 的 `contracts/core/platform-files/`，未落入 Core checkout。fresh `vitest run` 結果為 49 檔、230 passed、2 項 HTTP integration tests 因 sandbox `listen EPERM` 無法執行；另有 11 項隔離 SQL integration tests passed。`tsc --build`、staged handler strict typecheck、1 項 paid-route guard、`git diff --check` 與 SQL mirror compare passed。Core 本身及正式交易尚未驗證；整體 **NO-GO**。

### Core branch follow-up — 2026-10-13

已將 mission reward migration、trusted Next route、handler 與 7-case handler contract test 推到平台 repo 的隔離分支 [`fix/farm-v2-core-coin-land-api`](https://github.com/williamLee-codex/imperial-compass-platform/tree/fix/farm-v2-core-coin-land-api)。首個提交 `fd5847c` 後複核發現「身分停用後重送既有成功領取」需回傳原 Ledger receipt；新增回歸測試、修正 SQL，最新 head 為 `a4a72283869b086b41e8249ff3f78098621e25e3`。Farm workspace 定向測試 3 檔、28 項全過（transport 6、handler 7、PGlite SQL 15），其中新增案例先重現失敗再驗證修正通過。GitHub Actions 在零個 job 啟動時回報 `startup_failure`，並非測試失敗；目前可見資料沒有說明啟動原因，不能據此認定是額度問題。Core 本身的 typecheck／Vitest／build 尚未執行，因本機沒有 Core checkout；Supabase 遷移也未套用。這只補上「Core 任務獎勵功能尚未進入隔離分支」這個缺口；完整 migration chain／ACL review、多連線與正式交易驗證、UI 美術交付仍未完成，因此整體維持 **NO-GO**。未合併、部署或修改遠端資料庫。
