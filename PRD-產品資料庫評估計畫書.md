# 產品資料庫評估計畫書 / Product Database Evaluation Plan

**文件版本 / Version:** V2.0
**建立日期 / Created:** 2026-04-22
**專案代號 / Project Code:** PRD
**作者 / Author:** Bill + Claude Opus 4.6
**資料來源 / Source:** `reference/2026產品牌價.xlsx`（1,585 行 × 26 欄）

---

## 1. 專案概述 / Project Overview

**目標：建立一個多階層、可展開收合的產品資料庫系統，涵蓋公司所有產品線的完整分類與管理。**

*Goal: Build a multi-level, collapsible product database system covering all product lines with full categorization and management.*

**資料現況：**
- **現有 Excel 牌價表包含 1,585 行產品/零件資料**
- **26 個欄位（Keynote ~ Owner）**
- **階層深度最深達 6 層（大項 → 系列 → 系統 → 子系統 → 組件 → 零件）**
- **PN 編碼規則：** `M5XX.25XX.A.C01..名稱`（以 `..` 作為編號與名稱分隔符）

*Current data: 1,585 rows, 26 columns, up to 6 levels deep. PN coding: `M5XX.25XX.A.C01..Name` with `..` as code-name separator.*

---

## 2. 實際產品分類架構 / Actual Product Category Structure

### 2.1 七大產品主分類（已確認）

| 代碼 | 大項 | English | Excel 對應 | 狀態 |
|------|------|---------|------------|------|
| A1 | **系統** | *System* | `A1..System` (Row 3–1426) | **大量資料** |
| A2 | **硬體** | *Hardware* | `A2-Hardware` / `A21..Chamber technology` (Row 1427+) | **有資料** |
| A3 | **服務** | *Service* | `A3-Software` (Row 1862) | **有項目** |
| A4 | **升級** | *Upgrade* | `A4-upgrade` (Row 1863) | **有項目** |
| A5 | **（未整理）** | *TBD* | — | **未定義** |
| A6 | **軍用** | *Military* | `A6-Military` (Row 1864) | **有子分類** |
| A7 | **代理** | *Agency/Distribution* | `A7-Agency` (Row 1894) | **有報價單** |

#### A6 軍用子分類

| 代碼 | 名稱 |
|------|------|
| A621 | **被動元件 (EMP)** |
| A622 | **主動元件** |
| A63 | **Software/Service** |
| A67 | **Agent** |

#### A7 代理項目

| 項目 | 說明 |
|------|------|
| `[P26149]_116` | **Shielding Box_美商定誼** |
| `[P261A5]_A355` | **11kW家用充電樁_文山曾小姐_岳億** |
| `[P26103]_555` | **隔離室搬遷_華碩** |
| `[P26114/P25315]_732` | **CST Software Upgrade_啟碁** |
| `[P26123]_A712` | **CMW100租賃3週(10台)_聯發科** |
| `[P26121]_732` | **CST 維護_亞旭** |
| `[P26601/P25463]_621` | **網路分析儀等12項VNA_陸軍通訊(通基廠)** |

### 2.2 階層編碼規則（已確認）

```
A1          → Level 0（大項）
├── A11     → Level 1（中項）
│   ├── A111    → Level 2（小項）
│   │   └── A111.xx  → Level 3+（細項/產品/零件）
```

### 2.3 A1..System 展開結構（從 Excel 解析）

```
A1..System（系統）
├── A11..A class（A 級 OTA 系統）
│   ├── A111..A1 OTA
│   │   ├── A1 Anechoic Chamber（暗室）
│   │   ├── A1 RF System（射頻系統）
│   │   ├── A1 Positioner system（定位系統）
│   │   ├── A1 System Controller & miscellaneous（控制器與雜項）
│   │   ├── A1 Upgrade（升級）
│   │   ├── A1 Acceptance（驗收）
│   │   └── A1 Warranty（保固）
│   ├── A112..A2 OTA
│   │   ├── A2 Anechoic Chamber System
│   │   ├── A2 RF System
│   │   ├── A2 Positioner & Control System
│   │   ├── A2 Measurement Software
│   │   ├── A2 Upgrade / Acceptance / Warranty
│   │   └── ...
│   ├── A113..A3 OTA
│   ├── A114..A4 OTA
│   ├── A116..A6 OTA
│   └── A118..A8 OTA
│
├── A12..B class（B 級屏蔽箱系統）
│   ├── A121..B1 Desktop Shielding Box
│   ├── A122..B2 Mobility Shielding Box
│   ├── A123..B3 Compact Shielding Box
│   └── A126..B6 Vehicle Shielding Box
│
├── A15..R class（R 級系統）
│   └── 訊號介面盤、Filter 等
│
├── A16..待測物 Class（DUT Class）
│   └── 暗室拆裝工程、TP系統升級 等
│
├── A17..M Class（M 級）
│   └── 重載DUT治具、系統保固料 等
│
├── A19..Others（其他）
│   └── M3(客戶自備殼體)、天線環 等
│
└── A21..Chamber technology（暗室技術）
    └── A211..SE Shielding Enclosure Collection
        ├── SE-R..Shielding Room（屏蔽室）
        ├── SE-D..Shielding Door（屏蔽門）
        ├── SE-H..Shielding Honeycomb Air Vent（蜂巢通風口）
        ├── SE-L..LED Lighting（低噪聲 LED 照明）
        ├── SE-X..Alignment Tools（校準工具）
        ├── SE-A..Access Panel（檢修面板）
        ├── SE-F..Power & Signal Filter（電源濾波）
        └── AB-X..EPP Absorber（吸波材料）
```

### 2.2 子系統展開範例（以 A1 OTA 系統為例）

```
A111..A1 OTA
├── A4 Anechoic Chamber System
│   ├── SE-R2 OTA Shielding Room
│   │   └── SE-R22 Shielding Room (3.5/1.7/1.7)  ← 含完整規格描述
│   ├── SE-D2 Shielding Swing Door
│   ├── SE-A1 Access panel
│   ├── AB-X1 EPP Absorber Set
│   ├── SE-F Power & Signal filter Set
│   └── SE-X Laser Alignment System
├── A4 RF System
│   └── （同上結構 + 零件 BOM）
├── A4 Positioner & Control System
│   └── M581.2539.A.C01..上蓋
│       M581.2539.A.C02..底座
│       M581.2539.A.C03..左右蓋
│       M581.2539.A.E01..RJ45接頭
│       M581.2539.A.E02..IC
│       ...（零件級 BOM）
├── A4 Measurement Software
├── A4 Upgrade
├── A4 System Acceptance
└── A4 System Warranty
```

### 2.3 獨立元件/模組（跨系統共用）

| 模組編號 | 名稱 | 說明 |
|----------|------|------|
| M581.2525 | **R2 Chamber** | **屏蔽箱體（Shielding Box + Door + RF + Control）** |
| M587.2528 | **M3-2D轉台** | **OTA 2D 轉台 DSPR** |
| M582.2512 | **M3 主被動路經切換器** | **OTA 路徑切換器** |
| M587.2527 | **垂直吊掛50cm轉台** | **垂直式精密轉台 R2_DSPR** |
| M581.2536 | **RJ45/USB filter_R2** | **訊號濾波器組** |
| M581.2544 | **Power filter_R2** | **電源濾波器** |
| M587.2566 | **Laser alignment_R2** | **雷射校準系統** |
| M587.2513 | **多饋源天線架 R2** | **多饋源天線架** |
| M587.2552 | **M class校驗治具** | **校驗治具 DSPR** |
| M582.2519 | **4路衰減切換器** | **衰減器模組** |
| M587.2568 | **反射面調整_R2** | **反射面調整治具** |
| M582.2511 | **R2路經切換器** | **整機路徑切換器** |
| M6XX | **費用** | **對內/對外費用** |

---

## 3. Excel 欄位對照分析 / Column Mapping Analysis

### 3.1 現有 26 個欄位

| 欄位代號 | Excel 欄 | 中文名稱 | 資料類型 | 範例 | 用途 |
|----------|----------|----------|----------|------|------|
| `Keynote` | A | **備註/排程** | Text | `12/12`、`外殼1/16` | **採購進度、到貨狀態** |
| `S` | B | **階層/狀態** | Number | `1.0`~`4.0` | **分類階層指示** |
| `No` | C | **序號** | Number | `1.0`~`8.0` | **同階排序** |
| `PN` | D | **料號/品名** | Text | `M581.2539.A.C01..上蓋` | **核心識別碼** |
| `O/N` | E | **訂單編號** | Text | `M587.2661` | **關聯訂單** |
| `O/D` | F | **訂單日期** | Number | `3.0` | **訂單相關** |
| `C1` | G | **分類1** | Text | | **分類標籤** |
| `C2` | H | **分類2** | Text | | **分類標籤** |
| `C3` | I | **分類3** | Text | | **分類標籤** |
| `Note` | J | **備註** | Text | `A2/A3/A4/A6/A8` | **適用系統** |
| `Cost` | K | **成本** | Decimal | `727.0` | **單項成本** |
| `Q'ty` | L | **數量** | Number | `2.0` | **需求數量** |
| `U/P` | M | **單價** | Decimal | `377.0` | **單位售價** |
| `Price` | N | **總價** | Decimal | `30.0` | **總售價** |
| `Profit` | O | **利潤** | Decimal | `22.0` | **毛利金額** |
| `P/M` | P | **利潤率** | Decimal | `0.733` | **毛利率** |
| `Discount %` | Q | **折扣率** | Decimal | | **折扣百分比** |
| `Dis profit` | R | **折後利潤** | Decimal | | **折扣後毛利** |
| `Dis P/M` | S2 | **折後利潤率** | Decimal | | **折扣後毛利率** |
| `Days` | T | **天數** | Number | `10.0` | **交期天數** |
| `Link` | U | **連結** | Text | | **外部連結** |
| `remark` | V | **備註2** | Text | | **額外備註** |
| `Internal No.` | W | **內部編號** | Text | | **內部追蹤碼** |
| `Unit/Weight` | X | **單位重量** | Decimal | `0.5` | **單件重量** |
| `Packet/Weight` | Y | **包裝重量** | Decimal | `0.8` | **包裝後重量** |
| `Owner` | Z | **負責人** | Text | `Patrick` | **產品負責人** |

### 3.2 PN 編碼解析規則

```
M581.2539.A.C01..上蓋
│    │     │ │    │
│    │     │ │    └── 名稱（中文或英文）
│    │     │ └─────── 零件分類+序號（C=CNC, E=電子, S=鈑金, D=耗材, A=外購, M=模組...）
│    │     └───────── 版本/型式（A, B, C...）
│    └─────────────── 專案/產品編號
└──────────────────── 產品線代碼（M581/M582/M583/M587...）

零件分類碼：
  C = CNC 加工件（機構件）
  S = 鈑金件
  E = 電子元件
  D = 耗材/線材
  A = 外購件（天線、Cable、RF元件）
  M = 模組/成品採購件
  N = 電路板/PCB
  B = 子模組（引用其他模組）
  U = 鋁擠型件
  F = 吸波材料/泡棉
  P = 皮帶輪/傳動件
  J = 加工費（焊接、烤漆、設計）
  X = 螺絲/標準件
  W = 文件與圖
  Q = Q&A
  K = 特殊件
```

---

## 4. 技術方案評估 / Technical Solution Evaluation

### 4.1 方案 A — 純前端靜態方案（HTML/JS + JSON）

| 項目 | 評估 |
|------|------|
| **技術棧** | HTML/CSS/JS + JSON 資料檔 |
| **優點** | **部署簡單、無需後端、離線可用、Git 版控** |
| **缺點** | **1,585 筆在前端跑得動，但編輯功能有限** |
| **適合情境** | **僅預覽/查詢，不需頻繁編輯** |
| **難度** | ⭐⭐ |

### 4.2 方案 B — 輕量級全端方案（Next.js + SQLite）

| 項目 | 評估 |
|------|------|
| **技術棧** | Next.js + Prisma + SQLite |
| **優點** | **搜尋快速、TreeView 成熟元件、Excel 匯入匯出、本機即可運行** |
| **缺點** | **需裝 Node.js 環境** |
| **適合情境** | **✅ 最適合目前需求（1,585 筆、需編輯、需展開收合）** |
| **難度** | ⭐⭐⭐ |

### 4.3 方案 C — 企業級方案（React + PostgreSQL + RBAC）

| 項目 | 評估 |
|------|------|
| **技術棧** | React + NestJS + PostgreSQL + RBAC |
| **優點** | **完整權限控管、審計追蹤** |
| **缺點** | **目前規模不需要這麼重** |
| **適合情境** | **未來多部門、多角色時再升級** |
| **難度** | ⭐⭐⭐⭐⭐ |

---

## 5. 資料庫 Schema 設計 / Database Schema Design

### 5.1 categories 表（分類節點）

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `id` | UUID | ✅ | **唯一識別碼** |
| `code` | String | ✅ | **分類編碼（A1, A11, A111...）** |
| `name` | String | ✅ | **分類名稱（System, A class, A1 OTA...）** |
| `parent_id` | UUID | ❌ | **父層 ID（null 為根節點）** |
| `level` | Integer | ✅ | **階層深度（0 起算）** |
| `sort_order` | Integer | ✅ | **同階排序（對應 Excel `No` 欄）** |
| `is_active` | Boolean | ✅ | **是否啟用** |

### 5.2 products 表（產品/零件）

| 欄位 | 類型 | 必填 | 說明 | 對應 Excel 欄 |
|------|------|------|------|--------------|
| `id` | UUID | ✅ | **唯一識別碼** | — |
| `category_id` | UUID | ✅ | **所屬分類** | — |
| `pn` | String | ✅ | **料號** | `PN` |
| `name` | String | ✅ | **品名** | `PN` (.. 後) |
| `description` | Text | ❌ | **規格描述（多行）** | `PN` 下方 |
| `order_number` | String | ❌ | **訂單編號** | `O/N` |
| `cost` | Decimal | ❌ | **成本** | `Cost` |
| `quantity` | Integer | ❌ | **數量** | `Q'ty` |
| `unit_price` | Decimal | ❌ | **單價** | `U/P` |
| `total_price` | Decimal | ❌ | **總價** | `Price` |
| `profit` | Decimal | ❌ | **利潤** | `Profit` |
| `profit_margin` | Decimal | ❌ | **利潤率** | `P/M` |
| `discount_pct` | Decimal | ❌ | **折扣率** | `Discount %` |
| `lead_days` | Integer | ❌ | **交期天數** | `Days` |
| `owner` | String | ❌ | **負責人** | `Owner` |
| `part_type` | Enum | ❌ | **零件分類** | PN 解析 |
| `keynote` | Text | ❌ | **進度備註** | `Keynote` |
| `note` | Text | ❌ | **備註** | `Note` |
| `remark` | Text | ❌ | **備註2** | `remark` |
| `internal_no` | String | ❌ | **內部編號** | `Internal No.` |
| `unit_weight` | Decimal | ❌ | **單位重量** | `Unit/Weight` |
| `packet_weight` | Decimal | ❌ | **包裝重量** | `Packet/Weight` |
| `link` | String | ❌ | **外部連結** | `Link` |
| `sort_order` | Integer | ✅ | **排序** | `S` + `No` |
| `is_active` | Boolean | ✅ | **是否啟用** | — |
| `created_at` | DateTime | ✅ | **建立時間** | — |
| `updated_at` | DateTime | ✅ | **更新時間** | — |

### 5.3 part_type 列舉值

| 代碼 | 中文 | English |
|------|------|---------|
| `C` | **CNC 加工件** | *CNC machined parts* |
| `S` | **鈑金件** | *Sheet metal parts* |
| `E` | **電子元件** | *Electronic components* |
| `D` | **耗材/線材** | *Consumables/wiring* |
| `A` | **外購件** | *Purchased parts (antenna, cable, RF)* |
| `M` | **模組/成品** | *Modules/assemblies* |
| `N` | **電路板 PCB** | *PCB boards* |
| `B` | **子模組引用** | *Sub-module reference* |
| `U` | **鋁擠型件** | *Aluminum extrusion* |
| `F` | **吸波材/泡棉** | *Absorber/foam* |
| `P` | **皮帶輪/傳動** | *Belt/drive parts* |
| `J` | **加工費** | *Processing fees* |
| `X` | **螺絲/標準件** | *Screws/standard parts* |
| `W` | **文件與圖** | *Documents & drawings* |

---

## 6. 核心功能需求 / Core Feature Requirements

### 6.1 必備功能 (P0 — Must Have)

| 功能 | 說明 |
|------|------|
| **多階層樹狀結構** | **支援 6+ 層級，對應 A1→A11→A111→子系統→元件→零件** |
| **展開/收合** | **點擊節點可開合子層，每層顯示產品數量統計** |
| **Excel 匯入** | **直接解析 `2026產品牌價.xlsx` 格式** |
| **搜尋功能** | **依 PN、名稱、負責人、備註搜尋** |
| **產品詳細頁** | **顯示完整 22 個欄位 + 多行規格描述** |
| **CRUD 操作** | **新增/編輯/刪除 分類與產品** |

### 6.2 重要功能 (P1 — Should Have)

| 功能 | 說明 |
|------|------|
| **Excel 匯出** | **匯出為與原始格式相容的 Excel** |
| **篩選器** | **依大項、零件分類(C/S/E/A...)、負責人篩選** |
| **成本/價格統計** | **自動加總子項成本與售價** |
| **PN 編碼解析** | **自動拆解 PN 顯示產品線、專案號、零件類型** |
| **批次操作** | **勾選多項批次修改負責人/狀態** |

### 6.3 加值功能 (P2 — Nice to Have)

| 功能 | 說明 |
|------|------|
| **BOM 展開** | **以 BOM 樹狀圖呈現完整物料清單** |
| **版本歷史** | **記錄每筆修改的時間/人員/差異** |
| **價格計算器** | **自動計算利潤率、折扣後價格** |
| **報表產出** | **按分類匯出牌價表 PDF** |

---

## 7. UI/UX 設計方向 / UI/UX Design Direction

### 7.1 主介面佈局

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍 搜尋 PN/名稱/負責人...     [零件類型 ▾] [負責人 ▾] [匯入] [匯出] │
├─────────────────────┬───────────────────────────────────────────┤
│                     │                                           │
│ 📂 A1..System       │  PN: M581.2539.A.C01                     │
│ ├─📂 A11..A class   │  名稱: 上蓋                               │
│ │ ├─📂 A111..A1 OTA │  ──────────────────────                  │
│ │ │ ├─ A1 Chamber   │  分類: CNC 加工件 (C)                     │
│ │ │ │ ├─ SE-R22 ... │  規格: 90x30x16.18mm, AL6061             │
│ │ │ │ ├─ SE-D2  ... │  ──────────────────────                  │
│ │ │ │ └─ AB-X1  ... │  成本: $727    數量: 1                    │
│ │ │ ├─ A1 RF System │  單價: $727    總價: $727                  │
│ │ │ ├─ A1 Positioner│  利潤: —       利潤率: —                   │
│ │ │ ├─ A1 Upgrade   │  ──────────────────────                  │
│ │ │ └─ A1 Warranty  │  交期: —  天   負責人: —                   │
│ │ ├─📂 A112..A2 OTA │  備註: 預1/9到貨3個 缺2個追加1/16到貨       │
│ │ └─ ...            │                                           │
│ ├─📂 A12..B class   │                                           │
│ ├─📂 A15..R class   │              [儲存]  [刪除]  [複製]        │
│ └─📂 A21..Chamber   │                                           │
│                     │                                           │
├─────────────────────┴───────────────────────────────────────────┤
│ 共 1,585 筆  │ A class: 892 │ B class: 128 │ R class: 45 │ ... │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 互動設計

- **左側樹狀面板：** **▶/▼ 展開收合、節點旁顯示子項數量、右鍵選單操作**
- **右側詳細面板：** **選中產品即顯示完整欄位，可直接 inline 編輯**
- **多行規格：** **SE-R22 等產品的長規格描述以可展開區塊呈現**
- **Keynote 標記：** **採購進度備註以彩色標籤呈現（到貨 = 綠、缺料 = 紅）**

---

## 8. 建議方案 / Recommended Approach

### 建議採用方案 B — Next.js + SQLite

**理由：**

1. **資料量合適** — **1,585 筆用 SQLite 綽綽有餘，單檔案免裝 DB**
2. **階層結構** — **React 的 TreeView 元件（如 `react-arborist`）完美支援 6+ 層**
3. **Excel 相容** — **`xlsx` 套件直接讀寫原始 Excel 格式**
4. **本機運行** — **`npx next dev` 即可啟動，無需雲端部署**
5. **未來可擴展** — **需要時可升級 PostgreSQL + 多人協作**

*Recommended: Next.js + SQLite — fits 1,585 records, deep hierarchy, Excel import/export, runs locally.*

---

## 9. 執行里程碑 / Implementation Milestones

| 階段 | 內容 | 交付物 |
|------|------|--------|
| **Phase 0** ✅ | **資料分析** | **Excel 結構解析、PN 編碼規則、分類架構（本文件）** |
| **Phase 1** | **Excel 解析器** | **Python 腳本將 Excel 轉為結構化 JSON** |
| **Phase 2** | **資料模型** | **SQLite schema + seed data** |
| **Phase 3** | **後端 API** | **CRUD + 搜尋 + 樹狀查詢 API** |
| **Phase 4** | **前端 — 樹狀結構** | **可展開收合的分類樹 + 產品數量統計** |
| **Phase 5** | **前端 — 產品管理** | **詳細頁、inline 編輯、搜尋篩選** |
| **Phase 6** | **匯入/匯出** | **Excel 雙向相容** |
| **Phase 7** | **測試與優化** | **效能、UX 調校** |

---

## 10. 待確認事項 / Open Questions

> **以下事項需要 Bill 確認後才能進入開發階段：**

| # | 問題 | 備註 |
|---|------|------|
| 1 | ✅ **七大分類已確認** | *A1 系統/A2 硬體/A3 服務/A4 升級/A5 未整理/A6 軍用/A7 代理* |
| 2 | ✅ **階層規則已確認** | *A1→A11→A111→A111.xx* |
| 3 | ✅ **資料來源已確認** | *全部在同一份 Excel 中* |
| 4 | **使用者人數？** | *僅自己 / 小團隊 / 大團隊* |
| 5 | **部署方式？** | *本機使用 / 內網 / 雲端* |
| 6 | **價格/成本欄位是否需要隱藏權限？** | *部分使用者不可見？* |
| 7 | **偏好的前端框架？** | *React(Next.js) / Vue(Nuxt) / 其他* |
| 8 | **PN 編碼規則是否有正式文件？** | *我目前是從 Excel 反推的* |
| 9 | **Keynote 欄位（採購進度）是否需要獨立追蹤功能？** | *目前是自由文字* |

---

## 11. 下一步 / Next Steps

1. **💬 請回覆第 10 節的待確認事項**
2. **📄 如有其他大分類（硬體/服務/升級/代理/軍用）的 Excel 也請放入 `reference/`**
3. **✅ 確認後啟動 Phase 1 — Excel 解析器開發**

*Answer open questions, provide additional data if available, then we start Phase 1.*

---

*Document V2.0 — Updated with actual Excel data analysis*
*Generated by Claude Opus 4.6 for PRD project — 2026-04-22*
