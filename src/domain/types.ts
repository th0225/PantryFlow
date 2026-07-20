export type EntityId = string
export type ISODateTime = string
export type ISODate = string
export type MoneyCents = number

export type TransactionType = 'income' | 'expense'

export interface Category {
  id: EntityId
  name: string
  type: TransactionType
  color: string
  isActive: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Transaction {
  id: EntityId
  type: TransactionType
  occurredAt: ISODateTime
  amountCents: MoneyCents
  categoryId: EntityId
  note?: string
  purchaseId?: EntityId
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type MeasurementDimension = 'mass' | 'volume' | 'count'
export type BaseUnit = 'g' | 'ml' | 'each'
export type InputUnit = 'g' | 'kg' | 'ml' | 'L' | 'each' | 'pack'

export interface Ingredient {
  id: EntityId
  name: string
  dimension: MeasurementDimension
  baseUnit: BaseUnit
  note?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Purchase {
  id: EntityId
  store: string
  occurredAt: ISODateTime
  paidTotalCents: MoneyCents
  note?: string
  transactionId: EntityId
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface PurchaseItem {
  id: EntityId
  purchaseId: EntityId
  ingredientId: EntityId
  quantityBase: number
  enteredQuantity: number
  enteredUnit: InputUnit
  subtotalCents: MoneyCents
  allocatedCostCents: MoneyCents
  expiresOn?: ISODate
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type InventoryAdjustmentReason =
  | 'expired'
  | 'discarded'
  | 'damaged'
  | 'stocktake_shortage'
  | 'other'

export interface InventoryAdjustment {
  id: EntityId
  ingredientId: EntityId
  occurredAt: ISODateTime
  quantityBase: number
  reason: InventoryAdjustmentReason
  note?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other'

export interface Meal {
  id: EntityId
  occurredAt: ISODateTime
  mealType: MealType
  note?: string
  /** Derived by FIFO recalculation and persisted for efficient reads. */
  totalCostCents: MoneyCents
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface MealIngredient {
  id: EntityId
  mealId: EntityId
  ingredientId: EntityId
  quantityBase: number
  enteredQuantity: number
  enteredUnit: InputUnit
}

export type ConsumptionSourceType = 'meal' | 'adjustment'

export interface ConsumptionAllocation {
  id: EntityId
  sourceType: ConsumptionSourceType
  sourceId: EntityId
  mealIngredientId?: EntityId
  purchaseItemId: EntityId
  ingredientId: EntityId
  quantityBase: number
  costCents: MoneyCents
}

export interface PantryFlowBackupData {
  categories: Category[]
  transactions: Transaction[]
  ingredients: Ingredient[]
  purchases: Purchase[]
  purchaseItems: PurchaseItem[]
  adjustments: InventoryAdjustment[]
  meals: Meal[]
  mealIngredients: MealIngredient[]
}

export interface PantryFlowBackup {
  schemaVersion: 1
  exportedAt: ISODateTime
  app: 'PantryFlow'
  data: PantryFlowBackupData
}

/** Source records required to rebuild all inventory-derived state. */
export interface InventorySnapshot {
  readonly purchases: readonly Purchase[]
  readonly purchaseItems: readonly PurchaseItem[]
  readonly adjustments: readonly InventoryAdjustment[]
  readonly meals: readonly Meal[]
  readonly mealIngredients: readonly MealIngredient[]
}

/** A complete, immutable view of all source records at one point in time. */
export interface PantryFlowSnapshot extends InventorySnapshot {
  readonly categories: readonly Category[]
  readonly transactions: readonly Transaction[]
  readonly ingredients: readonly Ingredient[]
}

/**
 * PurchaseItem is the source batch; this shape adds values derived by FIFO.
 * `id` and `purchaseItemId` intentionally contain the same source ID so the
 * result is convenient both as a batch entity and as an allocation target.
 */
export interface DerivedInventoryBatch {
  id: EntityId
  purchaseItemId: EntityId
  purchaseId: EntityId
  ingredientId: EntityId
  occurredAt: ISODateTime
  createdAt: ISODateTime
  expiresOn?: ISODate
  enteredQuantity: number
  enteredUnit: InputUnit
  subtotalCents: MoneyCents
  quantityBase: number
  originalQuantityBase: number
  remainingQuantityBase: number
  allocatedCostCents: MoneyCents
  remainingCostCents: MoneyCents
}

export type DerivedBatch = DerivedInventoryBatch
export type MealCosts = Record<EntityId, MoneyCents>

export interface RecalculatedInventory {
  allocations: ConsumptionAllocation[]
  batches: DerivedInventoryBatch[]
  mealCosts: MealCosts
}

export type InventoryCalculationResult = RecalculatedInventory

export interface PurchaseCostAllocationInput {
  id: EntityId
  subtotalCents: MoneyCents
}

export interface PurchaseCostAllocation {
  id: EntityId
  allocatedCostCents: MoneyCents
}
