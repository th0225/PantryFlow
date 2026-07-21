import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  CaretRight,
  ForkKnife,
  MinusCircle,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  EmptyState,
  Field,
  InlineAlert,
  LoadingScreen,
  PageHeader,
  inputClass,
  selectClass,
  textareaClass,
} from '../components/Common'
import { ConfirmDialog, Modal } from '../components/Dialog'
import { useFeedback } from '../components/Feedback'
import { deleteMeal, saveMeal } from '../data/repository'
import { usePantryData } from '../data/store'
import { calculateMealAvailability, convertToBase, unitsForDimension } from '../domain/core'
import type {
  Ingredient,
  InputUnit,
  Meal,
  MealIngredient,
  MealType,
} from '../domain/types'
import {
  currentMonthInput,
  dateTimeInputToIso,
  formatBaseQuantity,
  formatDateTime,
  formatMoney,
  monthKey,
  nowDateTimeInput,
  toDateTimeInput,
} from '../lib/format'
import { inputUnitLabels, mealTypeLabels } from '../lib/options'

const MEAL_FORM_ID = 'meal-editor-form'
const QUANTITY_EPSILON = 1e-9

interface MealItemFormState {
  key: string
  id?: string
  ingredientId: string
  quantity: string
  unit: InputUnit
}

interface MealFormState {
  occurredAt: string
  mealType: MealType
  note: string
  items: MealItemFormState[]
}

interface MealFormErrors {
  occurredAt?: string
  mealType?: string
  items?: string
}

interface MealItemErrors {
  ingredientId?: string
  quantity?: string
  unit?: string
}

interface ItemAvailability {
  availableBase: number
  requestedBase: number | null
  shortageBase: number
  duplicate: boolean
  conversionError?: string
}

let mealItemSequence = 0

function nextMealItemKey() {
  mealItemSequence += 1
  return `row-${mealItemSequence}`
}

function sortedIngredients(ingredients: readonly Ingredient[]) {
  return [...ingredients].sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant'))
}

function newItemForIngredient(ingredient?: Ingredient): MealItemFormState {
  return {
    key: nextMealItemKey(),
    ingredientId: ingredient?.id ?? '',
    quantity: '',
    unit: ingredient ? unitsForDimension(ingredient.dimension)[0] : 'g',
  }
}

function createMealFormState(
  meal: Meal | null,
  mealIngredients: readonly MealIngredient[],
  ingredients: readonly Ingredient[],
): MealFormState {
  const ingredientOptions = sortedIngredients(ingredients)
  const existingItems = meal
    ? mealIngredients
        .filter((item) => item.mealId === meal.id)
        .map((item) => ({
          key: nextMealItemKey(),
          id: item.id,
          ingredientId: item.ingredientId,
          quantity: String(item.enteredQuantity),
          unit: item.enteredUnit,
        }))
    : []

  return {
    occurredAt: meal ? toDateTimeInput(meal.occurredAt) : nowDateTimeInput(),
    mealType: meal?.mealType ?? 'dinner',
    note: meal?.note ?? '',
    items: existingItems.length > 0
      ? existingItems
      : ingredientOptions.length > 0
        ? [newItemForIngredient(ingredientOptions[0])]
        : [],
  }
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-')
  return `${Number(year)} 年 ${Number(month)} 月`
}

function compareMealsNewestFirst(left: Meal, right: Meal) {
  return (
    right.occurredAt.localeCompare(left.occurredAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  )
}

export default function MealsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const feedback = useFeedback()
  const { snapshot, derived, loading, pending, error, refresh, mutate, describeError } = usePantryData()

  const [formOpen, setFormOpen] = useState(false)
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [form, setForm] = useState<MealFormState>(() => createMealFormState(null, [], []))
  const [formErrors, setFormErrors] = useState<MealFormErrors>({})
  const [itemErrors, setItemErrors] = useState<Record<string, MealItemErrors>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Meal | null>(null)
  const [deleting, setDeleting] = useState(false)
  const handledQueryRef = useRef<string | null>(null)

  const clearEditorQuery = useCallback(() => {
    if ((location.state as { pantryflowEditorEntry?: boolean } | null)?.pantryflowEditorEntry) {
      navigate(-1)
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.delete('edit')
    setSearchParams(next, { replace: true })
  }, [location.state, navigate, searchParams, setSearchParams])

  const requestedNew = searchParams.get('new') === '1'
  const requestedEditId = searchParams.get('edit')
  const requestedEditorKey = requestedNew
    ? 'new'
    : requestedEditId
      ? `edit:${requestedEditId}`
      : null

  useEffect(() => {
    if (!requestedEditorKey) {
      handledQueryRef.current = null
      setFormOpen(false)
      setEditingMeal(null)
      setFormErrors({})
      setItemErrors({})
      setSubmitError(null)
      return
    }
    if (!snapshot || handledQueryRef.current === requestedEditorKey) return

    handledQueryRef.current = requestedEditorKey

    if (requestedNew) {
      if (snapshot.ingredients.length === 0) {
        feedback.info('請先建立食材', { description: '建立食材並完成採買後，才能記錄餐點用量。' })
        clearEditorQuery()
        return
      }
      setEditingMeal(null)
      setForm(createMealFormState(null, snapshot.mealIngredients, snapshot.ingredients))
      setFormErrors({})
      setItemErrors({})
      setSubmitError(null)
      setFormOpen(true)
      return
    }

    const meal = snapshot.meals.find((item) => item.id === requestedEditId)
    if (!meal) {
      feedback.error('找不到指定的餐點', { description: '餐點可能已被刪除，請重新選擇。' })
      clearEditorQuery()
      return
    }

    setEditingMeal(meal)
    setForm(createMealFormState(meal, snapshot.mealIngredients, snapshot.ingredients))
    setFormErrors({})
    setItemErrors({})
    setSubmitError(null)
    setFormOpen(true)
  }, [
    clearEditorQuery,
    feedback,
    requestedEditId,
    requestedEditorKey,
    requestedNew,
    snapshot,
  ])

  const ingredients = useMemo(
    () => sortedIngredients(snapshot?.ingredients ?? []),
    [snapshot?.ingredients],
  )

  const ingredientsById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  )

  const mealOccurredAtIso = useMemo(() => {
    try {
      return dateTimeInputToIso(form.occurredAt)
    } catch {
      return null
    }
  }, [form.occurredAt])

  const availabilityResult = useMemo<{
    values: Map<string, number>
    failed: boolean
  }>(() => {
    if (!snapshot || !mealOccurredAtIso) {
      return { values: new Map<string, number>(), failed: false }
    }
    try {
      return {
        values: calculateMealAvailability(snapshot, {
          id: editingMeal?.id ?? '\uffff',
          occurredAt: mealOccurredAtIso,
          createdAt: editingMeal?.createdAt ?? new Date().toISOString(),
        }),
        failed: false,
      }
    } catch {
      return { values: new Map<string, number>(), failed: true }
    }
  }, [editingMeal, mealOccurredAtIso, snapshot])

  const availableByIngredient = availabilityResult.values

  const itemAvailability = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of form.items) {
      if (item.ingredientId) {
        counts.set(item.ingredientId, (counts.get(item.ingredientId) ?? 0) + 1)
      }
    }

    const statuses = new Map<string, ItemAvailability>()
    for (const item of form.items) {
      const ingredient = ingredientsById.get(item.ingredientId)
      const availableBase = availableByIngredient.get(item.ingredientId) ?? 0
      let requestedBase: number | null = null
      let conversionError: string | undefined

      const quantity = Number(item.quantity)
      if (ingredient && item.quantity.trim() !== '' && Number.isFinite(quantity) && quantity > 0) {
        try {
          requestedBase = convertToBase(quantity, item.unit, ingredient.dimension)
        } catch (caught) {
          conversionError = caught instanceof Error ? caught.message : '單位與食材不相容'
        }
      }

      statuses.set(item.key, {
        availableBase,
        requestedBase,
        shortageBase: requestedBase === null ? 0 : Math.max(0, requestedBase - availableBase),
        duplicate: Boolean(item.ingredientId && (counts.get(item.ingredientId) ?? 0) > 1),
        conversionError,
      })
    }
    return statuses
  }, [availableByIngredient, form.items, ingredientsById])

  const hasImmediateShortage = Boolean(
    mealOccurredAtIso &&
    [...itemAvailability.values()].some((status) => status.shortageBase > QUANTITY_EPSILON),
  )

  const currentMonth = currentMonthInput()
  const mealsThisMonth = useMemo(
    () => (snapshot?.meals ?? []).filter((meal) => monthKey(meal.occurredAt) === currentMonth),
    [currentMonth, snapshot?.meals],
  )
  const monthCostCents = useMemo(
    () => mealsThisMonth.reduce((sum, meal) => sum + (derived?.mealCosts[meal.id] ?? meal.totalCostCents), 0),
    [derived?.mealCosts, mealsThisMonth],
  )
  const averageCostCents = mealsThisMonth.length > 0 ? monthCostCents / mealsThisMonth.length : 0

  const ingredientCountByMeal = useMemo(() => {
    const counts = new Map<string, Set<string>>()
    for (const item of snapshot?.mealIngredients ?? []) {
      const ingredientIds = counts.get(item.mealId) ?? new Set<string>()
      ingredientIds.add(item.ingredientId)
      counts.set(item.mealId, ingredientIds)
    }
    return new Map([...counts].map(([mealId, ingredientIds]) => [mealId, ingredientIds.size]))
  }, [snapshot?.mealIngredients])

  const sortedMeals = useMemo(
    () => [...(snapshot?.meals ?? [])].sort(compareMealsNewestFirst),
    [snapshot?.meals],
  )

  const requestNew = () => {
    if (snapshot && snapshot.ingredients.length === 0) {
      feedback.info('請先建立食材', { description: '完成食材與採買設定後，就能記錄餐點。' })
      navigate('/inventory')
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    next.set('new', '1')
    setSearchParams(next, { state: { pantryflowEditorEntry: true } })
  }

  const requestEdit = (meal: Meal) => {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.set('edit', meal.id)
    setSearchParams(next, { state: { pantryflowEditorEntry: true } })
  }

  const closeForm = () => {
    if (submitting) return
    setFormOpen(false)
    setEditingMeal(null)
    setFormErrors({})
    setItemErrors({})
    setSubmitError(null)
    clearEditorQuery()
  }

  const updateFormField = <Key extends 'occurredAt' | 'mealType' | 'note',>(
    key: Key,
    value: MealFormState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFormErrors((current) => ({ ...current, [key]: undefined }))
    setSubmitError(null)
  }

  const clearItemError = (key: string, field?: keyof MealItemErrors) => {
    setItemErrors((current) => {
      if (!current[key]) return current
      if (!field) {
        const next = { ...current }
        delete next[key]
        return next
      }
      return { ...current, [key]: { ...current[key], [field]: undefined } }
    })
    setFormErrors((current) => ({ ...current, items: undefined }))
    setSubmitError(null)
  }

  const updateItemIngredient = (key: string, ingredientId: string) => {
    const ingredient = ingredientsById.get(ingredientId)
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === key
          ? {
              ...item,
              ingredientId,
              unit: ingredient ? unitsForDimension(ingredient.dimension)[0] : item.unit,
            }
          : item,
      ),
    }))
    clearItemError(key)
  }

  const updateItemQuantity = (key: string, quantity: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === key ? { ...item, quantity } : item)),
    }))
    clearItemError(key, 'quantity')
  }

  const updateItemUnit = (key: string, unit: InputUnit) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === key ? { ...item, unit } : item)),
    }))
    clearItemError(key, 'unit')
  }

  const addItem = () => {
    const usedIds = new Set(form.items.map((item) => item.ingredientId))
    const ingredient = ingredients.find((item) => !usedIds.has(item.id))
    if (!ingredient) return
    setForm((current) => ({ ...current, items: [...current.items, newItemForIngredient(ingredient)] }))
    setFormErrors((current) => ({ ...current, items: undefined }))
  }

  const removeItem = (key: string) => {
    if (form.items.length <= 1) return
    setForm((current) => ({ ...current, items: current.items.filter((item) => item.key !== key) }))
    clearItemError(key)
  }

  const focusFirstError = (
    errors: MealFormErrors,
    rows: Record<string, MealItemErrors>,
  ) => {
    let id: string | undefined
    if (errors.occurredAt) id = 'meal-occurred-at'
    else if (errors.mealType) id = 'meal-type'
    else {
      const row = form.items.find((item) => rows[item.key])
      if (row) {
        const rowError = rows[row.key]
        id = rowError.ingredientId
          ? `meal-${row.key}-ingredient`
          : rowError.quantity
            ? `meal-${row.key}-quantity`
            : `meal-${row.key}-unit`
      }
    }
    if (id) window.requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  const submitMeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!snapshot || submitting) return

    const nextErrors: MealFormErrors = {}
    const nextItemErrors: Record<string, MealItemErrors> = {}
    let occurredAt = ''

    try {
      occurredAt = dateTimeInputToIso(form.occurredAt)
    } catch (caught) {
      nextErrors.occurredAt = caught instanceof Error ? caught.message : '請選擇有效日期與時間'
    }

    if (!mealTypeLabels[form.mealType]) nextErrors.mealType = '請選擇餐別'
    if (form.items.length === 0) nextErrors.items = '一餐至少需要一項食材'
    if (availabilityResult.failed) nextErrors.items = '目前無法計算可用庫存，請重新載入後再試'

    const ingredientCounts = new Map<string, number>()
    for (const item of form.items) {
      if (item.ingredientId) {
        ingredientCounts.set(item.ingredientId, (ingredientCounts.get(item.ingredientId) ?? 0) + 1)
      }
    }

    const normalizedItems: Array<{
      id?: string
      ingredientId: string
      enteredQuantity: number
      enteredUnit: InputUnit
    }> = []

    for (const item of form.items) {
      const errors: MealItemErrors = {}
      const ingredient = ingredientsById.get(item.ingredientId)
      if (!ingredient) {
        errors.ingredientId = '請選擇食材'
      } else if ((ingredientCounts.get(item.ingredientId) ?? 0) > 1) {
        errors.ingredientId = '同一項食材不可重複'
      }

      const quantity = Number(item.quantity)
      if (item.quantity.trim() === '' || !Number.isFinite(quantity) || quantity <= 0) {
        errors.quantity = '數量必須是大於 0 的有效數值'
      }

      if (ingredient && !unitsForDimension(ingredient.dimension).includes(item.unit)) {
        errors.unit = '此單位與食材的計量維度不相容'
      }

      if (occurredAt && ingredient && !errors.quantity && !errors.unit && !availabilityResult.failed) {
        try {
          const quantityBase = convertToBase(quantity, item.unit, ingredient.dimension)
          const availableBase = availableByIngredient.get(ingredient.id) ?? 0
          if (quantityBase - availableBase > QUANTITY_EPSILON) {
            errors.quantity = `庫存不足，還缺 ${formatBaseQuantity(
              quantityBase - availableBase,
              ingredient.dimension,
            )}`
          }
        } catch {
          errors.unit = '此單位與食材的計量維度不相容'
        }
      }

      if (Object.keys(errors).length > 0) nextItemErrors[item.key] = errors
      normalizedItems.push({
        id: item.id,
        ingredientId: item.ingredientId,
        enteredQuantity: quantity,
        enteredUnit: item.unit,
      })
    }

    if (Object.keys(nextErrors).length > 0 || Object.keys(nextItemErrors).length > 0) {
      setFormErrors(nextErrors)
      setItemErrors(nextItemErrors)
      focusFirstError(nextErrors, nextItemErrors)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await mutate(() =>
        saveMeal({
          id: editingMeal?.id,
          occurredAt,
          mealType: form.mealType,
          note: form.note.trim() || undefined,
          items: normalizedItems,
        }),
      )
      feedback.success(editingMeal ? '餐點已更新' : '餐點已新增', {
        description: '食材成本已依 FIFO 庫存重新計算。',
      })
      setFormOpen(false)
      setEditingMeal(null)
      clearEditorQuery()
    } catch (caught) {
      const message = describeError(caught)
      setSubmitError(message)
      feedback.error(editingMeal ? '無法更新餐點' : '無法新增餐點', { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  const requestDelete = () => {
    if (!editingMeal || submitting) return
    const target = editingMeal
    setFormOpen(false)
    setEditingMeal(null)
    setFormErrors({})
    setItemErrors({})
    setSubmitError(null)
    clearEditorQuery()
    setDeleteTarget(target)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await mutate(() => deleteMeal(deleteTarget.id))
      feedback.success('餐點已刪除', { description: '後續庫存與餐費已重新計算。' })
      setDeleteTarget(null)
    } catch (caught) {
      feedback.error('無法刪除餐點', { description: describeError(caught) })
    } finally {
      setDeleting(false)
    }
  }

  const formBusy = submitting || pending
  const canAddItem = form.items.length < ingredients.length
  const header = (
    <PageHeader
      eyebrow="MEALS"
      title="餐點"
      description="記錄實際使用量，系統會依 FIFO 扣除庫存並計算真實食材成本。"
      action="記錄餐點"
      actionIcon={ForkKnife}
      onAction={requestNew}
    />
  )

  if (loading) return <LoadingScreen />

  if (!snapshot || !derived) {
    return (
      <div className="page-shell min-w-0">
        {header}
        <div className="mt-7">
          <InlineAlert>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{error ? describeError(error) : '本機資料尚未準備完成，請重新載入。'}</p>
              <button type="button" className="secondary-button shrink-0" onClick={() => void refresh()}>
                重新載入
              </button>
            </div>
          </InlineAlert>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell min-w-0">
      {header}

      {error && (
        <div className="mt-5">
          <InlineAlert>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{describeError(error)}</p>
              <button type="button" className="secondary-button shrink-0" onClick={() => void refresh()}>
                重試
              </button>
            </div>
          </InlineAlert>
        </div>
      )}

      <section className="mt-7 grid min-w-0 grid-cols-3 gap-3" aria-label={`${formatMonthLabel(currentMonth)}餐費摘要`}>
        <MealMetric label="本月餐數" value={`${mealsThisMonth.length.toLocaleString('zh-TW')} 餐`} tone="green" />
        <MealMetric label="本月餐費" value={formatMoney(monthCostCents)} tone="dark" />
        <MealMetric label="平均每餐" value={formatMoney(averageCostCents)} tone="amber" />
      </section>

      <section className="card mt-4 min-w-0 overflow-hidden">
        <div className="border-b border-oat-100 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-bold">全部餐點</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">各餐成本來自實際 FIFO 扣料結果</p>
            </div>
            <span className="text-xs font-semibold text-stone-500">共 {sortedMeals.length} 筆</span>
          </div>
        </div>

        {ingredients.length === 0 ? (
          <EmptyState
            icon={ForkKnife}
            title="先建立食材與庫存"
            description="餐點需要選擇食材與實際用量；請先建立食材並登錄採買。"
            action="前往食材庫存"
            onAction={() => navigate('/inventory')}
          />
        ) : sortedMeals.length === 0 ? (
          <EmptyState
            icon={ForkKnife}
            title="還沒有餐點記錄"
            description="記錄每餐使用的食材，系統會依 FIFO 自動扣料與計算成本。"
            action="記錄第一餐"
            onAction={requestNew}
          />
        ) : (
          <div className="divide-y divide-oat-100">
            {sortedMeals.map((meal) => (
              <MealRow
                key={meal.id}
                meal={meal}
                ingredientCount={ingredientCountByMeal.get(meal.id) ?? 0}
                costCents={derived.mealCosts[meal.id] ?? meal.totalCostCents}
                onClick={() => requestEdit(meal)}
              />
            ))}
          </div>
        )}
      </section>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editingMeal ? '編輯餐點' : '記錄餐點'}
        description="輸入每項食材的實際用量；儲存時會再次執行完整 FIFO 檢查。"
        size="lg"
        dismissible={!formBusy}
        footer={
          <>
            {editingMeal && (
              <button type="button" className="danger-button sm:mr-auto" onClick={requestDelete} disabled={formBusy}>
                <Trash size={17} aria-hidden="true" />
                刪除
              </button>
            )}
            <button type="button" className="secondary-button" onClick={closeForm} disabled={formBusy}>
              取消
            </button>
            <button
              type="submit"
              form={MEAL_FORM_ID}
              className="primary-button"
              disabled={formBusy || form.items.length === 0 || hasImmediateShortage || availabilityResult.failed}
              aria-busy={submitting || undefined}
            >
              {submitting ? '儲存中…' : editingMeal ? '儲存變更' : '儲存餐點'}
            </button>
          </>
        }
      >
        <form
          id={MEAL_FORM_ID}
          className="space-y-6"
          onSubmit={(event) => void submitMeal(event)}
          noValidate
          aria-busy={formBusy}
        >
          {submitError && <InlineAlert>{submitError}</InlineAlert>}
          {availabilityResult.failed && (
            <InlineAlert>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>目前無法計算可用庫存，請重新載入後再試。</span>
                <button type="button" className="text-button" onClick={() => void refresh()}>
                  重新載入
                </button>
              </div>
            </InlineAlert>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="日期與時間" htmlFor="meal-occurred-at" required error={formErrors.occurredAt}>
              <input
                id="meal-occurred-at"
                data-autofocus
                type="datetime-local"
                value={form.occurredAt}
                onChange={(event) => updateFormField('occurredAt', event.target.value)}
                className={inputClass}
                required
                disabled={formBusy}
                aria-invalid={Boolean(formErrors.occurredAt)}
                aria-describedby={formErrors.occurredAt ? 'meal-occurred-at-error' : undefined}
              />
            </Field>
            <Field label="餐別" htmlFor="meal-type" required error={formErrors.mealType}>
              <select
                id="meal-type"
                value={form.mealType}
                onChange={(event) => updateFormField('mealType', event.target.value as MealType)}
                className={selectClass}
                required
                disabled={formBusy}
                aria-invalid={Boolean(formErrors.mealType)}
                aria-describedby={formErrors.mealType ? 'meal-type-error' : undefined}
              >
                {Object.entries(mealTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="備註" htmlFor="meal-note">
            <textarea
              id="meal-note"
              value={form.note}
              onChange={(event) => updateFormField('note', event.target.value)}
              placeholder="選填，例如菜色或用餐情境"
              className={textareaClass}
              disabled={formBusy}
            />
          </Field>

          <fieldset>
            <legend className="sr-only">使用食材</legend>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-ink">使用食材</h3>
                <p className="mt-1 text-xs leading-5 text-stone-500">同一食材只能出現一次，數量會先換算成基準單位檢查。</p>
              </div>
              <button type="button" className="secondary-button" onClick={addItem} disabled={formBusy || !canAddItem}>
                <Plus size={17} weight="bold" aria-hidden="true" />
                新增食材列
              </button>
            </div>

            {formErrors.items && <div className="mt-3"><InlineAlert>{formErrors.items}</InlineAlert></div>}

            <div className="mt-4 space-y-3">
              {form.items.map((item, index) => {
                const ingredient = ingredientsById.get(item.ingredientId)
                const status = itemAvailability.get(item.key) ?? {
                  availableBase: 0,
                  requestedBase: null,
                  shortageBase: 0,
                  duplicate: false,
                }
                const errors = itemErrors[item.key] ?? {}
                const ingredientError = errors.ingredientId ?? (status.duplicate ? '同一項食材不可重複' : undefined)
                const quantityError = errors.quantity ?? (
                  mealOccurredAtIso && status.shortageBase > QUANTITY_EPSILON && ingredient
                    ? `庫存不足，還缺 ${formatBaseQuantity(status.shortageBase, ingredient.dimension)}`
                    : undefined
                )
                const unitError = errors.unit ?? status.conversionError
                const availabilityId = `meal-${item.key}-availability`

                return (
                  <div key={item.key} className="rounded-2xl border border-oat-200 bg-[#fbfaf6] p-4 dark:border-[#34463e] dark:bg-[#121b17]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <strong className="text-sm">食材 {index + 1}</strong>
                      <button
                        type="button"
                        className="icon-button-sm"
                        onClick={() => removeItem(item.key)}
                        disabled={formBusy || form.items.length <= 1}
                        aria-label={`移除食材 ${index + 1}`}
                      >
                        <MinusCircle size={20} aria-hidden="true" />
                      </button>
                    </div>

                    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(0,.7fr)]">
                      <Field label="食材" htmlFor={`meal-${item.key}-ingredient`} required error={ingredientError}>
                        <select
                          id={`meal-${item.key}-ingredient`}
                          value={item.ingredientId}
                          onChange={(event) => updateItemIngredient(item.key, event.target.value)}
                          className={selectClass}
                          required
                          disabled={formBusy}
                          aria-invalid={Boolean(ingredientError)}
                          aria-describedby={ingredientError ? `meal-${item.key}-ingredient-error` : undefined}
                        >
                          <option value="">選擇食材</option>
                          {ingredients.map((option) => {
                            const selectedElsewhere = form.items.some(
                              (candidate) => candidate.key !== item.key && candidate.ingredientId === option.id,
                            )
                            return (
                              <option key={option.id} value={option.id} disabled={selectedElsewhere}>
                                {option.name}
                              </option>
                            )
                          })}
                        </select>
                      </Field>

                      <Field label="數量" htmlFor={`meal-${item.key}-quantity`} required error={quantityError}>
                        <input
                          id={`meal-${item.key}-quantity`}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={item.quantity}
                          onChange={(event) => updateItemQuantity(item.key, event.target.value)}
                          className={inputClass}
                          placeholder="0"
                          required
                          disabled={formBusy}
                          aria-invalid={Boolean(quantityError)}
                          aria-describedby={[
                            quantityError ? `meal-${item.key}-quantity-error` : null,
                            availabilityId,
                          ].filter(Boolean).join(' ')}
                        />
                      </Field>

                      <Field label="單位" htmlFor={`meal-${item.key}-unit`} required error={unitError}>
                        <select
                          id={`meal-${item.key}-unit`}
                          value={item.unit}
                          onChange={(event) => updateItemUnit(item.key, event.target.value as InputUnit)}
                          className={selectClass}
                          required
                          disabled={formBusy || !ingredient}
                          aria-invalid={Boolean(unitError)}
                          aria-describedby={unitError ? `meal-${item.key}-unit-error` : undefined}
                        >
                          {(ingredient ? unitsForDimension(ingredient.dimension) : []).map((unit) => (
                            <option key={unit} value={unit}>{inputUnitLabels[unit]}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <p id={availabilityId} className="mt-3 text-xs leading-5 text-stone-500" aria-live="polite">
                      可用庫存：{ingredient
                        ? mealOccurredAtIso
                          ? availabilityResult.failed
                            ? '目前無法計算'
                            : formatBaseQuantity(status.availableBase, ingredient.dimension)
                          : '請先選擇有效日期與時間'
                        : '請先選擇食材'}
                      {status.requestedBase !== null && ingredient && status.shortageBase <= QUANTITY_EPSILON
                        ? ` · 本列使用 ${formatBaseQuantity(status.requestedBase, ingredient.dimension)}`
                        : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          </fieldset>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) setDeleteTarget(null)
        }}
        onConfirm={() => void confirmDelete()}
        title="刪除這筆餐點？"
        description="刪除後會歸還食材庫存並重新計算後續 FIFO 與餐費，且無法復原。"
        confirmLabel={deleting ? '刪除中…' : '刪除餐點'}
        tone="danger"
        pending={deleting}
      >
        {deleteTarget && (
          <div className="rounded-2xl bg-oat-100 p-4 text-sm dark:bg-[#243129]">
            <strong className="block truncate">{deleteTarget.note || mealTypeLabels[deleteTarget.mealType]}</strong>
            <span className="mt-1 block text-stone-600">
              {formatDateTime(deleteTarget.occurredAt)} · {formatMoney(derived.mealCosts[deleteTarget.id] ?? deleteTarget.totalCostCents)}
            </span>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}

function MealMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'green' | 'dark' | 'amber'
}) {
  const toneClasses = {
    green: 'bg-forest-50 text-forest-800',
    dark: 'bg-forest-700 text-white',
    amber: 'bg-amber-50 text-amber-700',
  }

  return (
    <article className={`min-w-0 rounded-2xl p-3 sm:p-5 ${toneClasses[tone]}`}>
      <span className="text-xs font-medium opacity-75">{label}</span>
      <strong className="mt-2 block break-words font-mono text-xs tabular-nums sm:text-lg">{value}</strong>
    </article>
  )
}

function MealRow({
  meal,
  ingredientCount,
  costCents,
  onClick,
}: {
  meal: Meal
  ingredientCount: number
  costCents: number
  onClick: () => void
}) {
  const title = meal.note || mealTypeLabels[meal.mealType]

  return (
    <button
      type="button"
      className="flex min-w-0 w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-forest-50/50 focus-visible:bg-forest-50 sm:items-center sm:px-5"
      onClick={onClick}
      aria-label={`編輯餐點：${title}，食材成本 ${formatMoney(costCents)}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-oat-100 text-forest-700">
        <ForkKnife size={21} weight="duotone" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <strong className="min-w-0 truncate text-sm">{title}</strong>
          <span className="shrink-0 text-left sm:text-right">
            <strong className="block break-words font-mono text-sm tabular-nums">{formatMoney(costCents)}</strong>
            <small className="text-[10px] text-stone-500">食材成本</small>
          </span>
        </span>
        <span className="mt-1 block text-xs leading-5 text-stone-500">
          {mealTypeLabels[meal.mealType]} · {formatDateTime(meal.occurredAt)} · {ingredientCount} 種食材
        </span>
      </span>
      <CaretRight size={17} className="mt-3 shrink-0 text-stone-400" aria-hidden="true" />
    </button>
  )
}
