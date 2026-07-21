import type {
  ConsumptionAllocation,
  ConsumptionSourceType,
  DerivedInventoryBatch,
  EntityId,
  InputUnit,
  InventoryCalculationResult,
  InventorySnapshot,
  Meal,
  MeasurementDimension,
  MoneyCents,
  PurchaseCostAllocation,
  PurchaseCostAllocationInput,
} from './types'

const UNITS_BY_DIMENSION = {
  mass: ['g', 'kg'],
  volume: ['ml', 'L'],
  count: ['each', 'pack'],
} as const satisfies Record<MeasurementDimension, readonly InputUnit[]>

const UNIT_MULTIPLIER: Record<InputUnit, number> = {
  g: 1,
  kg: 1_000,
  ml: 1,
  L: 1_000,
  each: 1,
  pack: 1,
}

const MILLISECONDS_PER_DAY = 86_400_000
const TAIPEI_UTC_OFFSET_MS = 8 * 60 * 60 * 1_000

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainValidationError'
  }
}

export class InventoryShortageError extends Error {
  readonly ingredientId: EntityId
  readonly occurredAt: string
  readonly missingQuantity: number

  constructor(ingredientId: EntityId, occurredAt: string, missingQuantity: number) {
    super(
      `Insufficient inventory for ingredient ${ingredientId} at ${occurredAt}; missing ${missingQuantity}`,
    )
    this.name = 'InventoryShortageError'
    this.ingredientId = ingredientId
    this.occurredAt = occurredAt
    this.missingQuantity = missingQuantity
  }
}

export function unitsForDimension(dimension: MeasurementDimension): readonly InputUnit[] {
  const units = UNITS_BY_DIMENSION[dimension]
  if (!units) {
    throw new DomainValidationError(`Unsupported measurement dimension: ${String(dimension)}`)
  }
  return units
}

export function dimensionForInputUnit(unit: InputUnit): MeasurementDimension {
  if (unit === 'g' || unit === 'kg') return 'mass'
  if (unit === 'ml' || unit === 'L') return 'volume'
  if (unit === 'each' || unit === 'pack') return 'count'
  throw new DomainValidationError(`Unsupported input unit: ${String(unit)}`)
}

export function normalizeIngredientName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('zh-Hant')
}

export function convertToBase(
  quantity: number,
  unit: InputUnit,
  dimension: MeasurementDimension,
): number {
  assertPositiveFinite(quantity, 'quantity')

  if (!unitsForDimension(dimension).includes(unit)) {
    throw new DomainValidationError(`Unit ${unit} is incompatible with dimension ${dimension}`)
  }

  const converted = quantity * UNIT_MULTIPLIER[unit]
  assertPositiveFinite(converted, 'converted quantity')
  return converted
}

export function sumPurchaseItemSubtotals(
  items: readonly Pick<PurchaseCostAllocationInput, 'subtotalCents'>[],
): MoneyCents {
  return items.reduce((total, item, index) => {
    assertNonNegativeSafeInteger(item.subtotalCents, `subtotalCents for item ${index + 1}`)
    const nextTotal = total + item.subtotalCents
    assertNonNegativeSafeInteger(nextTotal, 'purchase item subtotal total')
    return nextTotal
  }, 0)
}

export function allocatePurchaseCosts(
  paidTotalCents: MoneyCents,
  items: readonly PurchaseCostAllocationInput[],
): PurchaseCostAllocation[]
export function allocatePurchaseCosts(
  items: readonly PurchaseCostAllocationInput[],
  paidTotalCents: MoneyCents,
): PurchaseCostAllocation[]
export function allocatePurchaseCosts(
  first: MoneyCents | readonly PurchaseCostAllocationInput[],
  second: MoneyCents | readonly PurchaseCostAllocationInput[],
): PurchaseCostAllocation[] {
  const paidTotalCents = typeof first === 'number' ? first : second
  const items = Array.isArray(first) ? first : second

  if (typeof paidTotalCents !== 'number' || !Array.isArray(items)) {
    throw new DomainValidationError('allocatePurchaseCosts requires a total and an item list')
  }
  assertNonNegativeSafeInteger(paidTotalCents, 'paidTotalCents')
  if (items.length === 0) {
    throw new DomainValidationError('At least one purchase item is required')
  }
  assertUniqueIds(items, 'purchase item')

  const normalized = items.map((item, inputIndex) => {
    assertNonNegativeSafeInteger(item.subtotalCents, `subtotalCents for item ${item.id}`)
    return {
      id: item.id,
      inputIndex,
      subtotal: BigInt(item.subtotalCents),
    }
  })
  const subtotalTotal = normalized.reduce((sum, item) => sum + item.subtotal, 0n)
  if (subtotalTotal <= 0n) {
    throw new DomainValidationError('At least one purchase item subtotal must be greater than zero')
  }

  const paid = BigInt(paidTotalCents)
  const shares = normalized.map((item) => {
    const numerator = paid * item.subtotal
    return {
      ...item,
      allocated: numerator / subtotalTotal,
      remainder: numerator % subtotalTotal,
    }
  })
  const allocatedFloorTotal = shares.reduce((sum, item) => sum + item.allocated, 0n)
  let centsToDistribute = Number(paid - allocatedFloorTotal)

  const remainderOrder = [...shares].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1
    }
    return compareStableId(left.id, right.id)
  })

  for (let index = 0; index < remainderOrder.length && centsToDistribute > 0; index += 1) {
    remainderOrder[index].allocated += 1n
    centsToDistribute -= 1
  }

  return shares
    .sort((left, right) => left.inputIndex - right.inputIndex)
    .map(({ id, allocated }) => ({ id, allocatedCostCents: Number(allocated) }))
}

interface WorkingBatch extends DerivedInventoryBatch {
  occurredAtMs: number
  createdAtMs: number
}

interface ConsumptionEvent {
  eventId: EntityId
  sortId: EntityId
  sourceType: ConsumptionSourceType
  sourceId: EntityId
  mealIngredientId?: EntityId
  ingredientId: EntityId
  occurredAt: string
  occurredAtMs: number
  createdAt: string
  createdAtMs: number
  quantityBase: number
}

export function recalculateInventory(snapshot: InventorySnapshot): InventoryCalculationResult {
  assertUniqueIds(snapshot.purchases, 'purchase')
  assertUniqueIds(snapshot.purchaseItems, 'purchase item')
  assertUniqueIds(snapshot.meals, 'meal')
  assertUniqueIds(snapshot.mealIngredients, 'meal ingredient')
  assertUniqueIds(snapshot.adjustments, 'inventory adjustment')

  const purchasesById = new Map(snapshot.purchases.map((purchase) => [purchase.id, purchase]))
  const mealsById = new Map(snapshot.meals.map((meal) => [meal.id, meal]))

  const workingBatches: WorkingBatch[] = snapshot.purchaseItems.map((item) => {
    const purchase = purchasesById.get(item.purchaseId)
    if (!purchase) {
      throw new DomainValidationError(
        `Purchase item ${item.id} references missing purchase ${item.purchaseId}`,
      )
    }

    assertPositiveFinite(item.quantityBase, `quantityBase for purchase item ${item.id}`)
    assertNonNegativeSafeInteger(
      item.allocatedCostCents,
      `allocatedCostCents for purchase item ${item.id}`,
    )
    assertNonNegativeSafeInteger(item.subtotalCents, `subtotalCents for purchase item ${item.id}`)

    const occurredAtMs = parsePurchaseDayStart(
      purchase.occurredAt,
      `purchase ${purchase.id} occurredAt`,
    )
    const createdAtMs = parseTimestamp(item.createdAt, `purchase item ${item.id} createdAt`)

    return {
      id: item.id,
      purchaseItemId: item.id,
      purchaseId: item.purchaseId,
      ingredientId: item.ingredientId,
      occurredAt: purchase.occurredAt,
      createdAt: item.createdAt,
      expiresOn: item.expiresOn,
      enteredQuantity: item.enteredQuantity,
      enteredUnit: item.enteredUnit,
      subtotalCents: item.subtotalCents,
      quantityBase: item.quantityBase,
      originalQuantityBase: item.quantityBase,
      remainingQuantityBase: item.quantityBase,
      allocatedCostCents: item.allocatedCostCents,
      remainingCostCents: item.allocatedCostCents,
      occurredAtMs,
      createdAtMs,
    }
  })

  workingBatches.sort(compareWorkingBatches)

  const mealCosts: Record<EntityId, MoneyCents> = {}
  for (const meal of snapshot.meals) {
    parseTimestamp(meal.occurredAt, `meal ${meal.id} occurredAt`)
    parseTimestamp(meal.createdAt, `meal ${meal.id} createdAt`)
    mealCosts[meal.id] = 0
  }

  const events: ConsumptionEvent[] = snapshot.mealIngredients.map((mealIngredient) => {
    const meal = mealsById.get(mealIngredient.mealId)
    if (!meal) {
      throw new DomainValidationError(
        `Meal ingredient ${mealIngredient.id} references missing meal ${mealIngredient.mealId}`,
      )
    }
    assertPositiveFinite(
      mealIngredient.quantityBase,
      `quantityBase for meal ingredient ${mealIngredient.id}`,
    )

    return {
      eventId: mealIngredient.id,
      sortId: meal.id,
      sourceType: 'meal',
      sourceId: meal.id,
      mealIngredientId: mealIngredient.id,
      ingredientId: mealIngredient.ingredientId,
      occurredAt: meal.occurredAt,
      occurredAtMs: parseTimestamp(meal.occurredAt, `meal ${meal.id} occurredAt`),
      createdAt: meal.createdAt,
      createdAtMs: parseTimestamp(meal.createdAt, `meal ${meal.id} createdAt`),
      quantityBase: mealIngredient.quantityBase,
    }
  })

  for (const adjustment of snapshot.adjustments) {
    assertPositiveFinite(
      adjustment.quantityBase,
      `quantityBase for inventory adjustment ${adjustment.id}`,
    )
    events.push({
      eventId: adjustment.id,
      sortId: adjustment.id,
      sourceType: 'adjustment',
      sourceId: adjustment.id,
      ingredientId: adjustment.ingredientId,
      occurredAt: adjustment.occurredAt,
      occurredAtMs: parseTimestamp(
        adjustment.occurredAt,
        `inventory adjustment ${adjustment.id} occurredAt`,
      ),
      createdAt: adjustment.createdAt,
      createdAtMs: parseTimestamp(
        adjustment.createdAt,
        `inventory adjustment ${adjustment.id} createdAt`,
      ),
      quantityBase: adjustment.quantityBase,
    })
  }

  events.sort(compareConsumptionEvents)

  const batchesByIngredient = new Map<EntityId, WorkingBatch[]>()
  for (const batch of workingBatches) {
    const batches = batchesByIngredient.get(batch.ingredientId)
    if (batches) {
      batches.push(batch)
    } else {
      batchesByIngredient.set(batch.ingredientId, [batch])
    }
  }

  const allocations: ConsumptionAllocation[] = []

  for (const event of events) {
    let quantityNeeded = event.quantityBase
    let allocationIndex = 0
    const batches = batchesByIngredient.get(event.ingredientId) ?? []

    for (const batch of batches) {
      if (isEffectivelyZero(quantityNeeded)) {
        quantityNeeded = 0
        break
      }
      if (
        isEffectivelyZero(batch.remainingQuantityBase) ||
        batch.occurredAtMs > event.occurredAtMs
      ) {
        continue
      }

      const quantityTaken = Math.min(quantityNeeded, batch.remainingQuantityBase)
      const consumesEntireBatch = quantitiesEqual(quantityTaken, batch.remainingQuantityBase)
      const costCents = consumesEntireBatch
        ? batch.remainingCostCents
        : clampInteger(
            Math.round(
              (batch.remainingCostCents * quantityTaken) / batch.remainingQuantityBase,
            ),
            0,
            batch.remainingCostCents,
          )

      batch.remainingQuantityBase = subtractQuantities(
        batch.remainingQuantityBase,
        quantityTaken,
      )
      batch.remainingCostCents -= costCents
      quantityNeeded = subtractQuantities(quantityNeeded, quantityTaken)

      const allocation: ConsumptionAllocation = {
        id: allocationId(event, batch, allocationIndex),
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        purchaseItemId: batch.purchaseItemId,
        ingredientId: event.ingredientId,
        quantityBase: quantityTaken,
        costCents,
      }
      if (event.mealIngredientId) {
        allocation.mealIngredientId = event.mealIngredientId
      }
      allocations.push(allocation)

      if (event.sourceType === 'meal') {
        mealCosts[event.sourceId] += costCents
      }
      allocationIndex += 1
    }

    if (!isEffectivelyZero(quantityNeeded)) {
      throw new InventoryShortageError(
        event.ingredientId,
        event.occurredAt,
        quantityNeeded,
      )
    }
  }

  const batches = workingBatches.map(({ occurredAtMs: _occurredAtMs, createdAtMs: _createdAtMs, ...batch }) => batch)
  return { allocations, batches, mealCosts }
}

export interface MealAvailabilityCandidate {
  id: EntityId
  occurredAt: string
  createdAt: string
}

export interface InventoryAvailabilityCandidate extends MealAvailabilityCandidate {
  sourceType: ConsumptionSourceType
}

/**
 * Returns the quantity available immediately before a candidate meal in the
 * historical event order. The candidate itself and every later consumption
 * event are excluded, while future purchase batches are not counted.
 */
export function calculateMealAvailability(
  snapshot: InventorySnapshot,
  candidate: MealAvailabilityCandidate,
): Map<EntityId, number> {
  return calculateInventoryAvailability(snapshot, { ...candidate, sourceType: 'meal' })
}

export function calculateAdjustmentAvailability(
  snapshot: InventorySnapshot,
  candidate: MealAvailabilityCandidate,
): Map<EntityId, number> {
  return calculateInventoryAvailability(snapshot, { ...candidate, sourceType: 'adjustment' })
}

function calculateInventoryAvailability(
  snapshot: InventorySnapshot,
  candidate: InventoryAvailabilityCandidate,
): Map<EntityId, number> {
  const candidateKey = availabilityKey(candidate, `candidate ${candidate.sourceType}`)
  const priorMeals = snapshot.meals.filter(
    (meal) =>
      !(candidate.sourceType === 'meal' && meal.id === candidate.id) &&
      compareAvailabilityKeys(
        availabilityKey(meal, `meal ${meal.id}`),
        candidateKey,
      ) < 0,
  )
  const priorMealIds = new Set(priorMeals.map((meal) => meal.id))
  const priorAdjustments = snapshot.adjustments.filter(
    (adjustment) =>
      !(candidate.sourceType === 'adjustment' && adjustment.id === candidate.id) &&
      compareAvailabilityKeys(
        availabilityKey(adjustment, `inventory adjustment ${adjustment.id}`),
        candidateKey,
      ) < 0,
  )
  const calculated = recalculateInventory({
    purchases: snapshot.purchases,
    purchaseItems: snapshot.purchaseItems,
    meals: priorMeals,
    mealIngredients: snapshot.mealIngredients.filter((item) => priorMealIds.has(item.mealId)),
    adjustments: priorAdjustments,
  })
  const available = new Map<EntityId, number>()

  for (const batch of calculated.batches) {
    if (
      parsePurchaseDayStart(batch.occurredAt, `purchase batch ${batch.id} occurredAt`) >
        candidateKey.occurredAtMs ||
      isEffectivelyZero(batch.remainingQuantityBase)
    ) {
      continue
    }
    available.set(
      batch.ingredientId,
      (available.get(batch.ingredientId) ?? 0) + batch.remainingQuantityBase,
    )
  }
  return available
}

interface AvailabilityKey {
  id: EntityId
  occurredAtMs: number
  createdAtMs: number
}

function availabilityKey(
  value: Pick<Meal, 'id' | 'occurredAt' | 'createdAt'>,
  label: string,
): AvailabilityKey {
  return {
    id: value.id,
    occurredAtMs: parseTimestamp(value.occurredAt, `${label} occurredAt`),
    createdAtMs: parseTimestamp(value.createdAt, `${label} createdAt`),
  }
}

function compareAvailabilityKeys(left: AvailabilityKey, right: AvailabilityKey) {
  if (left.occurredAtMs !== right.occurredAtMs) return left.occurredAtMs - right.occurredAtMs
  if (left.createdAtMs !== right.createdAtMs) return left.createdAtMs - right.createdAtMs
  return compareStableId(left.id, right.id)
}

function compareWorkingBatches(left: WorkingBatch, right: WorkingBatch): number {
  const ingredientOrder = compareStableId(left.ingredientId, right.ingredientId)
  if (ingredientOrder !== 0) return ingredientOrder
  if (left.occurredAtMs !== right.occurredAtMs) return left.occurredAtMs - right.occurredAtMs
  if (left.createdAtMs !== right.createdAtMs) return left.createdAtMs - right.createdAtMs
  return compareStableId(left.id, right.id)
}

function compareConsumptionEvents(left: ConsumptionEvent, right: ConsumptionEvent): number {
  if (left.occurredAtMs !== right.occurredAtMs) return left.occurredAtMs - right.occurredAtMs
  if (left.createdAtMs !== right.createdAtMs) return left.createdAtMs - right.createdAtMs
  const sourceOrder = compareStableId(left.sortId, right.sortId)
  if (sourceOrder !== 0) return sourceOrder
  return compareStableId(left.eventId, right.eventId)
}

function allocationId(
  event: ConsumptionEvent,
  batch: WorkingBatch,
  allocationIndex: number,
): EntityId {
  return `allocation:${event.sourceType}:${event.eventId}:${batch.purchaseItemId}:${allocationIndex}`
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DomainValidationError(`${label} must be a finite number greater than zero`)
  }
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label} must be a non-negative safe integer`)
  }
}

function assertUniqueIds(items: readonly { id: EntityId }[], label: string): void {
  const ids = new Set<EntityId>()
  for (const item of items) {
    if (ids.has(item.id)) {
      throw new DomainValidationError(`Duplicate ${label} id: ${item.id}`)
    }
    ids.add(item.id)
  }
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    throw new DomainValidationError(`${label} must be a valid ISO 8601 date-time`)
  }
  return timestamp
}

/**
 * Purchases only collect a calendar date. Existing records are serialized at
 * noon in Taipei, so inventory chronology must normalize them to the start of
 * that Taipei calendar day rather than treating noon as an actual purchase
 * time.
 */
function parsePurchaseDayStart(value: string, label: string): number {
  const timestamp = parseTimestamp(value, label)
  return (
    Math.floor((timestamp + TAIPEI_UTC_OFFSET_MS) / MILLISECONDS_PER_DAY) *
      MILLISECONDS_PER_DAY -
    TAIPEI_UTC_OFFSET_MS
  )
}

function compareStableId(left: EntityId, right: EntityId): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function quantitiesEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= Number.EPSILON * scale * 8
}

function isEffectivelyZero(value: number): boolean {
  return quantitiesEqual(value, 0)
}

function subtractQuantities(left: number, right: number): number {
  const difference = left - right
  if (quantitiesEqual(difference, 0)) return 0
  return difference
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
