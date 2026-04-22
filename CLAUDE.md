# PRD 專案指令 / Project Instructions

## 啟動流程 / Startup flow

每次對話開始時，自動執行以下步驟：

1. **讀取全域偏好** — `/Users/billwu/Desktop/AI agent/Claude code/System/Skills/SKL-Bill/SKL-Bill-Global-Skill.md`
   *Read global preferences — SKL-Bill-Global-Skill.md*

2. **讀取專案技能** — `/Users/billwu/Desktop/AI agent/Claude code/System/Skills/PRD/SKL-PRD.V*.md`（最新版本）
   *Read project skills — latest SKL-PRD.V*.md*

3. **讀取錯誤紀錄** — `PRD-MST.md`
   *Read error log — PRD-MST.md*

4. **讀取討論紀錄** — `PRD-QA.md`
   *Read discussion log — PRD-QA.md*

5. **輸出歡迎訊息** — 🟡 專案名稱 + 模型 + Token 使用量 + 激勵話語 + 天線新聞
   *Output greeting — 🟡 project name + model + token usage + encouraging message + antenna news*

## 專案設定 / Project Configuration

- **專案名稱 / Project Name:** PRD
- **模型 / Model:** claude-opus-4-6
- **建立日期 / Created:** 2026-04-22

## 回覆格式 / Response Formatting

遵循 SKL-Bill 全域偏好中的雙語回覆格式：
- **中文用粗體，英文用斜體**
- **中文在前，英文在後**
- 程式碼、檔案路徑、標題不強制套用樣式

*Follow SKL-Bill global preferences for bilingual responses:*
- *Chinese in **bold**, English in *italics**
- *Chinese first, then English*
- *Code, file paths, headings exempt from styling*

## 錯誤處理 / Error Handling

- **遇到錯誤時，記錄到 `PRD-MST.md`**
- **重要討論記錄到 `PRD-QA.md`**
- **這兩個檔案為追加式更新**

*On error: record in MST. On important discussion: record in QA. Both files use append-mode.*
