import Dexie, { type Table } from 'dexie'
import type {
  Category,
  ConsumptionAllocation,
  Ingredient,
  InventoryAdjustment,
  Meal,
  MealIngredient,
  Purchase,
  PurchaseItem,
  Transaction,
} from '../domain/types'

export const DEFAULT_CATEGORY_IDS = {
  salary: '10000000-0000-4000-8000-000000000001',
  otherIncome: '10000000-0000-4000-8000-000000000002',
  groceries: '20000000-0000-4000-8000-000000000001',
  dining: '20000000-0000-4000-8000-000000000002',
  transport: '20000000-0000-4000-8000-000000000003',
  home: '20000000-0000-4000-8000-000000000004',
  entertainment: '20000000-0000-4000-8000-000000000005',
  otherExpense: '20000000-0000-4000-8000-000000000006',
} as const

export function createDefaultCategories(timestamp = new Date().toISOString()): Category[] {
  return [
    { id: DEFAULT_CATEGORY_IDS.salary, name: '薪資', type: 'income', color: '#2b725c', isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: DEFAULT_CATEGORY_IDS.otherIncome, name: '其他收入', type: 'income', color: '#799a8e', isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: DEFAULT_CATEGORY_IDS.groceries, name: '食材', type: 'expense', color: '#1f5c4a', isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: DEFAULT_CATEGORY_IDS.dining, name: '餐飲', type: 'expense', color: '#d88b18', isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: DEFAULT_CATEGORY_IDS.transport, name: '交通', type: 'expense', color: '#799a8e', isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: DEFAULT_CATEGORY_IDS.home, name: '居家', type: 'expense', color: '#955b0d', isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: DEFAULT_CATEGORY_IDS.entertainment, name: '娛樂', type: 'expense', color: '#a33a2a', isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: DEFAULT_CATEGORY_IDS.otherExpense, name: '其他支出', type: 'expense', color: '#78716c', isActive: true, createdAt: timestamp, updatedAt: timestamp },
  ]
}

export class PantryFlowDatabase extends Dexie {
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  ingredients!: Table<Ingredient, string>
  purchases!: Table<Purchase, string>
  purchaseItems!: Table<PurchaseItem, string>
  adjustments!: Table<InventoryAdjustment, string>
  meals!: Table<Meal, string>
  mealIngredients!: Table<MealIngredient, string>
  allocations!: Table<ConsumptionAllocation, string>

  constructor() {
    super('PantryFlow')

    this.version(1).stores({
      // IndexedDB booleans are not valid index keys, so isActive is filtered in memory.
      categories: 'id, type, name, createdAt, updatedAt',
      transactions: 'id, type, occurredAt, categoryId, purchaseId, createdAt, updatedAt, [type+occurredAt], [categoryId+occurredAt]',
      ingredients: 'id, name, dimension, baseUnit, createdAt, updatedAt',
      purchases: 'id, occurredAt, transactionId, createdAt, updatedAt',
      purchaseItems: 'id, purchaseId, ingredientId, expiresOn, createdAt, updatedAt, [ingredientId+purchaseId]',
      adjustments: 'id, ingredientId, occurredAt, reason, createdAt, updatedAt, [ingredientId+occurredAt]',
      meals: 'id, occurredAt, mealType, createdAt, updatedAt',
      mealIngredients: 'id, mealId, ingredientId, [mealId+ingredientId], [ingredientId+mealId]',
      allocations: 'id, sourceType, sourceId, mealIngredientId, purchaseItemId, ingredientId, [sourceType+sourceId], [ingredientId+purchaseItemId]',
    })

    this.on('populate', (transaction) =>
      transaction.table<Category, string>('categories').bulkAdd(createDefaultCategories()),
    )
  }
}

export const db = new PantryFlowDatabase()
