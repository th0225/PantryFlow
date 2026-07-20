import type {
  BaseUnit,
  InputUnit,
  InventoryAdjustmentReason,
  MealType,
  MeasurementDimension,
  TransactionType,
} from '../domain/types'

export const transactionTypeLabels: Record<TransactionType, string> = {
  income: '收入',
  expense: '支出',
}

export const dimensionLabels: Record<MeasurementDimension, string> = {
  mass: '重量',
  volume: '容量',
  count: '數量',
}

export const baseUnitForDimension: Record<MeasurementDimension, BaseUnit> = {
  mass: 'g',
  volume: 'ml',
  count: 'each',
}

export const inputUnitLabels: Record<InputUnit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  L: 'L',
  each: '個',
  pack: '包',
}

export const mealTypeLabels: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '點心',
  other: '其他',
}

export const adjustmentReasonLabels: Record<InventoryAdjustmentReason, string> = {
  expired: '過期',
  discarded: '丟棄',
  damaged: '損壞',
  stocktake_shortage: '盤點短少',
  other: '其他',
}
