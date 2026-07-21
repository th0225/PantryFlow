import { z } from 'zod'
import {
  allocatePurchaseCosts,
  convertToBase,
  dimensionForInputUnit,
  DomainValidationError,
  normalizeIngredientName,
  recalculateInventory,
  sumPurchaseItemSubtotals,
} from '../domain/core'
import type {
  BaseUnit,
  Category,
  ConsumptionAllocation,
  DerivedInventoryBatch,
  Ingredient,
  InputUnit,
  InventoryAdjustment,
  InventoryAdjustmentReason,
  Meal,
  MealIngredient,
  MealType,
  MeasurementDimension,
  PantryFlowBackup,
  PantryFlowBackupData,
  PantryFlowSnapshot,
  Purchase,
  PurchaseItem,
  RecalculatedInventory,
  Transaction,
  TransactionType,
} from '../domain/types'
import { createDefaultCategories, db, DEFAULT_CATEGORY_IDS } from './db'

export interface LoadedSnapshot extends PantryFlowSnapshot {
  readonly allocations: readonly ConsumptionAllocation[]
  readonly batches: readonly DerivedInventoryBatch[]
}

export interface TransactionInput {
  type: TransactionType
  occurredAt: string
  amountCents: number
  categoryId: string
  note?: string
}

export interface IngredientInput {
  id?: string
  name: string
  dimension: MeasurementDimension
  baseUnit: BaseUnit
  note?: string
}

interface PurchaseItemInputBase {
  id?: string
  enteredQuantity: number
  enteredUnit: InputUnit
  subtotalCents: number
  expiresOn?: string
}

export type PurchaseItemInput = PurchaseItemInputBase & (
  | {
      ingredientId: string
      ingredientName?: never
      ingredientIdHint?: never
    }
  | {
      ingredientId?: never
      ingredientName: string
      ingredientIdHint?: string
    }
)

export interface PurchaseInput {
  store: string
  occurredAt: string
  note?: string
  items: readonly PurchaseItemInput[]
}

export interface InventoryAdjustmentInput {
  ingredientId: string
  occurredAt: string
  enteredQuantity: number
  enteredUnit: InputUnit
  reason: InventoryAdjustmentReason
  note?: string
}

export interface MealIngredientInput {
  id?: string
  ingredientId: string
  enteredQuantity: number
  enteredUnit: InputUnit
}

export interface MealInput {
  occurredAt: string
  mealType: MealType
  note?: string
  items: readonly MealIngredientInput[]
}

export interface CategoryInput {
  name: string
  type: TransactionType
  color: string
}

export type SaveTransactionInput = TransactionInput & { id?: string }
export type SavePurchaseInput = PurchaseInput & { id?: string }
export interface SaveAdjustmentInput {
  id?: string
  ingredientId: string
  occurredAt: string
  reason: InventoryAdjustmentReason
  note?: string
  /** Use for an already-normalized model value. */
  quantityBase?: number
  /** Use with enteredUnit when accepting a user-facing amount. */
  enteredQuantity?: number
  enteredUnit?: InputUnit
}
export type SaveMealInput = MealInput & { id?: string }
export type SaveCategoryInput = CategoryInput & { id?: string; isActive?: boolean }

const BASE_UNIT_BY_DIMENSION: Record<MeasurementDimension, BaseUnit> = {
  mass: 'g',
  volume: 'ml',
  count: 'each',
}

const idSchema = z.string().uuid()
const nonEmptyTextSchema = z.string().trim().min(1)
const optionalTextSchema = z.string().optional()
const colorSchema = z.string().trim().min(1).max(128)
const moneySchema = z.number().int().nonnegative().refine(Number.isSafeInteger, 'Must be a safe integer')
const positiveQuantitySchema = z.number().finite().positive()
const dateTimeSchema = z.string().refine(isIsoDateTime, 'Must be an ISO 8601 date-time with a timezone')
const dateSchema = z.string().refine(isIsoDate, 'Must be an ISO 8601 calendar date')
const transactionTypeSchema = z.enum(['income', 'expense'])
const dimensionSchema = z.enum(['mass', 'volume', 'count'])
const baseUnitSchema = z.enum(['g', 'ml', 'each'])
const inputUnitSchema = z.enum(['g', 'kg', 'ml', 'L', 'each', 'pack'])
const adjustmentReasonSchema = z.enum([
  'expired',
  'discarded',
  'damaged',
  'stocktake_shortage',
  'other',
])
const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other'])

const categorySchema = z.object({
  id: idSchema,
  name: nonEmptyTextSchema,
  type: transactionTypeSchema,
  color: colorSchema,
  isActive: z.boolean(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}).strict()

const transactionSchema = z.object({
  id: idSchema,
  type: transactionTypeSchema,
  occurredAt: dateTimeSchema,
  amountCents: moneySchema,
  categoryId: idSchema,
  note: optionalTextSchema,
  purchaseId: idSchema.optional(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}).strict()

const ingredientSchema = z.object({
  id: idSchema,
  name: nonEmptyTextSchema,
  dimension: dimensionSchema,
  baseUnit: baseUnitSchema,
  note: optionalTextSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}).strict()

const purchaseSchema = z.object({
  id: idSchema,
  store: nonEmptyTextSchema,
  occurredAt: dateTimeSchema,
  paidTotalCents: moneySchema,
  note: optionalTextSchema,
  transactionId: idSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}).strict()

const purchaseItemSchema = z.object({
  id: idSchema,
  purchaseId: idSchema,
  ingredientId: idSchema,
  quantityBase: positiveQuantitySchema,
  enteredQuantity: positiveQuantitySchema,
  enteredUnit: inputUnitSchema,
  subtotalCents: moneySchema,
  allocatedCostCents: moneySchema,
  expiresOn: dateSchema.optional(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}).strict()

const adjustmentSchema = z.object({
  id: idSchema,
  ingredientId: idSchema,
  occurredAt: dateTimeSchema,
  quantityBase: positiveQuantitySchema,
  reason: adjustmentReasonSchema,
  note: optionalTextSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}).strict()

const mealSchema = z.object({
  id: idSchema,
  occurredAt: dateTimeSchema,
  mealType: mealTypeSchema,
  note: optionalTextSchema,
  totalCostCents: moneySchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
}).strict()

const mealIngredientSchema = z.object({
  id: idSchema,
  mealId: idSchema,
  ingredientId: idSchema,
  quantityBase: positiveQuantitySchema,
  enteredQuantity: positiveQuantitySchema,
  enteredUnit: inputUnitSchema,
}).strict()

const backupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: dateTimeSchema,
  app: z.literal('PantryFlow'),
  data: z.object({
    categories: z.array(categorySchema),
    transactions: z.array(transactionSchema),
    ingredients: z.array(ingredientSchema),
    purchases: z.array(purchaseSchema),
    purchaseItems: z.array(purchaseItemSchema),
    adjustments: z.array(adjustmentSchema),
    meals: z.array(mealSchema),
    mealIngredients: z.array(mealIngredientSchema),
  }).strict(),
}).strict()

export async function loadSnapshot(): Promise<LoadedSnapshot> {
  return db.transaction('r', db.tables, async () => {
    const source = await readSourceSnapshot()
    const calculated = recalculateInventory(source)
    const allocations = await db.allocations.toArray()
    return { ...source, allocations, batches: calculated.batches }
  })
}

export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  return mutateAndRecalculate(async () => {
    transactionTypeSchema.parse(input.type)
    assertPositiveMoney(input.amountCents, 'amountCents')
    assertDateTime(input.occurredAt, 'occurredAt')
    const category = await requireRecord(db.categories.get(input.categoryId), 'Category', input.categoryId)
    assertCategoryType(category, input.type)
    if (!category.isActive) throw new DomainValidationError('An inactive category cannot be used for a new transaction')

    const timestamp = now()
    const transaction: Transaction = {
      id: newId(),
      type: input.type,
      occurredAt: input.occurredAt,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      note: cleanOptionalText(input.note),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await db.transactions.add(transaction)
    return transaction
  })
}

export async function saveTransaction(input: SaveTransactionInput): Promise<Transaction> {
  return input.id ? updateTransaction(input.id, input) : createTransaction(input)
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<Transaction> {
  return mutateAndRecalculate(async () => {
    transactionTypeSchema.parse(input.type)
    const current = await requireRecord(db.transactions.get(id), 'Transaction', id)
    if (current.purchaseId) {
      throw new DomainValidationError('Purchase-linked transactions must be changed through the purchase flow')
    }
    assertPositiveMoney(input.amountCents, 'amountCents')
    assertDateTime(input.occurredAt, 'occurredAt')
    const category = await requireRecord(db.categories.get(input.categoryId), 'Category', input.categoryId)
    assertCategoryType(category, input.type)
    if (!category.isActive && category.id !== current.categoryId) {
      throw new DomainValidationError('An inactive category cannot be assigned to a transaction')
    }

    const transaction: Transaction = {
      ...current,
      type: input.type,
      occurredAt: input.occurredAt,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      note: cleanOptionalText(input.note),
      updatedAt: now(),
    }
    await db.transactions.put(transaction)
    return transaction
  })
}

export async function deleteTransaction(id: string): Promise<void> {
  await mutateAndRecalculate(async () => {
    const current = await requireRecord(db.transactions.get(id), 'Transaction', id)
    if (current.purchaseId) {
      throw new DomainValidationError('Purchase-linked transactions must be deleted through the purchase flow')
    }
    await db.transactions.delete(id)
  })
}

export async function upsertIngredient(input: IngredientInput): Promise<Ingredient> {
  return mutateAndRecalculate(async () => {
    dimensionSchema.parse(input.dimension)
    baseUnitSchema.parse(input.baseUnit)
    const timestamp = now()
    const existing = input.id
      ? await requireRecord(db.ingredients.get(input.id), 'Ingredient', input.id)
      : undefined
    assertNonEmpty(input.name, 'Ingredient name')
    await assertIngredientNameAvailable(input.name, existing?.id)
    assertBaseUnit(input.dimension, input.baseUnit)

    if (existing && (existing.dimension !== input.dimension || existing.baseUnit !== input.baseUnit)) {
      const isReferenced = await ingredientIsReferenced(existing.id)
      if (isReferenced) {
        throw new DomainValidationError('The unit dimension of an ingredient with history cannot be changed')
      }
    }

    const ingredient: Ingredient = {
      id: existing?.id ?? input.id ?? newId(),
      name: input.name.trim(),
      dimension: input.dimension,
      baseUnit: input.baseUnit,
      note: cleanOptionalText(input.note),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    await db.ingredients.put(ingredient)
    return ingredient
  })
}

export const saveIngredient = upsertIngredient

export async function deleteIngredient(id: string): Promise<void> {
  await mutateAndRecalculate(async () => {
    const ingredient = await requireRecord(db.ingredients.get(id), 'Ingredient', id)
    if (await ingredientIsReferenced(id)) {
      throw new DomainValidationError(
        `食材「${ingredient.name}」已有採買、庫存調整或餐點紀錄，為保留歷史與 FIFO 一致性，無法刪除`,
      )
    }
    await db.ingredients.delete(id)
  })
}

export async function createPurchase(input: PurchaseInput): Promise<Purchase> {
  return mutateAndRecalculate(async () => {
    const paidTotalCents = assertPurchaseInput(input)
    const timestamp = now()
    const purchaseId = newId()
    const transactionId = newId()
    const category = await resolveGroceriesCategory()
    const purchaseItems = await preparePurchaseItems(
      purchaseId,
      paidTotalCents,
      input.items,
      timestamp,
    )
    const purchase: Purchase = {
      id: purchaseId,
      store: input.store.trim(),
      occurredAt: input.occurredAt,
      paidTotalCents,
      note: cleanOptionalText(input.note),
      transactionId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const transaction: Transaction = {
      id: transactionId,
      type: 'expense',
      occurredAt: input.occurredAt,
      amountCents: paidTotalCents,
      categoryId: category.id,
      note: purchaseTransactionNote(input.store, input.note),
      purchaseId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await db.purchases.add(purchase)
    await db.transactions.add(transaction)
    await db.purchaseItems.bulkAdd(purchaseItems)
    return purchase
  })
}

export async function savePurchase(input: SavePurchaseInput): Promise<Purchase> {
  return input.id ? updatePurchase(input.id, input) : createPurchase(input)
}

export async function updatePurchase(id: string, input: PurchaseInput): Promise<Purchase> {
  return mutateAndRecalculate(async () => {
    const paidTotalCents = assertPurchaseInput(input)
    const current = await requireRecord(db.purchases.get(id), 'Purchase', id)
    const transaction = await requireRecord(
      db.transactions.get(current.transactionId),
      'Linked transaction',
      current.transactionId,
    )
    if (transaction.purchaseId !== id) throw new DomainValidationError('Purchase transaction link is inconsistent')

    const existingItems = await db.purchaseItems.where('purchaseId').equals(id).toArray()
    const timestamp = now()
    const purchaseItems = await preparePurchaseItems(
      id,
      paidTotalCents,
      input.items,
      timestamp,
      existingItems,
    )
    const purchase: Purchase = {
      ...current,
      store: input.store.trim(),
      occurredAt: input.occurredAt,
      paidTotalCents,
      note: cleanOptionalText(input.note),
      updatedAt: timestamp,
    }
    const linkedTransaction: Transaction = {
      ...transaction,
      type: 'expense',
      occurredAt: input.occurredAt,
      amountCents: paidTotalCents,
      note: purchaseTransactionNote(input.store, input.note),
      purchaseId: id,
      updatedAt: timestamp,
    }

    await db.purchases.put(purchase)
    await db.transactions.put(linkedTransaction)
    await db.purchaseItems.where('purchaseId').equals(id).delete()
    await db.purchaseItems.bulkAdd(purchaseItems)
    return purchase
  })
}

export async function deletePurchase(id: string): Promise<void> {
  await mutateAndRecalculate(async () => {
    const purchase = await requireRecord(db.purchases.get(id), 'Purchase', id)
    const transaction = await requireRecord(
      db.transactions.get(purchase.transactionId),
      'Linked transaction',
      purchase.transactionId,
    )
    if (transaction.purchaseId !== id) throw new DomainValidationError('Purchase transaction link is inconsistent')
    await db.purchaseItems.where('purchaseId').equals(id).delete()
    await db.purchases.delete(id)
    await db.transactions.delete(purchase.transactionId)
  })
}

export async function createInventoryAdjustment(
  input: InventoryAdjustmentInput,
): Promise<InventoryAdjustment> {
  return mutateAndRecalculate(async () => {
    adjustmentReasonSchema.parse(input.reason)
    const ingredient = await requireRecord(db.ingredients.get(input.ingredientId), 'Ingredient', input.ingredientId)
    assertDateTime(input.occurredAt, 'occurredAt')
    const timestamp = now()
    const adjustment: InventoryAdjustment = {
      id: newId(),
      ingredientId: input.ingredientId,
      occurredAt: input.occurredAt,
      quantityBase: convertToBase(input.enteredQuantity, input.enteredUnit, ingredient.dimension),
      reason: input.reason,
      note: cleanOptionalText(input.note),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await db.adjustments.add(adjustment)
    return adjustment
  })
}

export async function saveAdjustment(input: SaveAdjustmentInput): Promise<InventoryAdjustment> {
  return mutateAndRecalculate(async () => {
    adjustmentReasonSchema.parse(input.reason)
    const current = input.id
      ? await requireRecord(db.adjustments.get(input.id), 'Inventory adjustment', input.id)
      : undefined
    const ingredient = await requireRecord(
      db.ingredients.get(input.ingredientId),
      'Ingredient',
      input.ingredientId,
    )
    assertDateTime(input.occurredAt, 'occurredAt')
    let quantityBase: number
    if (input.quantityBase !== undefined) {
      if (!Number.isFinite(input.quantityBase) || input.quantityBase <= 0) {
        throw new DomainValidationError('quantityBase must be a finite number greater than zero')
      }
      quantityBase = input.quantityBase
    } else {
      if (input.enteredQuantity === undefined || input.enteredUnit === undefined) {
        throw new DomainValidationError('An entered quantity and unit, or quantityBase, is required')
      }
      quantityBase = convertToBase(
        input.enteredQuantity,
        input.enteredUnit,
        ingredient.dimension,
      )
    }
    const timestamp = now()
    const adjustment: InventoryAdjustment = {
      id: current?.id ?? newId(),
      ingredientId: input.ingredientId,
      occurredAt: input.occurredAt,
      quantityBase,
      reason: input.reason,
      note: cleanOptionalText(input.note),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
    await db.adjustments.put(adjustment)
    return adjustment
  })
}

export async function updateInventoryAdjustment(
  id: string,
  input: InventoryAdjustmentInput,
): Promise<InventoryAdjustment> {
  return mutateAndRecalculate(async () => {
    adjustmentReasonSchema.parse(input.reason)
    const current = await requireRecord(db.adjustments.get(id), 'Inventory adjustment', id)
    const ingredient = await requireRecord(db.ingredients.get(input.ingredientId), 'Ingredient', input.ingredientId)
    assertDateTime(input.occurredAt, 'occurredAt')
    const adjustment: InventoryAdjustment = {
      ...current,
      ingredientId: input.ingredientId,
      occurredAt: input.occurredAt,
      quantityBase: convertToBase(input.enteredQuantity, input.enteredUnit, ingredient.dimension),
      reason: input.reason,
      note: cleanOptionalText(input.note),
      updatedAt: now(),
    }
    await db.adjustments.put(adjustment)
    return adjustment
  })
}

export async function deleteInventoryAdjustment(id: string): Promise<void> {
  await mutateAndRecalculate(async () => {
    await requireRecord(db.adjustments.get(id), 'Inventory adjustment', id)
    await db.adjustments.delete(id)
  })
}

export const deleteAdjustment = deleteInventoryAdjustment

export async function createMeal(input: MealInput): Promise<Meal> {
  return mutateAndRecalculate(async () => {
    mealTypeSchema.parse(input.mealType)
    assertMealInput(input)
    const timestamp = now()
    const mealId = newId()
    const mealIngredients = await prepareMealIngredients(mealId, input.items)
    const meal: Meal = {
      id: mealId,
      occurredAt: input.occurredAt,
      mealType: input.mealType,
      note: cleanOptionalText(input.note),
      totalCostCents: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await db.meals.add(meal)
    await db.mealIngredients.bulkAdd(mealIngredients)
    return meal
  }, (meal) => requireRecord(db.meals.get(meal.id), 'Meal', meal.id))
}

export async function saveMeal(input: SaveMealInput): Promise<Meal> {
  return input.id ? updateMeal(input.id, input) : createMeal(input)
}

export async function updateMeal(id: string, input: MealInput): Promise<Meal> {
  return mutateAndRecalculate(async () => {
    mealTypeSchema.parse(input.mealType)
    assertMealInput(input)
    const current = await requireRecord(db.meals.get(id), 'Meal', id)
    const existingItems = await db.mealIngredients.where('mealId').equals(id).toArray()
    const mealIngredients = await prepareMealIngredients(id, input.items, existingItems)
    const meal: Meal = {
      ...current,
      occurredAt: input.occurredAt,
      mealType: input.mealType,
      note: cleanOptionalText(input.note),
      updatedAt: now(),
    }
    await db.meals.put(meal)
    await db.mealIngredients.where('mealId').equals(id).delete()
    await db.mealIngredients.bulkAdd(mealIngredients)
    return meal
  }, (meal) => requireRecord(db.meals.get(meal.id), 'Meal', meal.id))
}

export async function deleteMeal(id: string): Promise<void> {
  await mutateAndRecalculate(async () => {
    await requireRecord(db.meals.get(id), 'Meal', id)
    await db.mealIngredients.where('mealId').equals(id).delete()
    await db.meals.delete(id)
  })
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  return mutateAndRecalculate(async () => {
    transactionTypeSchema.parse(input.type)
    colorSchema.parse(input.color)
    assertNonEmpty(input.name, 'Category name')
    assertNonEmpty(input.color, 'Category color')
    await assertCategoryNameAvailable(input.name, input.type)
    const timestamp = now()
    const category: Category = {
      id: newId(),
      name: input.name.trim(),
      type: input.type,
      color: input.color.trim(),
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await db.categories.add(category)
    return category
  })
}

export async function saveCategory(input: SaveCategoryInput): Promise<Category> {
  if (!input.id) return createCategory(input)
  return mutateAndRecalculate(async () => {
    transactionTypeSchema.parse(input.type)
    colorSchema.parse(input.color)
    if (input.isActive !== undefined) z.boolean().parse(input.isActive)
    const current = await requireRecord(db.categories.get(input.id!), 'Category', input.id!)
    if (current.type !== input.type) {
      throw new DomainValidationError('A category type cannot be changed after creation')
    }
    assertNonEmpty(input.name, 'Category name')
    assertNonEmpty(input.color, 'Category color')
    await assertCategoryNameAvailable(input.name, input.type, current.id)
    const category: Category = {
      ...current,
      name: input.name.trim(),
      color: input.color.trim(),
      isActive: input.isActive ?? current.isActive,
      updatedAt: now(),
    }
    await db.categories.put(category)
    return category
  })
}

export async function renameCategory(id: string, name: string): Promise<Category> {
  return updateCategory(id, async (category) => {
    assertNonEmpty(name, 'Category name')
    await assertCategoryNameAvailable(name, category.type, id)
    return { ...category, name: name.trim(), updatedAt: now() }
  })
}

export async function updateCategoryColor(id: string, color: string): Promise<Category> {
  return updateCategory(id, async (category) => {
    colorSchema.parse(color)
    assertNonEmpty(color, 'Category color')
    return { ...category, color: color.trim(), updatedAt: now() }
  })
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<Category> {
  z.boolean().parse(isActive)
  if (id === DEFAULT_CATEGORY_IDS.groceries && !isActive) {
    throw new DomainValidationError('The built-in groceries category is required for purchases')
  }
  return updateCategory(id, async (category) => ({ ...category, isActive, updatedAt: now() }))
}

export async function deleteCategory(id: string): Promise<void> {
  await mutateAndRecalculate(async () => {
    if (id === DEFAULT_CATEGORY_IDS.groceries) {
      throw new DomainValidationError('The built-in groceries category is required for purchases')
    }
    await requireRecord(db.categories.get(id), 'Category', id)
    const transactionCount = await db.transactions.where('categoryId').equals(id).count()
    if (transactionCount > 0) {
      throw new DomainValidationError('A category used by transactions can only be deactivated')
    }
    await db.categories.delete(id)
  })
}

export async function recalculateAllDerivedData(): Promise<RecalculatedInventory> {
  return db.transaction('rw', db.tables, recalculateAndPersist)
}

export async function clearAndReseed(): Promise<readonly Category[]> {
  return db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
    const categories = createDefaultCategories()
    await db.categories.bulkAdd(categories)
    return categories
  })
}

export const clearAllData = clearAndReseed

export async function exportBackup(): Promise<PantryFlowBackup> {
  const source = await db.transaction('r', db.tables, readSourceSnapshot)
  return {
    schemaVersion: 1,
    exportedAt: now(),
    app: 'PantryFlow',
    data: {
      categories: [...source.categories],
      transactions: [...source.transactions],
      ingredients: [...source.ingredients],
      purchases: [...source.purchases],
      purchaseItems: [...source.purchaseItems],
      adjustments: [...source.adjustments],
      meals: [...source.meals],
      mealIngredients: [...source.mealIngredients],
    },
  }
}

/** Validate a backup for preview without changing IndexedDB. Import repeats
 * the same validation inside its replacement transaction before clearing data. */
export function validateBackup(input: unknown): PantryFlowBackup {
  const backup = backupSchema.parse(input) as PantryFlowBackup
  validateBackupData(backup.data)
  return backup
}

export async function importBackup(input: unknown): Promise<LoadedSnapshot> {
  const backup = backupSchema.parse(input) as PantryFlowBackup

  await db.transaction('rw', db.tables, async () => {
    // Recalculate the staged source records inside the same transaction that
    // replaces the database, before any current record is cleared.
    const calculated = withUuidAllocationIds(validateBackupData(backup.data))
    const normalizedMeals = backup.data.meals.map((meal) => ({
      ...meal,
      totalCostCents: calculated.mealCosts[meal.id] ?? 0,
    }))
    for (const table of db.tables) await table.clear()
    await bulkAddIfPresent(db.categories, backup.data.categories)
    await bulkAddIfPresent(db.transactions, backup.data.transactions)
    await bulkAddIfPresent(db.ingredients, backup.data.ingredients)
    await bulkAddIfPresent(db.purchases, backup.data.purchases)
    await bulkAddIfPresent(db.purchaseItems, backup.data.purchaseItems)
    await bulkAddIfPresent(db.adjustments, backup.data.adjustments)
    await bulkAddIfPresent(db.meals, normalizedMeals)
    await bulkAddIfPresent(db.mealIngredients, backup.data.mealIngredients)
    await bulkAddIfPresent(db.allocations, calculated.allocations)
  })

  return loadSnapshot()
}

async function mutateAndRecalculate<T>(mutation: () => Promise<T>): Promise<T>
async function mutateAndRecalculate<T, R>(
  mutation: () => Promise<T>,
  afterRecalculation: (result: T, calculated: RecalculatedInventory) => Promise<R> | R,
): Promise<R>
async function mutateAndRecalculate<T, R = T>(
  mutation: () => Promise<T>,
  afterRecalculation?: (result: T, calculated: RecalculatedInventory) => Promise<R> | R,
): Promise<T | R> {
  return db.transaction('rw', db.tables, async () => {
    const result = await mutation()
    const calculated = await recalculateAndPersist()
    return afterRecalculation ? afterRecalculation(result, calculated) : result
  })
}

async function recalculateAndPersist(): Promise<RecalculatedInventory> {
  const source = await readSourceSnapshot()
  const calculated = withUuidAllocationIds(recalculateInventory(source))
  const meals = source.meals.map((meal) => ({
    ...meal,
    totalCostCents: calculated.mealCosts[meal.id] ?? 0,
  }))
  await db.allocations.clear()
  await bulkAddIfPresent(db.allocations, calculated.allocations)
  await bulkPutIfPresent(db.meals, meals)
  return calculated
}

function withUuidAllocationIds(calculated: RecalculatedInventory): RecalculatedInventory {
  return {
    ...calculated,
    allocations: calculated.allocations.map((allocation) => ({
      ...allocation,
      id: newId(),
    })),
  }
}

async function readSourceSnapshot(): Promise<PantryFlowSnapshot> {
  const [categories, transactions, ingredients, purchases, purchaseItems, adjustments, meals, mealIngredients] =
    await Promise.all([
      db.categories.toArray(),
      db.transactions.toArray(),
      db.ingredients.toArray(),
      db.purchases.toArray(),
      db.purchaseItems.toArray(),
      db.adjustments.toArray(),
      db.meals.toArray(),
      db.mealIngredients.toArray(),
    ])
  return { categories, transactions, ingredients, purchases, purchaseItems, adjustments, meals, mealIngredients }
}

async function preparePurchaseItems(
  purchaseId: string,
  paidTotalCents: number,
  inputs: readonly PurchaseItemInput[],
  timestamp: string,
  existingItems: readonly PurchaseItem[] = [],
): Promise<PurchaseItem[]> {
  if (inputs.length === 0) throw new DomainValidationError('A purchase requires at least one item')
  const existingById = new Map(existingItems.map((item) => [item.id, item]))
  for (const input of inputs) {
    if (input.id && !idSchema.safeParse(input.id).success) {
      throw new DomainValidationError(`Purchase item id must be a UUID: ${input.id}`)
    }
  }
  const ids = inputs.map((item) => item.id ?? newId())
  assertUniqueValues(ids, 'purchase item id')

  const newIds = ids.filter((id) => !existingById.has(id))
  const collisions = await db.purchaseItems.bulkGet(newIds)
  const collision = collisions.find((item): item is PurchaseItem => Boolean(item))
  if (collision) {
    throw new DomainValidationError(
      `Purchase item ${collision.id} already belongs to another purchase`,
    )
  }

  const ingredients = await resolvePurchaseIngredients(inputs, timestamp)
  const allocations = allocatePurchaseCosts(
    paidTotalCents,
    inputs.map((item, index) => ({ id: ids[index], subtotalCents: item.subtotalCents })),
  )
  const allocatedCostById = new Map(
    allocations.map((allocation) => [allocation.id, allocation.allocatedCostCents]),
  )
  const preparedWithoutCosts = inputs.map((input, index): Omit<PurchaseItem, 'allocatedCostCents'> => {
    const ingredient = ingredients[index]
    if (!Number.isSafeInteger(input.subtotalCents) || input.subtotalCents < 0) {
      throw new DomainValidationError('subtotalCents must be a non-negative safe integer')
    }
    if (input.expiresOn) assertDate(input.expiresOn, 'expiresOn')
    const existing = existingById.get(ids[index])
    return {
      id: ids[index],
      purchaseId,
      ingredientId: ingredient.id,
      quantityBase: convertToBase(input.enteredQuantity, input.enteredUnit, ingredient.dimension),
      enteredQuantity: input.enteredQuantity,
      enteredUnit: input.enteredUnit,
      subtotalCents: input.subtotalCents,
      expiresOn: input.expiresOn,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }
  })
  return preparedWithoutCosts.map((item) => {
    const allocatedCostCents = allocatedCostById.get(item.id)
    if (allocatedCostCents === undefined) {
      throw new DomainValidationError(`Missing allocated cost for purchase item ${item.id}`)
    }
    return { ...item, allocatedCostCents }
  })
}

async function resolvePurchaseIngredients(
  inputs: readonly PurchaseItemInput[],
  timestamp: string,
): Promise<Ingredient[]> {
  const existingIngredients = await db.ingredients.toArray()
  const ingredientsById = new Map(existingIngredients.map((ingredient) => [ingredient.id, ingredient]))
  const ingredientsByName = new Map<string, Ingredient[]>()

  for (const ingredient of existingIngredients) {
    const normalizedName = normalizeIngredientName(ingredient.name)
    const matches = ingredientsByName.get(normalizedName)
    if (matches) matches.push(ingredient)
    else ingredientsByName.set(normalizedName, [ingredient])
  }

  const created: Ingredient[] = []
  const resolved = inputs.map((input): Ingredient => {
    if (input.ingredientId) {
      const ingredient = ingredientsById.get(input.ingredientId)
      if (!ingredient) throw new DomainValidationError(`Ingredient not found: ${input.ingredientId}`)
      return ingredient
    }

    if (typeof input.ingredientName !== 'string') {
      throw new DomainValidationError('Ingredient name is required')
    }
    const displayName = input.ingredientName.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    const normalizedName = normalizeIngredientName(displayName)
    if (!normalizedName) throw new DomainValidationError('Ingredient name is required')

    const matches = ingredientsByName.get(normalizedName) ?? []
    const hinted = input.ingredientIdHint
      ? matches.find((ingredient) => ingredient.id === input.ingredientIdHint)
      : undefined
    if (hinted) return hinted
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) {
      throw new DomainValidationError(`食材「${displayName}」有多筆同名資料，無法判定要使用哪一筆`)
    }

    const dimension = dimensionForInputUnit(input.enteredUnit)
    const ingredient: Ingredient = {
      id: newId(),
      name: displayName,
      dimension,
      baseUnit: BASE_UNIT_BY_DIMENSION[dimension],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    created.push(ingredient)
    ingredientsById.set(ingredient.id, ingredient)
    ingredientsByName.set(normalizedName, [ingredient])
    return ingredient
  })

  if (created.length > 0) await db.ingredients.bulkAdd(created)
  return resolved
}

async function prepareMealIngredients(
  mealId: string,
  inputs: readonly MealIngredientInput[],
  existingItems: readonly MealIngredient[] = [],
): Promise<MealIngredient[]> {
  if (inputs.length === 0) throw new DomainValidationError('A meal requires at least one ingredient')
  assertUniqueValues(inputs.map((item) => item.ingredientId), 'meal ingredient')
  const existingIds = new Set(existingItems.map((item) => item.id))
  for (const input of inputs) {
    if (input.id && !idSchema.safeParse(input.id).success) {
      throw new DomainValidationError(`Meal ingredient id must be a UUID: ${input.id}`)
    }
  }
  const ids = inputs.map((item) => item.id ?? newId())
  assertUniqueValues(ids, 'meal ingredient id')
  for (const input of inputs) {
    if (input.id && !existingIds.has(input.id)) {
      throw new DomainValidationError(`Meal ingredient ${input.id} does not belong to meal ${mealId}`)
    }
  }
  const ingredients = await db.ingredients.bulkGet(inputs.map((item) => item.ingredientId))
  return inputs.map((input, index) => {
    const ingredient = ingredients[index]
    if (!ingredient) throw new DomainValidationError(`Ingredient not found: ${input.ingredientId}`)
    return {
      id: ids[index],
      mealId,
      ingredientId: input.ingredientId,
      quantityBase: convertToBase(input.enteredQuantity, input.enteredUnit, ingredient.dimension),
      enteredQuantity: input.enteredQuantity,
      enteredUnit: input.enteredUnit,
    }
  })
}

function validateBackupData(data: PantryFlowBackupData): RecalculatedInventory {
  assertUniqueEntityIds(data)
  const categories = new Map(data.categories.map((item) => [item.id, item]))
  const transactions = new Map(data.transactions.map((item) => [item.id, item]))
  const ingredients = new Map(data.ingredients.map((item) => [item.id, item]))
  const purchases = new Map(data.purchases.map((item) => [item.id, item]))
  const meals = new Map(data.meals.map((item) => [item.id, item]))
  const groceriesCategory = categories.get(DEFAULT_CATEGORY_IDS.groceries)

  if (!groceriesCategory || groceriesCategory.type !== 'expense' || !groceriesCategory.isActive) {
    throw new DomainValidationError(
      'A backup must include the active built-in groceries expense category',
    )
  }

  for (const ingredient of data.ingredients) assertBaseUnit(ingredient.dimension, ingredient.baseUnit)
  for (const transaction of data.transactions) {
    const category = categories.get(transaction.categoryId)
    if (!category) throw new DomainValidationError(`Transaction ${transaction.id} references a missing category`)
    assertCategoryType(category, transaction.type)
    if (!transaction.purchaseId && transaction.amountCents <= 0) {
      throw new DomainValidationError(`Transaction ${transaction.id} must have a positive amount`)
    }
    if (transaction.purchaseId) {
      const purchase = purchases.get(transaction.purchaseId)
      if (!purchase) {
        throw new DomainValidationError(`Transaction ${transaction.id} references a missing purchase`)
      }
      if (purchase.transactionId !== transaction.id) {
        throw new DomainValidationError(`Transaction ${transaction.id} has an inconsistent purchase link`)
      }
    }
  }

  const purchaseItemsByPurchase = groupBy(data.purchaseItems, (item) => item.purchaseId)
  for (const purchase of data.purchases) {
    const linked = transactions.get(purchase.transactionId)
    if (!linked || linked.purchaseId !== purchase.id || linked.type !== 'expense') {
      throw new DomainValidationError(`Purchase ${purchase.id} has an invalid linked transaction`)
    }
    if (linked.amountCents !== purchase.paidTotalCents || linked.occurredAt !== purchase.occurredAt) {
      throw new DomainValidationError(`Purchase ${purchase.id} is out of sync with its transaction`)
    }
    const items = purchaseItemsByPurchase.get(purchase.id) ?? []
    if (items.length === 0) throw new DomainValidationError(`Purchase ${purchase.id} has no items`)
    const expected = allocatePurchaseCosts(
      purchase.paidTotalCents,
      items.map((item) => ({ id: item.id, subtotalCents: item.subtotalCents })),
    )
    const costs = new Map(expected.map((item) => [item.id, item.allocatedCostCents]))
    for (const item of items) {
      if (costs.get(item.id) !== item.allocatedCostCents) {
        throw new DomainValidationError(`Purchase item ${item.id} has an invalid allocated cost`)
      }
    }
  }

  for (const item of data.purchaseItems) {
    if (!purchases.has(item.purchaseId)) throw new DomainValidationError(`Purchase item ${item.id} is orphaned`)
    const ingredient = ingredients.get(item.ingredientId)
    if (!ingredient) throw new DomainValidationError(`Purchase item ${item.id} references a missing ingredient`)
    assertConvertedQuantity(item, ingredient)
  }
  for (const adjustment of data.adjustments) {
    if (!ingredients.has(adjustment.ingredientId)) {
      throw new DomainValidationError(`Adjustment ${adjustment.id} references a missing ingredient`)
    }
  }

  const mealItemsByMeal = groupBy(data.mealIngredients, (item) => item.mealId)
  for (const meal of data.meals) {
    const items = mealItemsByMeal.get(meal.id) ?? []
    if (items.length === 0) {
      throw new DomainValidationError(`Meal ${meal.id} has no ingredients`)
    }
    assertUniqueValues(
      items.map((item) => item.ingredientId),
      `ingredient in meal ${meal.id}`,
    )
  }
  for (const item of data.mealIngredients) {
    if (!meals.has(item.mealId)) throw new DomainValidationError(`Meal ingredient ${item.id} is orphaned`)
    const ingredient = ingredients.get(item.ingredientId)
    if (!ingredient) throw new DomainValidationError(`Meal ingredient ${item.id} references a missing ingredient`)
    assertConvertedQuantity(item, ingredient)
  }

  return recalculateInventory(data)
}

function assertUniqueEntityIds(data: PantryFlowBackupData): void {
  const tables: [string, readonly { id: string }[]][] = [
    ['category', data.categories],
    ['transaction', data.transactions],
    ['ingredient', data.ingredients],
    ['purchase', data.purchases],
    ['purchase item', data.purchaseItems],
    ['adjustment', data.adjustments],
    ['meal', data.meals],
    ['meal ingredient', data.mealIngredients],
  ]
  for (const [label, records] of tables) assertUniqueValues(records.map((record) => record.id), `${label} id`)
}

function assertConvertedQuantity(
  item: Pick<PurchaseItem | MealIngredient, 'id' | 'enteredQuantity' | 'enteredUnit' | 'quantityBase'>,
  ingredient: Ingredient,
): void {
  const expected = convertToBase(item.enteredQuantity, item.enteredUnit, ingredient.dimension)
  if (!quantitiesEqual(expected, item.quantityBase)) {
    throw new DomainValidationError(`Stored base quantity is invalid for item ${item.id}`)
  }
}

async function updateCategory(
  id: string,
  transform: (category: Category) => Promise<Category>,
): Promise<Category> {
  return mutateAndRecalculate(async () => {
    const category = await requireRecord(db.categories.get(id), 'Category', id)
    const updated = await transform(category)
    await db.categories.put(updated)
    return updated
  })
}

async function resolveGroceriesCategory(): Promise<Category> {
  const seeded = await db.categories.get(DEFAULT_CATEGORY_IDS.groceries)
  if (seeded) {
    if (seeded.type !== 'expense') {
      throw new DomainValidationError('The built-in groceries category must be an expense category')
    }
    if (seeded.isActive) return seeded
  }
  const expenses = await db.categories.where('type').equals('expense').toArray()
  const named = expenses.find((category) => category.name === '食材' && category.isActive)
  if (named) return named
  throw new DomainValidationError('A groceries expense category is required before recording purchases')
}

async function assertCategoryNameAvailable(name: string, type: TransactionType, exceptId?: string): Promise<void> {
  const normalized = name.trim().toLocaleLowerCase('zh-Hant')
  const matches = await db.categories.where('type').equals(type).toArray()
  if (matches.some((category) => category.id !== exceptId && category.name.trim().toLocaleLowerCase('zh-Hant') === normalized)) {
    throw new DomainValidationError(`A ${type} category named ${name.trim()} already exists`)
  }
}

async function assertIngredientNameAvailable(name: string, exceptId?: string): Promise<void> {
  const normalizedName = normalizeIngredientName(name)
  const ingredients = await db.ingredients.toArray()
  if (ingredients.some((ingredient) => (
    ingredient.id !== exceptId
    && normalizeIngredientName(ingredient.name) === normalizedName
  ))) {
    throw new DomainValidationError(`食材「${name.trim()}」已存在`)
  }
}

async function ingredientIsReferenced(id: string): Promise<boolean> {
  const [purchases, adjustments, meals] = await Promise.all([
    db.purchaseItems.where('ingredientId').equals(id).count(),
    db.adjustments.where('ingredientId').equals(id).count(),
    db.mealIngredients.where('ingredientId').equals(id).count(),
  ])
  return purchases + adjustments + meals > 0
}

function assertPurchaseInput(input: PurchaseInput): number {
  assertNonEmpty(input.store, 'Store')
  assertDateTime(input.occurredAt, 'occurredAt')
  if (input.items.length === 0) throw new DomainValidationError('A purchase requires at least one item')
  const paidTotalCents = sumPurchaseItemSubtotals(input.items)
  if (paidTotalCents <= 0) {
    throw new DomainValidationError('At least one purchase item subtotal must be greater than zero')
  }
  return paidTotalCents
}

function assertMealInput(input: MealInput): void {
  assertDateTime(input.occurredAt, 'occurredAt')
  if (input.items.length === 0) throw new DomainValidationError('A meal requires at least one ingredient')
}

function assertBaseUnit(dimension: MeasurementDimension, baseUnit: BaseUnit): void {
  if (BASE_UNIT_BY_DIMENSION[dimension] !== baseUnit) {
    throw new DomainValidationError(`Base unit ${baseUnit} is invalid for dimension ${dimension}`)
  }
}

function assertCategoryType(category: Category, type: TransactionType): void {
  if (category.type !== type) throw new DomainValidationError('Transaction type does not match category type')
}

function assertPositiveMoney(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label} must be a positive safe integer`)
  }
}

function assertDateTime(value: string, label: string): void {
  if (!isIsoDateTime(value)) throw new DomainValidationError(`${label} must be an ISO 8601 date-time with a timezone`)
}

function assertDate(value: string, label: string): void {
  if (!isIsoDate(value)) throw new DomainValidationError(`${label} must be an ISO 8601 calendar date`)
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new DomainValidationError(`${label} is required`)
}

function assertUniqueValues(values: readonly string[], label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new DomainValidationError(`Duplicate ${label}: ${value}`)
    seen.add(value)
  }
}

function cleanOptionalText(value?: string): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function purchaseTransactionNote(store: string, note?: string): string {
  return cleanOptionalText(note) ?? `${store.trim()}食材採買`
}

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function now(): string {
  return new Date().toISOString()
}

function isIsoDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
  if (!match || !isIsoDate(match[1])) return false
  const hour = Number(match[2])
  const minute = Number(match[3])
  const second = Number(match[4])
  const offsetHour = match[6] ? Number(match[6]) : 0
  const offsetMinute = match[7] ? Number(match[7]) : 0
  return hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 23
    && offsetMinute <= 59
    && Number.isFinite(Date.parse(value))
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function quantitiesEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= Number.EPSILON * scale * 8
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const itemKey = key(item)
    const group = groups.get(itemKey)
    if (group) group.push(item)
    else groups.set(itemKey, [item])
  }
  return groups
}

async function requireRecord<T>(promise: Promise<T | undefined>, label: string, id: string): Promise<T> {
  const value = await promise
  if (!value) throw new DomainValidationError(`${label} not found: ${id}`)
  return value
}

async function bulkAddIfPresent<T extends { id: string }>(
  table: { bulkAdd(items: readonly T[]): Promise<unknown> },
  items: readonly T[],
): Promise<void> {
  if (items.length > 0) await table.bulkAdd(items)
}

async function bulkPutIfPresent<T extends { id: string }>(
  table: { bulkPut(items: readonly T[]): Promise<unknown> },
  items: readonly T[],
): Promise<void> {
  if (items.length > 0) await table.bulkPut(items)
}
