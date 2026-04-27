# PRD-QA — 討論紀錄 / Discussion Log

> **此檔案為追加式更新，每次啟動專案時回讀，了解過往決策。**
> *This file is append-mode. Read on every project start to understand past decisions.*

---

## 討論紀錄 / Discussion records

## 2026-04-22 | Token: ~500

**Q: S/P PRD — 建立新專案**
**A: 專案建立完成。Model 選擇 Opus 4.6。建立資料夾結構、CLAUDE.md、QA.md、MST.md、launcher.sh、SKL V001、🟡 黃色圖示 .app 啟動器。**

---

## 2026-04-23 | Token: ~15k

**Q: S/B — 網頁軟體 port 配置規範**
**A: 制定全域 port 規範：前端 56000-56999、後端 58000-58999。PRD 為第一個登記案，分配 56001（frontend）/ 58001（backend）。部署前必須以 `lsof -iTCP:<port> -sTCP:LISTEN -n -P` 檢查占用。修改檔案：`app/server/src/index.ts`（3002→58001）、`app/client/vite.config.ts`（5174→56001、proxy target→58001）、`deploy.bat`（3002→58001）。已 rebuild server 並重啟 on 58001，瀏覽器已開啟。偏好寫入 SKL-Bill.V003、auto-memory（feedback_port_allocation.md）。未來 `S/P` 建新專案時會自動讀 SKL-Bill V003+ 的 Port Registry、分配 `56(N+1)/58(N+1)`、回寫 registry。**

---

## 2026-04-26 | Token: ~80k

**Q: 把產品頁的 5 層分類 Tab 移到 Sider 改成樹狀（A2 + B2 + C1 + D1 + E3+E4）**
**A: 重構：(1) `store/app.ts` 新增 `categoryTree`、`activeL1..L5`、`categorySiderExpanded`、`selectedSiderKey`、`addFolderModal`，全部以 localStorage 持久化；(2) 新 `components/CategoryTree.tsx` 在 Sider 渲染樹，每層含合成「全部 / All」節點，badge 用同色系（紅 / 綠 / 藍 / 黃 / 灰 / 紫），首次載入完全展開後記住使用者展開狀態；(3) `layouts/MainLayout.tsx` Sider 上半維持原主選單、下半放 CategoryTree，所有頁面顯示；(4) `pages/Products/index.tsx` 移除原 5 行 Segmented Tab UI、改成單行 breadcrumb（A2-H/W › A21-Chamber › A210），版面切換留在 Card 標題區；(5) 刪除 `rootTabMenu`、`renderTabBlock`、`renderProgressBreakdown`、`expandAllDescendants` 等死碼。Sider「+」按鈕觸發新增根資料夾（會自動導向 /products 並開啟 Modal）。`tsc -b` 通過。**

---

## 2026-04-27 | Token: ~30k

**Q: 按 Tab 在產品列表直接顯示子階（資料夾 C + 產品 P）**
**A: `pages/Products/index.tsx`：(1) 新增 `focusedRowKey` state，row `onClick` 時記錄目前點選列；(2) `keydown` 監聽 Tab — 若焦點不在 input/textarea/contenteditable，依序找展開目標：先用 `focusedRowKey`（表格內最後點選的列），若無則 fallback 到 Sider 選的 `focusedNode`，再 fallback 到 `tableData[0]`；找到 category 後 `preventDefault` 並呼叫 `handleExpand` 載入直接子階（既有 `direct_only` 邏輯只展一層、含 C 與 P）；(3) 焦點列加上 `#e6f7ff` 高亮。修正：第一版要求先點表格列才能 Tab，但使用者通常從 Sider 選分類後直接 Tab — 故加 fallback 鏈到 Sider 焦點。`tsc -b` 通過。**

---

## 2026-04-27 | Token: ~45k

**Q: Sider 選的分類已在 breadcrumb，產品頁第一列（同一個分類）不用再顯示**
**A: `pages/Products/index.tsx`：(1) `tableData` 由 `[focusedNode]` 改為 `focusedNode.children ?? []`，直接顯示子階（C + P），breadcrumb 顯示 path 不重複；(2) 新增 `useEffect`：`focusedNode.key` 變化時若尚未 load 過該分類產品，自動呼叫 `handleExpand`（因為使用者再也看不到父列的 chevron）；(3) Tab fallback 鏈簡化 — 移除 `focusedNode` fallback（看不到的東西不該被 Tab 命中），保留 `focusedRowKey` 與 `tableData[0]`（表格只有一列時）的 fallback。`tsc -b` 通過。**

---

## 2026-04-27 | Token: ~60k

**Q: 父分類料號（code）修改時，子孫資料夾與產品的 prefix 也要一起連動更新**
**A: 規則：絕對 prefix 比對，舊 code 整串 → 新 code 整串。若舊 code = `A211.A-room`、新 code = `X.B-room`，則 `A211.A-room.x1` → `X.B-room.x1`，但 `A211.A1`（不以 `A211.A-room` 開頭）不會被改。**
**Server `app/server/src/index.ts`：在 `PATCH /api/categories/:id` 的 `db.batch` 內，偵測 `code` 欄位變更時，先抓 `getDescendantCategoryIds(id)` 撈出全部子孫分類，逐筆比對 `code` 是否以舊 prefix 開頭，符合者用 `newPrefix + code.slice(oldPrefix.length)` 改寫；接著對 self + 所有子孫的 active products 做同樣的 `pn` prefix 改寫。完成後回傳 `{ ...updated, cascade: { categories, products } }`，並寫入 audit log（`changes.cascade_rename`）。**
**Client：(1) `api/index.ts` 的 `updateCategory` 自動回傳 `cascade`；(2) `components/CategoryTree.tsx` 的 `commitEdit` 與 `pages/Products/index.tsx` 的 `saveCategoryField` 兩處都改成讀 `res.cascade`，若有連動就顯示「連動更新 N 個子資料夾、M 個產品」並 `refetchCategoryTree`；(3) 修一個既有 bug：`refetchCategoryTree()` 把整棵 categoryTree 取代掉、in-memory 產品被洗掉，但 `loadedCategories.current` 仍然 cache 著、再展開不會 refetch。**
**修正：第一版用 `treeIdentityRef` 比 reference 偵測替換，但 `setTreeData` 的 `updateNodeInTree` 也會回傳新 reference，造成每次產品欄位編輯都觸發 cache clear + refetch、把使用者的編輯蓋掉（症狀：產品欄位無法修改）。改用 store-level `treeRefetchVersion` counter，只在 `refetchCategoryTree` 內部 bump，本地 in-place 編輯不會觸發。`tsc -b`（client + server）通過。**

---

## 2026-04-28 | Token: ~75k

**Q: 點開 P（產品）很慢，找原因並改善**
**A: Explore agent 找到 3 個熱點：(1) `columns` 陣列每次 render 都重建（30+ 欄、antd Table 用 reference 比對 → 全表 cell 重畫）；(2) `<ProductDetail onSave={(updated)=>{...}} />` inline arrow 每次 render 都新 closure，`React.memo` 形同虛設；(3) 5 層分類 filter 鏈每次 render 都跑（沒 memoize）。**
**先做兩個低風險、影響大的修正：(A) `handleProductDetailSave = useCallback(..., [])`，用 `searchActiveRef` 取代 `searchResults` 依賴，徹底穩定 ProductDetail 的 prop reference，多次切換產品不再讓詳細面板整個重畫；(B) `customColumnsMap = useMemo(..., [customColumns])`，避免每 render 都 `new Map()`。`tsc -b` 通過。columns 全面 memoize 風險高（render fn 內部捕捉 selectedProduct 等 state，如果 deps 不全會 stale），暫不做；若仍慢再評估把 saveField/saveFieldGeneric/editableOnCell stabilize 後再 memo orderedColumns。**

---

## 2026-04-28 | Token: ~85k

**Q: 全部空的售價填 1**
**A: 35 個 active products 的 `unit_price IS NULL` 填成 1。流程：備份 DB → 加一次性 `POST /api/admin/fill-empty-unit-price` → server `tsx watch` 自動 reload → curl 觸發、回傳 `{"ok":true,"filled":35}` → 移除 endpoint → server 再次 reload。注意：因 sql.js 把整個 DB 載入記憶體，直接 sqlite3 CLI 改檔案會被 server 下次寫入覆蓋，必須走 server 端 endpoint。`tsc -b` 通過。**

---

## 2026-04-28 | Token: ~95k

**Q: 設定衍生欄位公式並自動更新：小計成本=qty×cost、小計售價=qty×unit_price、利潤=unit_price−cost、利潤率=利潤/unit_price**
**A: 已存在的欄位是 `total_price`（小計售價）、`profit`、`profit_margin`（fraction 0–1，UI 顯示時 ×100%）。「小計成本」沒有 DB 欄位，本次不新增 schema，只連動現有 3 個欄位。**
**`app/server/src/index.ts`：(1) 新增 `computeDerivedProductNumerics({cost, quantity, unit_price})` 純函數，回傳 `{total_price, profit, profit_margin}`，處理 null 與 unit_price=0 的 div-zero；(2) `PUT /api/products/:id` 改用 `db.batch` — 先套使用者欄位、再讀回 row、再覆寫 derived 三欄。決策：derived 欄位永遠以 cost/quantity/unit_price 為唯一真實來源，使用者直接編輯 `profit` 等也會被 recompute 蓋掉（自動更新的 trade-off）。Audit log 會額外列出 client 沒主動改但被 server recompute 的欄位。(3) 一次性 admin endpoint `POST /api/admin/recompute-derived`，curl 後回傳 `{scanned:44, updated:41}`，再移除 endpoint。**
**Spot-check：A211.R44 cost=700/qty=1/up=1000 → total=1000、profit=300、margin=30% ✓。A212.X1C0 cost=6000/up=1（前一輪填 1）→ profit=−5999、margin=−599900%（公式正確、語意上要再校正售價）。`tsc -b` 通過。**

---
