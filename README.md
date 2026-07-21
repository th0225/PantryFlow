# PantryFlow

PantryFlow 是一套個人使用、手機優先的食材庫存與日常記帳 PWA。它把「採買、支出、庫存與餐費」串成同一條資料流程，並以先進先出（FIFO）計算每餐實際消耗的食材成本。

所有正式資料都保存在瀏覽器的 IndexedDB，不需要帳號或後端服務；完成首次載入後可安裝並離線使用。

## 主要功能

- 儀表板：查看本月收入、支出、收支差額、最近餐點與庫存摘要。
- 日常記帳：新增、編輯、刪除及篩選一般收入與支出。
- 食材採買：一張採買單可包含多個品項，並同步建立食材支出與庫存批次。
- 直接輸入食材：品項可輸入新名稱或選用既有名稱；新食材會依單位自動判斷重量、容量或數量維度。
- 自動加總：實付總額由所有品項小計即時計算；如有折扣，直接填入各品項的折後小計。
- FIFO 庫存：依購入時間扣除批次，追蹤效期、剩餘數量與剩餘成本。
- 餐費計算：記錄每餐的食材用量，自動計算跨批次的實際成本。
- 庫存調減：支援過期、丟棄、損壞、盤點短少與其他原因。
- 歷史重算：修改或刪除舊資料時重新計算後續 FIFO；若會造成負庫存，整筆操作會回滾。
- 本機資料管理：支援 JSON 備份、整庫還原與清除全部資料。
- 響應式介面：支援手機與桌面版、深色模式及鍵盤操作。

## 快速開始

需要先安裝 Node.js `^20.19.0` 或 `>=22.12.0`，以及 npm。

```bash
git clone https://github.com/th0225/PantryFlow.git
cd PantryFlow
npm ci
npm run dev
```

依終端機顯示的網址開啟應用程式，通常是 `http://localhost:5173/PantryFlow/`。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Vite 開發伺服器 |
| `npm run typecheck` | 執行 TypeScript 型別檢查 |
| `npm test` | 執行 Vitest 測試 |
| `npm run build` | 建立正式版並產生 PWA 資源 |
| `npm run preview` | 在本機預覽正式建置結果 |

建議在提交前執行：

```bash
npm run typecheck
npm test
npm run build
```

## 使用流程

1. 在「採買」建立採買單，直接輸入食材名稱、數量、單位與小計。
2. 系統自動加總品項小計，並同步建立支出與各品項的庫存批次。
3. 在「餐點」選擇使用的食材與數量。
4. 系統依 FIFO 扣除一個或多個批次，更新庫存並計算餐費。

支援的輸入單位：

- 重量：`g`、`kg`
- 容量：`ml`、`L`
- 數量：`個`、`包`

目前 `1 包` 視為 `1 個` 庫存單位，不推算包裝內件數，也不進行重量、容量與數量之間的換算。

## 資料與隱私

- 資料只儲存在目前瀏覽器的 IndexedDB，不會自動上傳或同步。
- 清除網站資料、瀏覽器資料或移除瀏覽器設定檔，可能一併刪除 PantryFlow 資料。
- 建議定期從設定頁匯出 JSON 備份。
- 匯入備份採整庫取代，不會與目前資料合併。
- UI 中的新台幣金額以整數元輸入及顯示；資料模型以整數分保存，避免浮點數誤差。

## PWA 與部署

正式網站：[https://th0225.github.io/PantryFlow/](https://th0225.github.io/PantryFlow/)

推送至 `master` 後，GitHub Actions 會執行型別檢查、測試與正式建置，再將 `dist/` 自動部署至 GitHub Pages。除 `localhost` 外，PWA 安裝與 Service Worker 需要 HTTPS。

首次成功載入並完成快取後，應用程式可由支援的瀏覽器安裝，並在離線狀態重新開啟。

## 技術架構

- React 19、TypeScript、React Router
- Vite、Tailwind CSS、Vite PWA
- Dexie / IndexedDB
- Zod 資料驗證
- Vitest、fake-indexeddb
- Phosphor Icons

```text
src/
├── components/   共用 UI、對話框與操作回饋
├── data/         IndexedDB schema、repository 與 React data provider
├── domain/       單位換算、成本分攤、FIFO 與領域型別
├── lib/          格式化與選項定義
└── pages/        儀表板、記帳、採買、庫存、餐點與設定頁
```

資料寫入與 FIFO 重算會在同一個 IndexedDB transaction 內完成。驗證、品項成本計算或庫存重算任一步驟失敗時，不會留下部分寫入。

## 規格

完整產品範圍、資料模型、計算規則與驗收條件請參考 [SPEC.md](./SPEC.md)。
