# PantryFlow 產品與技術規格

## 1. 產品概述

PantryFlow 是一套個人使用、手機優先的食材庫存與日常記帳 PWA。使用者可以記錄一般收入與支出，將食材採買同步建立為支出及庫存批次，並在每餐輸入實際使用量。系統依先進先出（FIFO）原則扣除庫存，計算每餐實際食材成本。

第一版不需要登入或後端服務。正式資料儲存在瀏覽器 IndexedDB，應用程式可安裝並離線使用，資料透過 JSON 檔案備份與還原。

## 2. 目標與成功條件

- 可記錄、修改及刪除一般收入與支出。
- 一張採買單可包含多個食材品項，並同步產生一筆食材支出。
- 食材採買後會依品項建立具成本及效期的庫存批次。
- 使用者可記錄一餐使用的多種食材及用量。
- 系統能依 FIFO 正確扣除一個或多個批次，且不允許負庫存。
- 每餐成本等於實際扣除批次的成本總和。
- 修改歷史資料後，系統能重新計算後續庫存與餐費；若會造成任一時點庫存不足，修改不得生效。
- 完整資料可匯出為 JSON，並可在同版或相容版本中還原。
- 應用程式在完成首次載入後可離線開啟及操作。

## 3. 第一版範圍

### 3.1 儀表板

- 顯示本月收入、支出及收支差額。
- 顯示最近餐點及各餐成本。
- 顯示目前有庫存的食材及剩餘量摘要。
- 顯示已過期與即將到期的庫存批次；第一版不發送通知。

### 3.2 一般記帳

- 交易類型：收入、支出。
- 欄位：日期、金額、分類、備註。
- 可依月份、交易類型及分類篩選。
- 顯示所選月份的收入、支出及差額。
- 可新增、修改及刪除一般交易。
- 由採買單建立的支出不可脫離採買單獨立修改；應由採買單流程同步維護。

### 3.3 食材採買

- 採買單欄位：商店、日期、由品項小計自動加總的實付總額、備註。
- 採買單包含一個以上品項。
- 品項欄位：食材、數量、輸入單位、品項小計、有效日期（可選）。
- 品項的食材名稱可直接輸入，並提供既有食材名稱建議；產品不另設獨立的食材管理介面。
- 名稱正規化後若符合既有食材則沿用，否則在儲存採買單時自動建立；新食材的計量維度由輸入單位決定。
- 自動建立食材、採買單、連結支出、庫存批次及 FIFO 重算必須在同一筆資料庫 transaction 內完成，任一步驟失敗皆完整回滾。
- 儲存後為每個品項建立獨立庫存批次，並建立或更新一筆連結的食材支出。
- 實付總額由所有品項小計自動加總，且每個品項的購入成本等於該品項小計。
- 修改或刪除採買單前，必須試算歷史 FIFO；若會使任一後續事件庫存不足，操作失敗且原資料保持不變。

### 3.4 食材與庫存

- 食材包含名稱、計量維度、基準單位及備註。
- 計量維度：重量、容量、數量。
- 基準單位固定為：重量使用 `g`、容量使用 `ml`、數量使用 `個`。
- 支援的輸入單位：`g`、`kg`、`ml`、`L`、`個`、`包`。
- 同一食材只能使用其計量維度內的單位，不允許重量、容量與數量互換。
- `kg` 轉換為 `g`，`L` 轉換為 `ml`；`包` 在第一版視為數量單位，1 包等於 1 個庫存單位，不處理包內件數。
- 庫存依食材及採買批次顯示購入日、有效日期、原始數量、剩餘數量、分攤成本及剩餘成本。
- 可新增庫存調減，原因包含：過期、丟棄、損壞、盤點短少、其他。
- 庫存調減不計入餐費，但會依 FIFO 扣減批次數量及其剩餘成本。

### 3.5 餐點

- 餐點欄位：日期時間、餐別、備註。
- 餐別預設提供早餐、午餐、晚餐、點心、其他。
- 一餐包含一個以上食材用量。
- 食材用量以該食材所屬維度的單位輸入，儲存前轉成基準單位。
- 儲存前顯示可用庫存；數量不足時禁止儲存並指出不足食材及缺少量。
- 儲存後顯示整餐食材總成本，不計算每人份或各道菜成本。
- 修改或刪除歷史餐點時，必須重新執行所有後續 FIFO 分配。

### 3.6 設定與資料管理

- 管理收入及支出分類：新增、改名、設定顏色、停用。
- 已被交易使用的分類不可實體刪除，只能停用。
- 匯出完整 JSON 備份。
- 匯入前驗證格式及版本，顯示將取代現有資料的確認提示。
- 還原採整庫取代，不合併現有資料。
- 所有資料通過驗證並完成 FIFO 重算後，才可提交還原 transaction。
- 提供清除全部資料功能，執行前需二次確認。

## 4. 不在第一版範圍

- 帳號、登入、多人共享及雲端同步。
- OCR 收據辨識與條碼掃描。
- 食譜、菜色拆分及每人份成本。
- 預算、帳戶餘額、轉帳、信用卡帳單及資產管理。
- 低庫存或效期推播通知。
- 多幣別、匯率及稅務功能。
- 瓦斯、電力、人工等非食材餐費。
- 重量、容量、個數之間的密度或份量換算。

## 5. 資料模型

所有 ID 使用 UUID。所有日期時間以 ISO 8601 儲存，畫面依 `Asia/Taipei` 顯示。金額使用整數表示百分之一新台幣，禁止以浮點數直接保存貨幣值。

### Category

```ts
interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Transaction

```ts
interface Transaction {
  id: string;
  type: 'income' | 'expense';
  occurredAt: string;
  amountCents: number;
  categoryId: string;
  note?: string;
  purchaseId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Ingredient

```ts
type MeasurementDimension = 'mass' | 'volume' | 'count';
type BaseUnit = 'g' | 'ml' | 'each';

interface Ingredient {
  id: string;
  name: string;
  dimension: MeasurementDimension;
  baseUnit: BaseUnit;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
```

僅未被採買品項、庫存調整或餐點用量引用的食材可永久刪除；已有歷史紀錄者必須保留，避免破壞帳務與 FIFO 成本。

### Purchase 與 PurchaseItem

```ts
interface Purchase {
  id: string;
  store: string;
  occurredAt: string;
  paidTotalCents: number;
  note?: string;
  transactionId: string;
  createdAt: string;
  updatedAt: string;
}

interface PurchaseItem {
  id: string;
  purchaseId: string;
  ingredientId: string;
  quantityBase: number;
  enteredQuantity: number;
  enteredUnit: 'g' | 'kg' | 'ml' | 'L' | 'each' | 'pack';
  subtotalCents: number;
  allocatedCostCents: number;
  expiresOn?: string;
  createdAt: string;
  updatedAt: string;
}
```

`PurchaseItem` 同時代表購入批次。剩餘數量與剩餘成本屬於重算後的衍生狀態，不作為可獨立修改的來源資料。

### InventoryAdjustment

```ts
interface InventoryAdjustment {
  id: string;
  ingredientId: string;
  occurredAt: string;
  quantityBase: number;
  reason: 'expired' | 'discarded' | 'damaged' | 'stocktake_shortage' | 'other';
  note?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Meal 與 MealIngredient

```ts
interface Meal {
  id: string;
  occurredAt: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
  note?: string;
  totalCostCents: number;
  createdAt: string;
  updatedAt: string;
}

interface MealIngredient {
  id: string;
  mealId: string;
  ingredientId: string;
  quantityBase: number;
  enteredQuantity: number;
  enteredUnit: 'g' | 'kg' | 'ml' | 'L' | 'each' | 'pack';
}
```

### ConsumptionAllocation

```ts
interface ConsumptionAllocation {
  id: string;
  sourceType: 'meal' | 'adjustment';
  sourceId: string;
  mealIngredientId?: string;
  purchaseItemId: string;
  ingredientId: string;
  quantityBase: number;
  costCents: number;
}
```

`ConsumptionAllocation` 完全由重算流程產生，不允許 UI 直接修改。調整事件的 `costCents` 用於維持批次剩餘成本，但不得加入餐費。

## 6. 計算規則

### 6.1 單位轉換

- `kg × 1000 = g`
- `L × 1000 = ml`
- `each` 與 `pack` 皆轉為數量基準單位；第一版 `1 pack = 1 each`。
- 數量必須大於 0，轉換結果必須為有限數值。
- 轉換前必須確認輸入單位與食材計量維度一致。

### 6.2 採買金額與品項成本

1. 所有品項小計必須大於或等於 0，且至少一項大於 0。
2. `paidTotalCents` 必須由所有 `subtotalCents` 安全加總產生，不由使用者另外輸入。
3. 每個品項的 `allocatedCostCents` 等於該品項的 `subtotalCents`。
4. 所有 `allocatedCostCents` 加總必須精確等於 `paidTotalCents`，且整個加總結果不得超過安全整數範圍。

### 6.3 FIFO 重算

1. 清除既有 `ConsumptionAllocation` 與所有衍生餘額。
2. 依食材分組建立購入批次；批次依 `occurredAt`、`createdAt`、ID 排序。
3. 將餐點用量與庫存調減合併成消耗事件，依 `occurredAt`、`createdAt`、ID 排序。
4. 每個消耗事件從當時已購入且仍有餘量的最早批次開始扣除。
5. 扣除部分批次時，成本依該批次當下剩餘成本與剩餘數量比例計算並四捨五入至分。
6. 若消耗完該批次，分配該批次全部剩餘成本，以吸收累積捨入差異。
7. 若任一事件找不到足夠庫存，整次重算失敗，回報食材、事件時間及缺少數量。
8. 餐點總成本為其所有 meal allocation 的成本總和；調整 allocation 不列入餐點成本。
9. 所有會影響歷史的新增、修改、刪除及還原，都必須在同一 IndexedDB transaction 中先執行重算，成功後才提交。

## 7. 儲存、備份與離線

- IndexedDB 保存所有正式來源資料及重算產物。
- 建議使用 Dexie 定義資料表、索引、版本及 transaction。
- `localStorage` 只保存主題、最近使用的月份與篩選條件，不保存正式帳務或庫存資料。
- 備份 JSON 頂層格式：

```ts
interface PantryFlowBackup {
  schemaVersion: 1;
  exportedAt: string;
  app: 'PantryFlow';
  data: {
    categories: Category[];
    transactions: Transaction[];
    ingredients: Ingredient[];
    purchases: Purchase[];
    purchaseItems: PurchaseItem[];
    adjustments: InventoryAdjustment[];
    meals: Meal[];
    mealIngredients: MealIngredient[];
  };
}
```

- 備份不包含可重新產生的 allocations 或 UI 偏好。
- 匯入使用 Zod 完整驗證，不接受未知 schema version、重複 ID、孤立關聯或非法數值。
- PWA service worker 採 precache 應用程式殼層；使用者資料不進入 Cache Storage。

## 8. UI 與導覽

- 手機版使用底部導覽：首頁、記帳、採買、庫存、餐點；設定由頁首選單進入。
- 桌面版可切換為左側導覽，但功能與手機版一致。
- 主要新增操作使用清楚的浮動或頁面主按鈕。
- 所有金額顯示為 `NT$` 整數元，顯示時四捨五入且不顯示小數；金額表單僅接受整數元。
- 破壞性操作使用確認對話框，說明受影響資料。
- 表單錯誤顯示在對應欄位附近；FIFO 失敗需顯示可採取行動的庫存不足訊息。
- 首次使用時建立預設分類，例如薪資、其他收入、食材、餐飲、交通、居家、娛樂及其他支出。

## 9. 技術架構

- React + TypeScript + Vite。
- React Router 管理頁面路由。
- Dexie 管理 IndexedDB schema 與 transaction。
- Zod 驗證表單、備份及資料邊界。
- Tailwind CSS 建立手機優先版面。
- `vite-plugin-pwa` 產生 manifest 與 service worker。
- 核心單位、品項金額加總、成本分攤及 FIFO 邏輯須設計為不依賴 React 或 IndexedDB 的純函式；資料服務負責在 transaction 中呼叫核心邏輯。

## 10. 測試與驗收

### 單元測試

- `kg/g`、`L/ml`、`個/包` 正確轉換。
- 不相容單位、零值、負值及非有限數值被拒絕。
- 多個品項小計能安全加總，且負值、非整數分與溢位總額會被拒絕。
- 多批不同價格食材依 FIFO 正確扣料。
- 單次用量跨越多個批次時，數量與成本正確。
- 批次完全耗盡時不殘留捨入成本。
- 調整會扣除庫存成本，但不增加餐費。
- 庫存不足時回報錯誤且不產生部分 allocation。

### 整合測試

- 儲存採買單後，同時出現自動加總的支出、庫存批次與正確品項成本。
- 直接輸入新食材名稱時依單位建立正確維度；同名既有食材或同張採買單內的重複名稱不會重複建立。
- 自動建立食材後若採買驗證或 FIFO 重算失敗，食材與採買相關資料皆不留下部分寫入。
- 修改採買日期、數量或價格後，後續餐點 allocation 與成本重新計算。
- 不合法的歷史修改完整回滾。
- 刪除採買、餐點或調整後，不留下孤立關聯。
- JSON 匯出再匯入後，來源資料、庫存及餐費結果一致。

### 端對端驗收

- 使用者可完成「新增兩批不同價格食材 → 建立跨批次餐點 → 查看餐費」流程。
- 使用者可完成「建立採買單 → 自動產生支出 → 查看本月統計」流程。
- 應用程式首次載入後，在離線狀態仍可重新開啟並新增資料。
- 手機寬度下所有主要流程可操作，無水平捲動或被底部導覽遮擋的內容。

## 11. 預設與限制

- 語言：繁體中文。
- 時區：Asia/Taipei。
- 幣別：TWD。
- 使用者：單一個人、單一瀏覽器資料庫。
- 餐費僅包含食材成本。
- IndexedDB 或 localStorage 均可能因使用者清除網站資料而遺失；產品介面應提醒定期匯出 JSON 備份。
