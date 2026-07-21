import { describe, expect, it } from 'vitest'
import {
  DomainValidationError,
  InventoryShortageError,
  allocatePurchaseCosts,
  calculateAdjustmentAvailability,
  calculateMealAvailability,
  convertToBase,
  recalculateInventory,
  sumPurchaseItemSubtotals,
  unitsForDimension,
} from './core'
import type {
  InventoryAdjustment,
  InventorySnapshot,
  Meal,
  MealIngredient,
  Purchase,
  PurchaseItem,
} from './types'

const DAY_1 = '2026-07-01T08:00:00.000Z'
const DAY_2 = '2026-07-02T08:00:00.000Z'
const DAY_3 = '2026-07-03T08:00:00.000Z'
const DAY_4 = '2026-07-04T08:00:00.000Z'

function purchase(id: string, occurredAt: string, createdAt = occurredAt): Purchase {
  return {
    id,
    store: '測試商店',
    occurredAt,
    paidTotalCents: 0,
    transactionId: `transaction-${id}`,
    createdAt,
    updatedAt: createdAt,
  }
}

function purchaseItem({
  id,
  purchaseId,
  quantityBase,
  costCents,
  ingredientId = 'ingredient-1',
  createdAt = DAY_1,
}: {
  id: string
  purchaseId: string
  quantityBase: number
  costCents: number
  ingredientId?: string
  createdAt?: string
}): PurchaseItem {
  return {
    id,
    purchaseId,
    ingredientId,
    quantityBase,
    enteredQuantity: quantityBase,
    enteredUnit: 'g',
    subtotalCents: costCents,
    allocatedCostCents: costCents,
    createdAt,
    updatedAt: createdAt,
  }
}

function meal(id: string, occurredAt: string, createdAt = occurredAt): Meal {
  return {
    id,
    occurredAt,
    mealType: 'dinner',
    totalCostCents: 0,
    createdAt,
    updatedAt: createdAt,
  }
}

function mealIngredient({
  id,
  mealId,
  quantityBase,
  ingredientId = 'ingredient-1',
}: {
  id: string
  mealId: string
  quantityBase: number
  ingredientId?: string
}): MealIngredient {
  return {
    id,
    mealId,
    ingredientId,
    quantityBase,
    enteredQuantity: quantityBase,
    enteredUnit: 'g',
  }
}

function adjustment({
  id,
  occurredAt,
  quantityBase,
  ingredientId = 'ingredient-1',
  createdAt = occurredAt,
}: {
  id: string
  occurredAt: string
  quantityBase: number
  ingredientId?: string
  createdAt?: string
}): InventoryAdjustment {
  return {
    id,
    ingredientId,
    occurredAt,
    quantityBase,
    reason: 'discarded',
    createdAt,
    updatedAt: createdAt,
  }
}

function snapshot(overrides: Partial<InventorySnapshot> = {}): InventorySnapshot {
  return {
    purchases: [],
    purchaseItems: [],
    adjustments: [],
    meals: [],
    mealIngredients: [],
    ...overrides,
  }
}

function costsById(
  allocations: ReturnType<typeof allocatePurchaseCosts>,
): Record<string, number> {
  return Object.fromEntries(allocations.map((item) => [item.id, item.allocatedCostCents]))
}

describe('unit conversion', () => {
  it('exposes only the units compatible with each measurement dimension', () => {
    expect(unitsForDimension('mass')).toEqual(['g', 'kg'])
    expect(unitsForDimension('volume')).toEqual(['ml', 'L'])
    expect(unitsForDimension('count')).toEqual(['each', 'pack'])
  })

  it.each([
    [250, 'g', 'mass', 250],
    [1.25, 'kg', 'mass', 1_250],
    [375, 'ml', 'volume', 375],
    [2.5, 'L', 'volume', 2_500],
    [4, 'each', 'count', 4],
    [3, 'pack', 'count', 3],
  ] as const)('converts %s %s in the %s dimension to %s base units', (value, unit, dimension, expected) => {
    expect(convertToBase(value, unit, dimension)).toBe(expected)
  })

  it.each([
    [1, 'g', 'volume'],
    [1, 'ml', 'mass'],
    [1, 'pack', 'mass'],
    [1, 'kg', 'count'],
  ] as const)('rejects incompatible unit %s %s for %s', (value, unit, dimension) => {
    expect(() => convertToBase(value, unit, dimension)).toThrow(DomainValidationError)
  })

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
    'rejects invalid quantity %s',
    (value) => {
      expect(() => convertToBase(value, 'g', 'mass')).toThrow(DomainValidationError)
    },
  )

  it('rejects a finite input when conversion overflows', () => {
    expect(() => convertToBase(Number.MAX_VALUE, 'kg', 'mass')).toThrow(DomainValidationError)
  })
})

describe('purchase cost allocation', () => {
  it('sums purchase item subtotals without losing integer-cent precision', () => {
    expect(sumPurchaseItemSubtotals([
      { subtotalCents: 12_300 },
      { subtotalCents: 4_500 },
      { subtotalCents: 0 },
    ])).toBe(16_800)
  })

  it('rejects invalid subtotals and a total that exceeds the safe integer range', () => {
    expect(() => sumPurchaseItemSubtotals([{ subtotalCents: -1 }])).toThrow(DomainValidationError)
    expect(() => sumPurchaseItemSubtotals([
      { subtotalCents: Number.MAX_SAFE_INTEGER },
      { subtotalCents: 1 },
    ])).toThrow(DomainValidationError)
  })

  it('allocates a discount proportionally and preserves the paid total', () => {
    const result = allocatePurchaseCosts(1_200, [
      { id: 'vegetables', subtotalCents: 1_000 },
      { id: 'milk', subtotalCents: 500 },
    ])

    expect(result).toEqual([
      { id: 'vegetables', allocatedCostCents: 800 },
      { id: 'milk', allocatedCostCents: 400 },
    ])
    expect(result.reduce((sum, item) => sum + item.allocatedCostCents, 0)).toBe(1_200)
  })

  it('allocates a surcharge proportionally and preserves the paid total', () => {
    const result = allocatePurchaseCosts(
      [
        { id: 'vegetables', subtotalCents: 1_000 },
        { id: 'milk', subtotalCents: 500 },
      ],
      1_800,
    )

    expect(result).toEqual([
      { id: 'vegetables', allocatedCostCents: 1_200 },
      { id: 'milk', allocatedCostCents: 600 },
    ])
    expect(result.reduce((sum, item) => sum + item.allocatedCostCents, 0)).toBe(1_800)
  })

  it('distributes remainder cents by the largest fractional remainder', () => {
    const result = allocatePurchaseCosts(10, [
      { id: 'one', subtotalCents: 1 },
      { id: 'two', subtotalCents: 2 },
      { id: 'three', subtotalCents: 3 },
    ])

    expect(costsById(result)).toEqual({ one: 2, two: 3, three: 5 })
    expect(result.reduce((sum, item) => sum + item.allocatedCostCents, 0)).toBe(10)
  })

  it('uses stable item ID ordering when fractional remainders tie', () => {
    const firstOrder = allocatePurchaseCosts(100, [
      { id: 'b', subtotalCents: 1 },
      { id: 'a', subtotalCents: 1 },
      { id: 'c', subtotalCents: 1 },
    ])
    const secondOrder = allocatePurchaseCosts(100, [
      { id: 'c', subtotalCents: 1 },
      { id: 'b', subtotalCents: 1 },
      { id: 'a', subtotalCents: 1 },
    ])

    expect(costsById(firstOrder)).toEqual({ b: 33, a: 34, c: 33 })
    expect(costsById(secondOrder)).toEqual(costsById(firstOrder))
  })

  it('allows zero-subtotal items but rejects an all-zero or negative subtotal set', () => {
    expect(
      allocatePurchaseCosts(90, [
        { id: 'free', subtotalCents: 0 },
        { id: 'paid', subtotalCents: 100 },
      ]),
    ).toEqual([
      { id: 'free', allocatedCostCents: 0 },
      { id: 'paid', allocatedCostCents: 90 },
    ])

    expect(() => allocatePurchaseCosts(0, [{ id: 'zero', subtotalCents: 0 }])).toThrow(
      DomainValidationError,
    )
    expect(() => allocatePurchaseCosts(10, [{ id: 'negative', subtotalCents: -1 }])).toThrow(
      DomainValidationError,
    )
  })
})

describe('FIFO inventory recalculation', () => {
  it('makes a date-only purchase available from the start of its Taipei calendar day', () => {
    const sameDayPurchase = purchase('purchase-same-day', '2026-07-21T04:00:00.000Z')
    const breakfast = meal('meal-breakfast', '2026-07-21T01:00:00.000Z')
    const source = snapshot({
      purchases: [sameDayPurchase],
      purchaseItems: [purchaseItem({
        id: 'batch-same-day',
        purchaseId: sameDayPurchase.id,
        quantityBase: 100,
        costCents: 1_000,
        createdAt: '2026-07-21T04:00:00.000Z',
      })],
      meals: [breakfast],
      mealIngredients: [mealIngredient({
        id: 'usage-breakfast',
        mealId: breakfast.id,
        quantityBase: 25,
      })],
    })

    expect(calculateMealAvailability(source, breakfast).get('ingredient-1')).toBe(100)

    const calculated = recalculateInventory(source)
    expect(calculated.batches[0].remainingQuantityBase).toBe(75)
    expect(calculated.mealCosts[breakfast.id]).toBe(250)

    expect(calculateMealAvailability(source, {
      id: 'meal-previous-day',
      occurredAt: '2026-07-20T15:59:00.000Z',
      createdAt: '2026-07-21T05:00:00.000Z',
    }).get('ingredient-1')).toBeUndefined()
  })

  it('calculates meal availability at the candidate historical time', () => {
    const firstPurchase = purchase('purchase-first', DAY_1)
    const futurePurchase = purchase('purchase-future', DAY_4)
    const earlierMeal = meal('meal-earlier', DAY_2)
    const editedMeal = meal('meal-edited', DAY_3)
    const laterMeal = meal('meal-later', DAY_4)
    const source = snapshot({
      purchases: [firstPurchase, futurePurchase],
      purchaseItems: [
        purchaseItem({
          id: 'batch-first',
          purchaseId: firstPurchase.id,
          quantityBase: 100,
          costCents: 1_000,
        }),
        purchaseItem({
          id: 'batch-future',
          purchaseId: futurePurchase.id,
          quantityBase: 100,
          costCents: 2_000,
          createdAt: DAY_4,
        }),
      ],
      adjustments: [adjustment({ id: 'discard-earlier', occurredAt: DAY_2, quantityBase: 10 })],
      meals: [earlierMeal, editedMeal, laterMeal],
      mealIngredients: [
        mealIngredient({ id: 'usage-earlier', mealId: earlierMeal.id, quantityBase: 30 }),
        mealIngredient({ id: 'usage-edited', mealId: editedMeal.id, quantityBase: 20 }),
        mealIngredient({ id: 'usage-later', mealId: laterMeal.id, quantityBase: 50 }),
      ],
    })

    expect(calculateMealAvailability(source, editedMeal).get('ingredient-1')).toBe(60)
    expect(calculateAdjustmentAvailability(source, {
      id: 'discard-earlier',
      occurredAt: DAY_3,
      createdAt: DAY_2,
    }).get('ingredient-1')).toBe(70)
    expect(calculateMealAvailability(source, {
      id: 'new-meal',
      occurredAt: '2026-06-30T08:00:00.000Z',
      createdAt: DAY_4,
    }).get('ingredient-1')).toBeUndefined()
  })

  it('sorts batches chronologically and consumes across batches using FIFO', () => {
    const olderPurchase = purchase('purchase-old', DAY_1)
    const newerPurchase = purchase('purchase-new', DAY_2)
    const dinner = meal('meal-1', DAY_3)
    const result = recalculateInventory(
      snapshot({
        // Deliberately reversed to prove source array order is irrelevant.
        purchases: [newerPurchase, olderPurchase],
        purchaseItems: [
          purchaseItem({
            id: 'batch-new',
            purchaseId: newerPurchase.id,
            quantityBase: 10,
            costCents: 300,
            createdAt: DAY_2,
          }),
          purchaseItem({
            id: 'batch-old',
            purchaseId: olderPurchase.id,
            quantityBase: 10,
            costCents: 100,
            createdAt: DAY_1,
          }),
        ],
        meals: [dinner],
        mealIngredients: [
          mealIngredient({ id: 'usage-1', mealId: dinner.id, quantityBase: 15 }),
        ],
      }),
    )

    expect(result.allocations.map(({ purchaseItemId, quantityBase, costCents }) => ({
      purchaseItemId,
      quantityBase,
      costCents,
    }))).toEqual([
      { purchaseItemId: 'batch-old', quantityBase: 10, costCents: 100 },
      { purchaseItemId: 'batch-new', quantityBase: 5, costCents: 150 },
    ])
    expect(result.mealCosts).toEqual({ 'meal-1': 250 })
    expect(result.batches.map(({ id, remainingQuantityBase, remainingCostCents }) => ({
      id,
      remainingQuantityBase,
      remainingCostCents,
    }))).toEqual([
      { id: 'batch-old', remainingQuantityBase: 0, remainingCostCents: 0 },
      { id: 'batch-new', remainingQuantityBase: 5, remainingCostCents: 150 },
    ])
  })

  it('absorbs rounding differences when a batch is fully exhausted', () => {
    const sourcePurchase = purchase('purchase-1', DAY_1)
    const firstMeal = meal('meal-first', DAY_2)
    const secondMeal = meal('meal-second', DAY_3)
    const result = recalculateInventory(
      snapshot({
        purchases: [sourcePurchase],
        purchaseItems: [
          purchaseItem({
            id: 'batch-1',
            purchaseId: sourcePurchase.id,
            quantityBase: 3,
            costCents: 100,
          }),
        ],
        // Deliberately reversed to verify event ordering by occurredAt.
        meals: [secondMeal, firstMeal],
        mealIngredients: [
          mealIngredient({ id: 'usage-second', mealId: secondMeal.id, quantityBase: 2 }),
          mealIngredient({ id: 'usage-first', mealId: firstMeal.id, quantityBase: 1 }),
        ],
      }),
    )

    expect(result.allocations.map((allocation) => allocation.costCents)).toEqual([33, 67])
    expect(result.mealCosts).toEqual({ 'meal-second': 67, 'meal-first': 33 })
    expect(result.batches[0]).toMatchObject({
      remainingQuantityBase: 0,
      remainingCostCents: 0,
    })
    expect(result.allocations.reduce((sum, allocation) => sum + allocation.costCents, 0)).toBe(
      100,
    )
  })

  it('deducts adjustment cost from inventory without adding it to meal cost', () => {
    const sourcePurchase = purchase('purchase-1', DAY_1)
    const dinner = meal('meal-1', DAY_3)
    const result = recalculateInventory(
      snapshot({
        purchases: [sourcePurchase],
        purchaseItems: [
          purchaseItem({
            id: 'batch-1',
            purchaseId: sourcePurchase.id,
            quantityBase: 10,
            costCents: 101,
          }),
        ],
        adjustments: [adjustment({ id: 'discard-1', occurredAt: DAY_2, quantityBase: 2 })],
        meals: [dinner],
        mealIngredients: [
          mealIngredient({ id: 'usage-1', mealId: dinner.id, quantityBase: 8 }),
        ],
      }),
    )

    expect(result.allocations).toHaveLength(2)
    expect(result.allocations[0]).toMatchObject({
      sourceType: 'adjustment',
      sourceId: 'discard-1',
      quantityBase: 2,
      costCents: 20,
    })
    expect(result.allocations[1]).toMatchObject({
      sourceType: 'meal',
      sourceId: 'meal-1',
      quantityBase: 8,
      costCents: 81,
    })
    expect(result.mealCosts).toEqual({ 'meal-1': 81 })
    expect(result.batches[0]).toMatchObject({
      remainingQuantityBase: 0,
      remainingCostCents: 0,
    })
  })

  it('does not allow an event to consume a batch purchased in the future', () => {
    const earlyMeal = meal('meal-early', DAY_1)
    const futurePurchase = purchase('purchase-future', DAY_2)
    const source = snapshot({
      purchases: [futurePurchase],
      purchaseItems: [
        purchaseItem({
          id: 'batch-future',
          purchaseId: futurePurchase.id,
          quantityBase: 10,
          costCents: 100,
          createdAt: DAY_2,
        }),
      ],
      meals: [earlyMeal],
      mealIngredients: [
        mealIngredient({ id: 'usage-early', mealId: earlyMeal.id, quantityBase: 1 }),
      ],
    })

    expect(() => recalculateInventory(source)).toThrow(InventoryShortageError)
    try {
      recalculateInventory(source)
    } catch (error) {
      expect(error).toMatchObject({
        ingredientId: 'ingredient-1',
        occurredAt: DAY_1,
        missingQuantity: 1,
      })
    }
  })

  it('throws atomically on shortage without returning partial allocations', () => {
    const sourcePurchase = purchase('purchase-1', DAY_1)
    const firstMeal = meal('meal-first', DAY_2)
    const failingMeal = meal('meal-failing', DAY_3)
    const source = snapshot({
      purchases: [sourcePurchase],
      purchaseItems: [
        purchaseItem({
          id: 'batch-1',
          purchaseId: sourcePurchase.id,
          quantityBase: 5,
          costCents: 100,
        }),
      ],
      meals: [firstMeal, failingMeal],
      mealIngredients: [
        mealIngredient({ id: 'usage-first', mealId: firstMeal.id, quantityBase: 3 }),
        mealIngredient({ id: 'usage-failing', mealId: failingMeal.id, quantityBase: 4 }),
      ],
    })
    const before = structuredClone(source)
    let returnedResult: ReturnType<typeof recalculateInventory> | undefined
    let thrownError: unknown

    try {
      returnedResult = recalculateInventory(source)
    } catch (error) {
      thrownError = error
    }

    expect(returnedResult).toBeUndefined()
    expect(thrownError).toBeInstanceOf(InventoryShortageError)
    expect(thrownError).toMatchObject({
      ingredientId: 'ingredient-1',
      occurredAt: DAY_3,
      missingQuantity: 2,
    })
    expect(thrownError).not.toHaveProperty('allocations')
    expect(source).toEqual(before)
  })

  it('does not mutate source arrays or records after a successful recalculation', () => {
    const sourcePurchase = purchase('purchase-1', DAY_1)
    const dinner = meal('meal-1', DAY_2)
    const source = snapshot({
      purchases: [sourcePurchase],
      purchaseItems: [
        purchaseItem({
          id: 'batch-1',
          purchaseId: sourcePurchase.id,
          quantityBase: 10,
          costCents: 100,
        }),
      ],
      adjustments: [adjustment({ id: 'discard-1', occurredAt: DAY_4, quantityBase: 1 })],
      meals: [dinner],
      mealIngredients: [
        mealIngredient({ id: 'usage-1', mealId: dinner.id, quantityBase: 2 }),
      ],
    })
    const before = structuredClone(source)

    recalculateInventory(source)

    expect(source).toEqual(before)
  })
})
