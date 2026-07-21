import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import {
  CaretRight,
  Plus,
  ShoppingBagOpen,
  Storefront,
  Trash,
} from '@phosphor-icons/react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ConfirmDialog, Modal } from '../components/Dialog'
import {
  EmptyState,
  Field,
  InlineAlert,
  LoadingScreen,
  PageHeader,
  SectionHeader,
  inputClass,
  selectClass,
  textareaClass,
} from '../components/Common'
import { useFeedback } from '../components/Feedback'
import {
  dimensionForInputUnit,
  normalizeIngredientName,
  sumPurchaseItemSubtotals,
  unitsForDimension,
} from '../domain/core'
import type { Ingredient, InputUnit, Purchase } from '../domain/types'
import {
  deletePurchase,
  savePurchase,
} from '../data/repository'
import { usePantryData } from '../data/store'
import {
  currentMonthInput,
  dateInputToIso,
  formatDate,
  formatMoney,
  moneyInputValue,
  nowDateInput,
  parseMoneyToCents,
  toDateInput,
} from '../lib/format'
import {
  dimensionLabels,
  inputUnitLabels,
} from '../lib/options'

interface ItemDraft {
  key: string
  id: string
  ingredientId: string
  ingredientName: string
  quantity: string
  unit: InputUnit
  subtotal: string
  expiresOn: string
}

interface PurchaseDraft {
  store: string
  occurredOn: string
  note: string
  items: ItemDraft[]
}

const ALL_INPUT_UNITS: readonly InputUnit[] = ['g', 'kg', 'ml', 'L', 'each', 'pack']

const newItem = (): ItemDraft => {
  const id = crypto.randomUUID()
  return {
    key: id,
    id,
    ingredientId: '',
    ingredientName: '',
    quantity: '',
    unit: 'g',
    subtotal: '',
    expiresOn: '',
  }
}

export default function PurchasesPage() {
  const { snapshot, loading, error, mutate, refresh, describeError } = usePantryData()
  const feedback = useFeedback()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!snapshot) return
    if (searchParams.get('new') === '1') {
      setEditingId('new')
      return
    }
    const editId = searchParams.get('edit')
    if (!editId) {
      setEditingId(null)
      return
    }
    if (snapshot.purchases.some((purchase) => purchase.id === editId)) {
      setEditingId(editId)
      return
    }

    setEditingId(null)
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    setSearchParams(next, { replace: true })
    feedback.error('找不到指定的採買單', { description: '採買單可能已被刪除，請重新選擇。' })
  }, [feedback, searchParams, setSearchParams, snapshot])

  const requestNew = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    next.set('new', '1')
    setSearchParams(next, { state: { pantryflowEditorEntry: true } })
  }

  const requestEdit = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.set('edit', id)
    setSearchParams(next, { state: { pantryflowEditorEntry: true } })
  }

  const closeEditor = () => {
    setEditingId(null)
    if ((location.state as { pantryflowEditorEntry?: boolean } | null)?.pantryflowEditorEntry) {
      navigate(-1)
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.delete('edit')
    setSearchParams(next, { replace: true })
  }

  if (loading) return <LoadingScreen />
  if (!snapshot) return <div className="page-shell"><InlineAlert>{describeError(error)}</InlineAlert><button type="button" className="secondary-button mt-4" onClick={() => void refresh()}>重新載入</button></div>

  const purchases = [...snapshot.purchases].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const month = currentMonthInput()
  const monthPurchases = purchases.filter((purchase) => toDateInput(purchase.occurredAt).startsWith(month))
  const monthTotal = monthPurchases.reduce((sum, purchase) => sum + purchase.paidTotalCents, 0)
  const editing = editingId && editingId !== 'new'
    ? snapshot.purchases.find((purchase) => purchase.id === editingId)
    : undefined

  const requestDelete = (purchase: Purchase) => {
    closeEditor()
    setDeleteTarget(purchase)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await mutate(() => deletePurchase(deleteTarget.id))
      feedback.success('採買單已刪除', { description: '連結的食材支出與庫存批次已同步移除。' })
      setDeleteTarget(null)
    } catch (caught) {
      feedback.error('無法刪除採買單', { description: describeError(caught) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="PURCHASES"
        title="食材採買"
        description="一張採買單同時建立食材支出與獨立庫存批次，實付總額會由所有品項小計自動加總。"
        action="新增採買"
        actionIcon={ShoppingBagOpen}
        onAction={requestNew}
      />

      {error && <div className="mt-5"><InlineAlert><div className="flex flex-wrap items-center justify-between gap-2"><span>{describeError(error)}</span><button type="button" className="text-button" onClick={() => void refresh()}>重新載入</button></div></InlineAlert></div>}

      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card overflow-hidden">
          <div className="border-b border-oat-100 p-5">
            <SectionHeader title="採買紀錄" subtitle={`共 ${purchases.length} 張採買單`} />
          </div>
          {purchases.length === 0 ? (
            <EmptyState icon={ShoppingBagOpen} title="還沒有採買紀錄" description="新增第一張採買單後，食材支出與庫存批次會在同一次儲存中建立。" action="新增採買" onAction={requestNew} />
          ) : (
            <div className="divide-y divide-oat-100">
              {purchases.map((purchase) => {
                const itemCount = snapshot.purchaseItems.filter((item) => item.purchaseId === purchase.id).length
                return (
                  <button key={purchase.id} type="button" onClick={() => requestEdit(purchase.id)} className="flex min-h-[84px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-forest-50/50 sm:px-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700"><Storefront size={22} weight="duotone" /></span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{purchase.store}</strong><span className="mt-1 block text-xs text-stone-500">{formatDate(purchase.occurredAt)} · {itemCount} 項食材</span></span>
                    <strong className="shrink-0 font-mono text-sm tabular-nums">{formatMoney(purchase.paidTotalCents)}</strong>
                    <CaretRight size={17} className="shrink-0 text-stone-400" />
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="h-fit rounded-3xl bg-forest-700 p-6 text-white shadow-card">
          <ShoppingBagOpen size={30} weight="duotone" className="text-forest-100" />
          <h2 className="mt-5 text-lg font-bold">本月食材採買</h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{formatMoney(monthTotal)}</p>
          <div className="mt-6 border-t border-white/10 pt-5 text-sm text-forest-100">
            <div className="flex justify-between"><span>採買次數</span><strong className="text-white">{monthPurchases.length} 次</strong></div>
            <div className="mt-3 flex justify-between"><span>平均每次</span><strong className="text-white">{formatMoney(monthPurchases.length ? Math.round(monthTotal / monthPurchases.length) : 0)}</strong></div>
          </div>
        </aside>
      </div>

      <PurchaseEditor
        key={editingId ?? 'closed'}
        open={editingId !== null}
        purchase={editing}
        ingredients={[...snapshot.ingredients].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))}
        purchaseItems={editing ? snapshot.purchaseItems.filter((item) => item.purchaseId === editing.id) : []}
        onClose={closeEditor}
        onDelete={editing ? () => requestDelete(editing) : undefined}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title="刪除這張採買單？"
        description="連結的食材支出與所有批次會一起刪除，系統會先重算後續餐點與庫存。若因此造成缺貨，操作不會生效。"
        confirmLabel={deleting ? '刪除中…' : '刪除採買單'}
        tone="danger"
        pending={deleting}
      />
    </div>
  )
}

function PurchaseEditor({
  open,
  purchase,
  purchaseItems,
  ingredients,
  onClose,
  onDelete,
}: {
  open: boolean
  purchase?: Purchase
  purchaseItems: readonly import('../domain/types').PurchaseItem[]
  ingredients: Ingredient[]
  onClose: () => void
  onDelete?: () => void
}) {
  const { mutate, describeError } = usePantryData()
  const feedback = useFeedback()
  const formId = useId()
  const [draft, setDraft] = useState<PurchaseDraft>(() => ({
    store: purchase?.store ?? '',
    occurredOn: purchase ? toDateInput(purchase.occurredAt) : nowDateInput(),
    note: purchase?.note ?? '',
    items: purchaseItems.length
      ? purchaseItems.map((item) => ({
          key: item.id,
          id: item.id,
          ingredientId: item.ingredientId,
          ingredientName: ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.name ?? '',
          quantity: String(item.enteredQuantity),
          unit: item.enteredUnit,
          subtotal: moneyInputValue(item.subtotalCents),
          expiresOn: item.expiresOn ?? '',
        }))
      : [newItem()],
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const paidTotalCents = useMemo(() => {
    try {
      return sumPurchaseItemSubtotals(draft.items.map((item) => ({
        subtotalCents: parseMoneyToCents(item.subtotal.trim() || '0'),
      })))
    } catch {
      return null
    }
  }, [draft.items])

  const paidTotalHint = purchase && paidTotalCents !== null && purchase.paidTotalCents !== paidTotalCents
    ? `原紀錄為 ${formatMoney(purchase.paidTotalCents)}；依新規則儲存後會更新為品項小計總和。`
    : '由所有品項小計自動加總，無需另外輸入；如有折扣，請直接填入各品項的折後小計。'

  const clearFieldErrors = (...keys: string[]) => {
    setErrors((current) => {
      const next = { ...current }
      for (const key of keys) delete next[key]
      return next
    })
  }

  const updateDraftField = <Key extends keyof Omit<PurchaseDraft, 'items'>>(
    key: Key,
    value: PurchaseDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
    clearFieldErrors(key, 'form')
  }

  const updateItem = (key: string, update: Partial<ItemDraft>) => {
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.key === key ? { ...item, ...update } : item) }))
    const errorKeys = ['items', 'form']
    if ('ingredientId' in update || 'ingredientName' in update) errorKeys.push(`item-${key}-ingredient`)
    if ('quantity' in update) errorKeys.push(`item-${key}-quantity`)
    if ('unit' in update) errorKeys.push(...draft.items.map((item) => `item-${item.key}-unit`))
    if ('subtotal' in update) errorKeys.push(`item-${key}-subtotal`)
    if ('expiresOn' in update) errorKeys.push(`item-${key}-expiry`)
    clearFieldErrors(...errorKeys)
  }

  const updateIngredientName = (key: string, ingredientName: string) => {
    const normalizedName = normalizeIngredientName(ingredientName)
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => {
        if (item.key !== key) return item
        const hintedIngredient = ingredients.find((ingredient) => (
          ingredient.id === item.ingredientId
          && normalizeIngredientName(ingredient.name) === normalizedName
        ))
        const matches = ingredients.filter((ingredient) => normalizeIngredientName(ingredient.name) === normalizedName)
        const ingredient = hintedIngredient ?? (matches.length === 1 ? matches[0] : undefined)
        const compatibleUnits = ingredient ? unitsForDimension(ingredient.dimension) : ALL_INPUT_UNITS
        return {
          ...item,
          ingredientId: ingredient?.id ?? '',
          ingredientName,
          unit: compatibleUnits.includes(item.unit) ? item.unit : compatibleUnits[0],
        }
      }),
    }))
    clearFieldErrors(`item-${key}-ingredient`, 'items', 'form')
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (!draft.store.trim()) next.store = '請輸入商店名稱'
    try { dateInputToIso(draft.occurredOn) } catch (caught) { next.occurredOn = caught instanceof Error ? caught.message : '日期無效' }
    if (draft.items.length === 0) next.items = '至少需要一個品項'
    let positiveSubtotal = false
    const parsedSubtotals: { subtotalCents: number }[] = []
    const dimensionsByName = new Map<string, ReturnType<typeof dimensionForInputUnit>>()
    draft.items.forEach((item, index) => {
      if (!item.ingredientName.trim()) next[`item-${item.key}-ingredient`] = '請輸入食材名稱'
      const normalizedName = normalizeIngredientName(item.ingredientName)
      if (normalizedName) {
        const hintedIngredient = ingredients.find((ingredient) => (
          ingredient.id === item.ingredientId
          && normalizeIngredientName(ingredient.name) === normalizedName
        ))
        const matchingIngredients = ingredients.filter((ingredient) => normalizeIngredientName(ingredient.name) === normalizedName)
        const matchedIngredient = hintedIngredient ?? (matchingIngredients.length === 1 ? matchingIngredients[0] : undefined)
        const dimension = matchedIngredient?.dimension ?? dimensionForInputUnit(item.unit)
        const previousDimension = dimensionsByName.get(normalizedName)
        if (previousDimension && previousDimension !== dimension) {
          next[`item-${item.key}-unit`] = '同名食材必須使用相同的計量維度'
        } else {
          dimensionsByName.set(normalizedName, dimension)
        }
      }
      const quantity = Number(item.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) next[`item-${item.key}-quantity`] = '數量必須大於 0'
      try {
        const subtotal = parseMoneyToCents(item.subtotal)
        parsedSubtotals.push({ subtotalCents: subtotal })
        if (subtotal > 0) positiveSubtotal = true
      } catch (caught) {
        next[`item-${item.key}-subtotal`] = caught instanceof Error ? caught.message : '小計無效'
      }
      if (item.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(item.expiresOn)) next[`item-${item.key}-expiry`] = '效期格式無效'
      if (!item.key) next[`item-${index}`] = '品項無效'
    })
    if (!positiveSubtotal) next.items = '至少一個品項小計必須大於 0'
    if (parsedSubtotals.length === draft.items.length) {
      try {
        sumPurchaseItemSubtotals(parsedSubtotals)
      } catch (caught) {
        next.items = caught instanceof Error ? '品項小計合計過大，請輸入較小的金額' : '品項小計合計無效'
      }
    }
    setErrors(next)
    const firstError = Object.keys(next).find((key) => key !== 'form')
    if (firstError) {
      const staticIds: Record<string, string> = {
        store: `${formId}-store`,
        occurredOn: `${formId}-date`,
      }
      const targetId = staticIds[firstError] ?? (
        firstError === 'items'
          ? draft.items[0] && `${formId}-${draft.items[0].key}-subtotal`
          : firstError.startsWith('item-')
            ? `${formId}-${firstError.slice(5)}`
            : undefined
      )
      if (targetId) window.requestAnimationFrame(() => document.getElementById(targetId)?.focus())
    }
    return Object.keys(next).length === 0
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      await mutate(() => savePurchase({
        id: purchase?.id,
        store: draft.store,
        occurredAt: dateInputToIso(draft.occurredOn),
        note: draft.note,
        items: draft.items.map((item) => ({
          id: item.id,
          ingredientName: item.ingredientName,
          ingredientIdHint: item.ingredientId || undefined,
          enteredQuantity: Number(item.quantity),
          enteredUnit: item.unit,
          subtotalCents: parseMoneyToCents(item.subtotal),
          expiresOn: item.expiresOn || undefined,
        })),
      }))
      feedback.success(purchase ? '採買單已更新' : '採買單已新增', { description: '食材支出、庫存批次與 FIFO 成本已同步重算。' })
      onClose()
    } catch (caught) {
      setErrors({ form: describeError(caught) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={purchase ? '編輯採買單' : '新增採買單'}
      description="每個品項會建立獨立庫存批次；實付總額會由品項小計即時加總。"
      size="xl"
      closeOnBackdrop={!saving}
      dismissible={!saving}
      footer={
        <>
          {onDelete && <button type="button" className="danger-button sm:mr-auto" onClick={onDelete} disabled={saving}><Trash size={17} />刪除</button>}
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>取消</button>
          <button type="submit" form={formId} className="primary-button" disabled={saving}>{saving ? '儲存中…' : '儲存採買單'}</button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-6" noValidate aria-busy={saving}>
        {errors.form && <InlineAlert>{errors.form}</InlineAlert>}
        <fieldset disabled={saving} className="contents">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="商店" htmlFor={`${formId}-store`} required error={errors.store}>
            <input id={`${formId}-store`} className={inputClass} value={draft.store} onChange={(event) => updateDraftField('store', event.target.value)} autoComplete="organization" required aria-invalid={Boolean(errors.store)} aria-describedby={errors.store ? `${formId}-store-error` : undefined} data-autofocus />
          </Field>
          <Field label="採買日期" htmlFor={`${formId}-date`} required error={errors.occurredOn}>
            <input id={`${formId}-date`} type="date" className={inputClass} value={draft.occurredOn} onChange={(event) => updateDraftField('occurredOn', event.target.value)} required aria-invalid={Boolean(errors.occurredOn)} aria-describedby={errors.occurredOn ? `${formId}-date-error` : undefined} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="實付總額（自動加總）" htmlFor={`${formId}-total`} hint={paidTotalHint}>
              <output
                id={`${formId}-total`}
                aria-live="polite"
                aria-atomic="true"
                aria-describedby={`${formId}-total-hint`}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3.5 shadow-sm ${paidTotalCents === null ? 'border-red-200 bg-red-50 text-tomato-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200' : 'border-forest-100 bg-forest-50 text-forest-800 dark:border-[#315b4b] dark:bg-[#1a382d] dark:text-[#b9e5d2]'}`}
              >
                <span className="text-xs font-semibold">品項小計合計</span>
                <strong className="font-mono text-lg tabular-nums">{paidTotalCents === null ? '請修正品項小計' : formatMoney(paidTotalCents)}</strong>
              </output>
            </Field>
          </div>
        </div>

        <fieldset aria-describedby={errors.items ? `${formId}-items-error` : undefined}>
          <legend className="sr-only">採買品項</legend>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold">採買品項 <span className="text-tomato-700" aria-hidden="true">*</span><span className="sr-only">（必填）</span></h3>
            <button type="button" className="secondary-button" onClick={() => { setDraft((current) => ({ ...current, items: [...current.items, newItem()] })); clearFieldErrors('items', 'form') }}><Plus size={17} />新增品項</button>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-500">直接輸入食材名稱；若名稱不存在，會在儲存採買單時自動建立。實付總額會隨品項小計即時更新。</p>
          {errors.items && <p id={`${formId}-items-error`} role="alert" className="mt-2 text-xs font-semibold text-tomato-700">{errors.items}</p>}
          <datalist id={`${formId}-ingredient-options`}>
            {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.name} />)}
          </datalist>

          <div className="mt-4 space-y-3">
            {draft.items.map((item, index) => {
              const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId)
              const unitOptions = ingredient ? unitsForDimension(ingredient.dimension) : ALL_INPUT_UNITS
              const ingredientHint = !item.ingredientName.trim()
                ? '輸入名稱，可選用既有食材或建立新食材。'
                : ingredient
                  ? `使用既有食材 · ${dimensionLabels[ingredient.dimension]}`
                  : `新食材 · 儲存時建立為${dimensionLabels[dimensionForInputUnit(item.unit)]}`
              return (
                <div key={item.key} className="rounded-2xl border border-oat-200 p-4 dark:border-[#34463e]">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">品項 {index + 1}</h3><button type="button" className="icon-button-sm" aria-label={`移除品項 ${index + 1}`} onClick={() => { setDraft((current) => ({ ...current, items: current.items.filter((candidate) => candidate.key !== item.key) })); clearFieldErrors('items', 'form', `item-${item.key}-ingredient`, `item-${item.key}-quantity`, `item-${item.key}-unit`, `item-${item.key}-subtotal`, `item-${item.key}-expiry`) }} disabled={draft.items.length === 1}><Trash size={18} /></button></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Field label="食材" htmlFor={`${formId}-${item.key}-ingredient`} required error={errors[`item-${item.key}-ingredient`]} hint={ingredientHint}>
                      <input id={`${formId}-${item.key}-ingredient`} list={`${formId}-ingredient-options`} className={inputClass} value={item.ingredientName} onChange={(event) => updateIngredientName(item.key, event.target.value)} placeholder="例如：白米" autoComplete="off" required aria-invalid={Boolean(errors[`item-${item.key}-ingredient`])} aria-describedby={errors[`item-${item.key}-ingredient`] ? `${formId}-${item.key}-ingredient-error` : `${formId}-${item.key}-ingredient-hint`} />
                    </Field>
                    <Field label="數量" htmlFor={`${formId}-${item.key}-quantity`} required error={errors[`item-${item.key}-quantity`]}>
                      <input id={`${formId}-${item.key}-quantity`} type="number" inputMode="decimal" min="0" step="any" className={inputClass} value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: event.target.value })} required aria-invalid={Boolean(errors[`item-${item.key}-quantity`])} aria-describedby={errors[`item-${item.key}-quantity`] ? `${formId}-${item.key}-quantity-error` : undefined} />
                    </Field>
                    <Field label="單位" htmlFor={`${formId}-${item.key}-unit`} required error={errors[`item-${item.key}-unit`]}>
                      <select id={`${formId}-${item.key}-unit`} className={selectClass} value={item.unit} onChange={(event) => updateItem(item.key, { unit: event.target.value as InputUnit })} required aria-invalid={Boolean(errors[`item-${item.key}-unit`])} aria-describedby={errors[`item-${item.key}-unit`] ? `${formId}-${item.key}-unit-error` : undefined}>{unitOptions.map((unit) => <option key={unit} value={unit}>{inputUnitLabels[unit]}</option>)}</select>
                    </Field>
                    <Field label="品項小計（NT$）" htmlFor={`${formId}-${item.key}-subtotal`} required error={errors[`item-${item.key}-subtotal`]}>
                      <input id={`${formId}-${item.key}-subtotal`} type="number" inputMode="numeric" min="0" step="1" className={inputClass} value={item.subtotal} onChange={(event) => updateItem(item.key, { subtotal: event.target.value })} required aria-invalid={Boolean(errors[`item-${item.key}-subtotal`])} aria-describedby={errors[`item-${item.key}-subtotal`] ? `${formId}-${item.key}-subtotal-error` : undefined} />
                    </Field>
                    <Field label="有效日期" htmlFor={`${formId}-${item.key}-expiry`} error={errors[`item-${item.key}-expiry`]}>
                      <input id={`${formId}-${item.key}-expiry`} type="date" className={inputClass} value={item.expiresOn} onChange={(event) => updateItem(item.key, { expiresOn: event.target.value })} aria-invalid={Boolean(errors[`item-${item.key}-expiry`])} aria-describedby={errors[`item-${item.key}-expiry`] ? `${formId}-${item.key}-expiry-error` : undefined} />
                    </Field>
                  </div>
                </div>
              )
            })}
          </div>
        </fieldset>

        <Field label="採買備註（選填）" htmlFor={`${formId}-long-note`}>
          <textarea id={`${formId}-long-note`} className={textareaClass} value={draft.note} onChange={(event) => updateDraftField('note', event.target.value)} placeholder="例如：折價券、保存方式或採買目的" />
        </Field>
        </fieldset>
      </form>
    </Modal>
  )
}
