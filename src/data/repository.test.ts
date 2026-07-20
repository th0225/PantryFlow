import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { InventoryShortageError } from '../domain/core'
import { db, DEFAULT_CATEGORY_IDS } from './db'
import {
  clearAllData,
  deleteCategory,
  deleteIngredient,
  deletePurchase,
  deleteTransaction,
  exportBackup,
  importBackup,
  loadSnapshot,
  saveIngredient,
  saveCategory,
  saveMeal,
  savePurchase,
  saveTransaction,
  setCategoryActive,
} from './repository'

const at = (day: number, hour = 12) => `2026-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterAll(async () => {
  await db.delete()
})

async function createMassIngredient(name = '白米') {
  return saveIngredient({ name, dimension: 'mass', baseUnit: 'g' })
}

async function createCrossBatchFixture() {
  const ingredient = await createMassIngredient()
  const firstPurchase = await savePurchase({
    store: '市場 A',
    occurredAt: at(1),
    paidTotalCents: 1_000,
    items: [{ ingredientId: ingredient.id, enteredQuantity: 100, enteredUnit: 'g', subtotalCents: 1_000 }],
  })
  const secondPurchase = await savePurchase({
    store: '市場 B',
    occurredAt: at(2),
    paidTotalCents: 3_000,
    items: [{ ingredientId: ingredient.id, enteredQuantity: 100, enteredUnit: 'g', subtotalCents: 3_000 }],
  })
  const meal = await saveMeal({
    occurredAt: at(3, 18),
    mealType: 'dinner',
    note: '跨批次晚餐',
    items: [{ ingredientId: ingredient.id, enteredQuantity: 150, enteredUnit: 'g' }],
  })
  return { ingredient, firstPurchase, secondPurchase, meal }
}

describe('IndexedDB repository integration', () => {
  it('seeds the required default categories on first open', async () => {
    const snapshot = await loadSnapshot()
    expect(snapshot.categories).toHaveLength(8)
    expect(snapshot.categories.find((category) => category.id === DEFAULT_CATEGORY_IDS.groceries)).toMatchObject({
      name: '食材',
      type: 'expense',
      isActive: true,
    })
  })

  it('saves a purchase, exact allocations, linked expense, and inventory batches atomically', async () => {
    const rice = await createMassIngredient('白米')
    const milk = await saveIngredient({ name: '鮮奶', dimension: 'volume', baseUnit: 'ml' })
    const purchase = await savePurchase({
      store: '合作社',
      occurredAt: at(1),
      paidTotalCents: 999,
      note: '折扣採買',
      items: [
        { ingredientId: rice.id, enteredQuantity: 1, enteredUnit: 'kg', subtotalCents: 700 },
        { ingredientId: milk.id, enteredQuantity: 1, enteredUnit: 'L', subtotalCents: 300 },
      ],
    })

    const snapshot = await loadSnapshot()
    const items = snapshot.purchaseItems.filter((item) => item.purchaseId === purchase.id)
    const linked = snapshot.transactions.find((transaction) => transaction.purchaseId === purchase.id)

    expect(items).toHaveLength(2)
    expect(items.reduce((sum, item) => sum + item.allocatedCostCents, 0)).toBe(999)
    expect(items.map((item) => item.quantityBase)).toEqual([1_000, 1_000])
    expect(linked).toMatchObject({ type: 'expense', amountCents: 999, categoryId: DEFAULT_CATEGORY_IDS.groceries })
    expect(snapshot.batches.filter((batch) => batch.purchaseId === purchase.id)).toHaveLength(2)
  })

  it('creates named purchase ingredients with unit-derived dimensions and reuses a repeated name', async () => {
    const purchase = await savePurchase({
      store: '直接輸入商店',
      occurredAt: at(1),
      paidTotalCents: 400,
      items: [
        { ingredientName: '白米', enteredQuantity: 1, enteredUnit: 'kg', subtotalCents: 100 },
        { ingredientName: ' 白米 ', enteredQuantity: 100, enteredUnit: 'g', subtotalCents: 100 },
        { ingredientName: '鮮奶', enteredQuantity: 1, enteredUnit: 'L', subtotalCents: 100 },
        { ingredientName: '雞蛋', enteredQuantity: 1, enteredUnit: 'pack', subtotalCents: 100 },
      ],
    })

    const snapshot = await loadSnapshot()
    expect(snapshot.ingredients).toHaveLength(3)
    expect(snapshot.ingredients.find((ingredient) => ingredient.name === '白米')).toMatchObject({ dimension: 'mass', baseUnit: 'g' })
    expect(snapshot.ingredients.find((ingredient) => ingredient.name === '鮮奶')).toMatchObject({ dimension: 'volume', baseUnit: 'ml' })
    expect(snapshot.ingredients.find((ingredient) => ingredient.name === '雞蛋')).toMatchObject({ dimension: 'count', baseUnit: 'each' })

    const items = snapshot.purchaseItems.filter((item) => item.purchaseId === purchase.id)
    const rice = snapshot.ingredients.find((ingredient) => ingredient.name === '白米')!
    expect(items).toHaveLength(4)
    expect(items.filter((item) => item.ingredientId === rice.id)).toHaveLength(2)
    expect(items.find((item) => item.enteredUnit === 'kg')?.quantityBase).toBe(1_000)
    expect(items.find((item) => item.enteredUnit === 'L')?.quantityBase).toBe(1_000)
    expect(items.find((item) => item.enteredUnit === 'pack')?.quantityBase).toBe(1)
  })

  it('matches typed ingredient names after compatibility normalization', async () => {
    const existing = await saveIngredient({ name: 'Milk', dimension: 'volume', baseUnit: 'ml' })
    const purchase = await savePurchase({
      store: '名稱比對商店',
      occurredAt: at(1),
      paidTotalCents: 100,
      items: [{ ingredientName: ' ｍｉｌｋ ', enteredQuantity: 1, enteredUnit: 'L', subtotalCents: 100 }],
    })

    const snapshot = await loadSnapshot()
    expect(snapshot.ingredients).toHaveLength(1)
    expect(snapshot.purchaseItems.find((item) => item.purchaseId === purchase.id)?.ingredientId).toBe(existing.id)
  })

  it('rolls back an auto-created ingredient when repeated names use incompatible dimensions', async () => {
    await expect(savePurchase({
      store: '不相容商店',
      occurredAt: at(1),
      paidTotalCents: 200,
      items: [
        { ingredientName: '測試食材', enteredQuantity: 100, enteredUnit: 'g', subtotalCents: 100 },
        { ingredientName: '測試食材', enteredQuantity: 100, enteredUnit: 'ml', subtotalCents: 100 },
      ],
    })).rejects.toThrow(/incompatible with dimension/i)

    const snapshot = await loadSnapshot()
    expect(snapshot.ingredients).toHaveLength(0)
    expect(snapshot.purchases).toHaveLength(0)
    expect(snapshot.purchaseItems).toHaveLength(0)
    expect(snapshot.transactions).toHaveLength(0)
  })

  it('only deletes ingredients without purchase, adjustment, or meal history', async () => {
    const unused = await createMassIngredient('誤建食材')
    await deleteIngredient(unused.id)
    expect((await loadSnapshot()).ingredients.find((ingredient) => ingredient.id === unused.id)).toBeUndefined()

    const used = await createMassIngredient('已有歷史的食材')
    const purchase = await savePurchase({
      store: '歷史商店',
      occurredAt: at(1),
      paidTotalCents: 100,
      items: [{ ingredientId: used.id, enteredQuantity: 10, enteredUnit: 'g', subtotalCents: 100 }],
    })

    await expect(deleteIngredient(used.id)).rejects.toThrow(/已有採買、庫存調整或餐點紀錄/)
    let snapshot = await loadSnapshot()
    expect(snapshot.ingredients.find((ingredient) => ingredient.id === used.id)).toBeTruthy()
    expect(snapshot.purchases.find((item) => item.id === purchase.id)).toBeTruthy()
    expect(snapshot.purchaseItems.find((item) => item.purchaseId === purchase.id)).toBeTruthy()
    expect(snapshot.transactions.find((item) => item.purchaseId === purchase.id)).toBeTruthy()

    await deletePurchase(purchase.id)
    await deleteIngredient(used.id)
    snapshot = await loadSnapshot()
    expect(snapshot.ingredients.find((ingredient) => ingredient.id === used.id)).toBeUndefined()
  })

  it('guards adjustment and meal ingredient references independently', async () => {
    const adjustmentIngredient = await createMassIngredient('調整引用食材')
    const adjustmentId = crypto.randomUUID()
    await db.adjustments.add({
      id: adjustmentId,
      ingredientId: adjustmentIngredient.id,
      occurredAt: at(2),
      quantityBase: 1,
      reason: 'other',
      createdAt: at(2),
      updatedAt: at(2),
    })
    await expect(deleteIngredient(adjustmentIngredient.id)).rejects.toThrow(/庫存調整/)
    expect(await db.ingredients.get(adjustmentIngredient.id)).toBeTruthy()
    await db.adjustments.delete(adjustmentId)
    await deleteIngredient(adjustmentIngredient.id)

    const mealIngredient = await createMassIngredient('餐點引用食材')
    const mealId = crypto.randomUUID()
    const mealIngredientId = crypto.randomUUID()
    await db.meals.add({
      id: mealId,
      occurredAt: at(3, 18),
      mealType: 'dinner',
      totalCostCents: 0,
      createdAt: at(3, 18),
      updatedAt: at(3, 18),
    })
    await db.mealIngredients.add({
      id: mealIngredientId,
      mealId,
      ingredientId: mealIngredient.id,
      quantityBase: 1,
      enteredQuantity: 1,
      enteredUnit: 'g',
    })
    await expect(deleteIngredient(mealIngredient.id)).rejects.toThrow(/餐點紀錄/)
    expect(await db.ingredients.get(mealIngredient.id)).toBeTruthy()
    await db.mealIngredients.delete(mealIngredientId)
    await db.meals.delete(mealId)
    await deleteIngredient(mealIngredient.id)
  })

  it('preserves client-generated purchase item IDs for stable cent allocation and rejects collisions', async () => {
    const ingredient = await createMassIngredient()
    const lowId = '00000000-0000-4000-8000-000000000001'
    const highId = '00000000-0000-4000-8000-000000000002'
    const addedId = '00000000-0000-4000-8000-000000000003'
    const purchase = await savePurchase({
      store: '穩定分攤商店',
      occurredAt: at(1),
      paidTotalCents: 1,
      items: [
        { id: highId, ingredientId: ingredient.id, enteredQuantity: 1, enteredUnit: 'g', subtotalCents: 1 },
        { id: lowId, ingredientId: ingredient.id, enteredQuantity: 1, enteredUnit: 'g', subtotalCents: 1 },
      ],
    })

    let stored = (await loadSnapshot()).purchaseItems.filter((item) => item.purchaseId === purchase.id)
    expect(new Map(stored.map((item) => [item.id, item.allocatedCostCents]))).toEqual(
      new Map([[highId, 0], [lowId, 1]]),
    )

    await savePurchase({
      id: purchase.id,
      store: '穩定分攤商店',
      occurredAt: at(1),
      paidTotalCents: 2,
      items: [
        { id: highId, ingredientId: ingredient.id, enteredQuantity: 1, enteredUnit: 'g', subtotalCents: 1 },
        { id: lowId, ingredientId: ingredient.id, enteredQuantity: 1, enteredUnit: 'g', subtotalCents: 1 },
        { id: addedId, ingredientId: ingredient.id, enteredQuantity: 1, enteredUnit: 'g', subtotalCents: 1 },
      ],
    })
    stored = (await loadSnapshot()).purchaseItems.filter((item) => item.purchaseId === purchase.id)
    expect(stored.map((item) => item.id)).toContain(addedId)

    await expect(savePurchase({
      store: '碰撞商店',
      occurredAt: at(2),
      paidTotalCents: 100,
      items: [
        { id: lowId, ingredientId: ingredient.id, enteredQuantity: 1, enteredUnit: 'g', subtotalCents: 100 },
      ],
    })).rejects.toThrow(/already belongs to another purchase/i)
    expect((await loadSnapshot()).purchases).toHaveLength(1)
  })

  it('persists cross-batch FIFO costs and rolls back an invalid historical delete', async () => {
    const fixture = await createCrossBatchFixture()
    const before = await loadSnapshot()
    const batches = before.batches.filter((batch) => batch.ingredientId === fixture.ingredient.id)

    expect(before.meals.find((meal) => meal.id === fixture.meal.id)?.totalCostCents).toBe(2_500)
    expect(before.allocations.filter((allocation) => allocation.sourceId === fixture.meal.id).map((allocation) => allocation.costCents).sort((a, b) => a - b)).toEqual([1_000, 1_500])
    expect(batches.map((batch) => batch.remainingQuantityBase)).toEqual([0, 50])
    expect(batches.map((batch) => batch.remainingCostCents)).toEqual([0, 1_500])

    await expect(deletePurchase(fixture.firstPurchase.id)).rejects.toBeInstanceOf(InventoryShortageError)

    const after = await loadSnapshot()
    expect(after.purchases.map((purchase) => purchase.id)).toContain(fixture.firstPurchase.id)
    expect(after.transactions.find((transaction) => transaction.purchaseId === fixture.firstPurchase.id)).toBeTruthy()
    expect(after.meals.find((meal) => meal.id === fixture.meal.id)?.totalCostCents).toBe(2_500)
  })

  it('allows general transaction CRUD but protects purchase-linked expenses', async () => {
    const transaction = await saveTransaction({
      type: 'income',
      occurredAt: at(5),
      amountCents: 50_000,
      categoryId: DEFAULT_CATEGORY_IDS.salary,
      note: '薪資',
    })
    await deleteTransaction(transaction.id)
    expect((await loadSnapshot()).transactions.find((item) => item.id === transaction.id)).toBeUndefined()

    const ingredient = await createMassIngredient()
    const purchase = await savePurchase({
      store: '商店',
      occurredAt: at(6),
      paidTotalCents: 100,
      items: [{ ingredientId: ingredient.id, enteredQuantity: 100, enteredUnit: 'g', subtotalCents: 100 }],
    })
    const linked = (await loadSnapshot()).transactions.find((item) => item.purchaseId === purchase.id)
    await expect(deleteTransaction(linked!.id)).rejects.toThrow(/purchase flow/i)
    expect((await loadSnapshot()).transactions.find((item) => item.id === linked!.id)).toBeTruthy()
  })

  it('keeps historical inactive categories editable and only deletes unused categories', async () => {
    await expect(setCategoryActive(DEFAULT_CATEGORY_IDS.groceries, false)).rejects.toThrow(/required for purchases/i)
    await expect(deleteCategory(DEFAULT_CATEGORY_IDS.groceries)).rejects.toThrow(/required for purchases/i)

    const historical = await saveCategory({ name: '舊分類', type: 'expense', color: '#334455' })
    const transaction = await saveTransaction({
      type: 'expense',
      occurredAt: at(5),
      amountCents: 500,
      categoryId: historical.id,
      note: '原始備註',
    })
    await setCategoryActive(historical.id, false)
    await saveTransaction({
      id: transaction.id,
      type: 'expense',
      occurredAt: at(5),
      amountCents: 600,
      categoryId: historical.id,
      note: '仍保留原分類',
    })
    await expect(deleteCategory(historical.id)).rejects.toThrow(/can only be deactivated/i)

    const unused = await saveCategory({ name: '未使用分類', type: 'income', color: '#556677' })
    await deleteCategory(unused.id)
    const current = await loadSnapshot()
    expect(current.transactions.find((item) => item.id === transaction.id)).toMatchObject({
      amountCents: 600,
      categoryId: historical.id,
    })
    expect(current.categories.find((item) => item.id === unused.id)).toBeUndefined()
  })

  it('rejects a caller-supplied non-UUID meal ingredient ID without partial writes', async () => {
    const ingredient = await createMassIngredient()
    await savePurchase({
      store: '測試商店',
      occurredAt: at(1),
      paidTotalCents: 100,
      items: [{ ingredientId: ingredient.id, enteredQuantity: 10, enteredUnit: 'g', subtotalCents: 100 }],
    })

    await expect(saveMeal({
      occurredAt: at(2),
      mealType: 'lunch',
      items: [{ id: 'not-a-uuid', ingredientId: ingredient.id, enteredQuantity: 1, enteredUnit: 'g' }],
    })).rejects.toThrow(/meal ingredient id must be a UUID/i)
    expect((await loadSnapshot()).meals).toHaveLength(0)
  })

  it('exports and restores sources with the same FIFO result', async () => {
    const fixture = await createCrossBatchFixture()
    const exported = await exportBackup()

    expect(exported).not.toHaveProperty('data.allocations')
    await clearAllData()
    expect((await loadSnapshot()).purchases).toHaveLength(0)

    await importBackup(exported)
    const restored = await loadSnapshot()
    expect(restored.purchases).toHaveLength(2)
    expect(restored.meals.find((meal) => meal.id === fixture.meal.id)?.totalCostCents).toBe(2_500)
    expect(restored.allocations.filter((allocation) => allocation.sourceId === fixture.meal.id)).toHaveLength(2)
  })

  it('leaves current data untouched when an imported backup is invalid', async () => {
    await createCrossBatchFixture()
    const valid = await exportBackup()
    const invalid = structuredClone(valid)
    invalid.data.transactions[0].categoryId = crypto.randomUUID()

    await expect(importBackup(invalid)).rejects.toThrow(/missing category/i)
    const missingRequiredCategory = structuredClone(valid)
    missingRequiredCategory.data.categories = missingRequiredCategory.data.categories.filter(
      (category) => category.id !== DEFAULT_CATEGORY_IDS.groceries,
    )
    await expect(importBackup(missingRequiredCategory)).rejects.toThrow(/built-in groceries/i)
    const current = await loadSnapshot()
    expect(current.purchases).toHaveLength(2)
    expect(current.meals).toHaveLength(1)
    expect(current.allocations).toHaveLength(2)
  })
})
