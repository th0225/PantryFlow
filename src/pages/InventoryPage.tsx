import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import {
  CaretRight,
  MagnifyingGlass,
  Package,
  SlidersHorizontal,
  Trash,
  Warning,
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
import { calculateAdjustmentAvailability, convertToBase, unitsForDimension } from '../domain/core'
import type {
  DerivedInventoryBatch,
  Ingredient,
  InputUnit,
  InventoryAdjustment,
  InventoryAdjustmentReason,
  PantryFlowSnapshot,
} from '../domain/types'
import {
  deleteAdjustment,
  saveAdjustment,
} from '../data/repository'
import { usePantryData } from '../data/store'
import {
  dateTimeInputToIso,
  expiryDaysFromToday,
  formatBaseQuantity,
  formatDate,
  formatDateTime,
  formatExpiry,
  formatMoney,
  nowDateTimeInput,
  toDateTimeInput,
} from '../lib/format'
import {
  adjustmentReasonLabels,
  inputUnitLabels,
} from '../lib/options'

type StockFilter = 'in-stock' | 'all' | 'expiring' | 'expired'

interface IngredientSummary {
  ingredient: Ingredient
  batches: DerivedInventoryBatch[]
  remainingQuantity: number
  remainingCostCents: number
  status: 'expired' | 'expiring' | 'normal' | 'empty'
}

export default function InventoryPage() {
  const { snapshot, derived, loading, error, refresh, mutate, describeError } = usePantryData()
  const feedback = useFeedback()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StockFilter>('in-stock')
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null)
  const [adjustmentEditor, setAdjustmentEditor] = useState<'new' | InventoryAdjustment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InventoryAdjustment | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!snapshot) return
    const requestedAdjustment = searchParams.get('adjust')
    const ingredientId = searchParams.get('ingredient')

    if (requestedAdjustment === '1') {
      if (snapshot.ingredients.length === 0) {
        setAdjustmentEditor(null)
        const next = new URLSearchParams(searchParams)
        next.delete('adjust')
        setSearchParams(next, { replace: true })
        feedback.info('尚無可調減的食材', { description: '請先建立採買單，並在品項中直接輸入食材名稱。' })
        return
      }
      setAdjustmentEditor('new')
      setSelectedIngredientId(null)
      return
    }
    if (requestedAdjustment) {
      const adjustment = snapshot.adjustments.find((item) => item.id === requestedAdjustment)
      if (adjustment) {
        setAdjustmentEditor(adjustment)
        setSelectedIngredientId(null)
        return
      }
      const next = new URLSearchParams(searchParams)
      next.delete('adjust')
      setSearchParams(next, { replace: true })
      feedback.error('找不到指定的庫存調減', { description: '紀錄可能已被刪除，請重新選擇。' })
    }

    setAdjustmentEditor(null)
    if (ingredientId && snapshot.ingredients.some((item) => item.id === ingredientId)) {
      setSelectedIngredientId(ingredientId)
    } else {
      setSelectedIngredientId(null)
      if (ingredientId) {
        const next = new URLSearchParams(searchParams)
        next.delete('ingredient')
        setSearchParams(next, { replace: true })
        feedback.error('找不到指定的食材', { description: '食材可能已被移除，請重新選擇。' })
      }
    }
  }, [feedback, searchParams, setSearchParams, snapshot])

  const requestAdjustment = (adjustment: 'new' | InventoryAdjustment) => {
    const next = new URLSearchParams(searchParams)
    next.delete('ingredient')
    next.set('adjust', adjustment === 'new' ? '1' : adjustment.id)
    setSearchParams(next, { state: { pantryflowEditorEntry: true } })
  }

  const requestIngredient = (ingredientId: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete('adjust')
    next.set('ingredient', ingredientId)
    setSearchParams(next, { state: { pantryflowEditorEntry: true } })
  }

  const clearActionQuery = () => {
    if ((location.state as { pantryflowEditorEntry?: boolean } | null)?.pantryflowEditorEntry) {
      navigate(-1)
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete('adjust')
    next.delete('ingredient')
    setSearchParams(next, { replace: true })
  }

  const summaries = useMemo<IngredientSummary[]>(() => {
    if (!snapshot || !derived) return []
    return snapshot.ingredients.map((ingredient) => {
      const batches = derived.batches
        .filter((batch) => batch.ingredientId === ingredient.id)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      const activeBatches = batches.filter((batch) => batch.remainingQuantityBase > 0)
      const days = activeBatches.map((batch) => expiryDaysFromToday(batch.expiresOn)).filter((value): value is number => value !== null)
      const status: IngredientSummary['status'] = activeBatches.length === 0
        ? 'empty'
        : days.some((value) => value < 0)
          ? 'expired'
          : days.some((value) => value <= 7)
            ? 'expiring'
            : 'normal'
      return {
        ingredient,
        batches,
        remainingQuantity: activeBatches.reduce((sum, batch) => sum + batch.remainingQuantityBase, 0),
        remainingCostCents: activeBatches.reduce((sum, batch) => sum + batch.remainingCostCents, 0),
        status,
      }
    }).sort((a, b) => {
      const priority = { expired: 0, expiring: 1, normal: 2, empty: 3 }
      return priority[a.status] - priority[b.status] || a.ingredient.name.localeCompare(b.ingredient.name, 'zh-Hant')
    })
  }, [snapshot, derived])

  if (loading) return <LoadingScreen />
  if (!snapshot || !derived) return <div className="page-shell"><InlineAlert>{describeError(error)}</InlineAlert><button type="button" className="secondary-button mt-4" onClick={() => void refresh()}>重新載入</button></div>

  const normalizedQuery = query.trim().toLocaleLowerCase('zh-Hant')
  const filtered = summaries.filter((summary) => {
    if (normalizedQuery && !`${summary.ingredient.name} ${summary.ingredient.note ?? ''}`.toLocaleLowerCase('zh-Hant').includes(normalizedQuery)) return false
    if (filter === 'in-stock') return summary.remainingQuantity > 0
    if (filter === 'expiring') return summary.status === 'expiring'
    if (filter === 'expired') return summary.status === 'expired'
    return true
  })
  const selected = summaries.find((summary) => summary.ingredient.id === selectedIngredientId)
  const activeBatchCount = derived.batches.filter((batch) => batch.remainingQuantityBase > 0).length
  const expiringCount = derived.batches.filter((batch) => batch.remainingQuantityBase > 0 && (expiryDaysFromToday(batch.expiresOn) ?? 99) >= 0 && (expiryDaysFromToday(batch.expiresOn) ?? 99) <= 7).length
  const expiredCount = derived.batches.filter((batch) => batch.remainingQuantityBase > 0 && (expiryDaysFromToday(batch.expiresOn) ?? 0) < 0).length
  const sortedAdjustments = [...snapshot.adjustments].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await mutate(() => deleteAdjustment(deleteTarget.id))
      feedback.success('庫存調減已刪除', { description: '後續 FIFO 庫存與餐費已重新計算。' })
      setDeleteTarget(null)
    } catch (caught) {
      feedback.error('無法刪除調減', { description: describeError(caught) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="INVENTORY"
        title="食材與庫存"
        description="依食材與採買批次查看剩餘數量、效期與成本，所有耗用都遵循 FIFO。"
        action={snapshot.ingredients.length ? '新增調減' : undefined}
        actionIcon={Package}
        onAction={() => requestAdjustment('new')}
      />

      {error && <div className="mt-5"><InlineAlert><div className="flex flex-wrap items-center justify-between gap-2"><span>{describeError(error)}</span><button type="button" className="text-button" onClick={() => void refresh()}>重新載入</button></div></InlineAlert></div>}

      <section className="mt-7 grid grid-cols-3 gap-3" aria-label="庫存批次摘要">
        <InventoryStat value={activeBatchCount} label="有餘量批次" tone="green" />
        <InventoryStat value={expiringCount} label="7 日內到期" tone="amber" />
        <InventoryStat value={expiredCount} label="已過期" tone="red" />
      </section>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="search-field flex-1"><MagnifyingGlass size={18} /><span className="sr-only">搜尋食材</span><input type="search" placeholder="搜尋食材或備註" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="relative w-full sm:w-44">
          <label htmlFor="inventory-stock-filter" className="sr-only">庫存篩選</label>
          <SlidersHorizontal aria-hidden="true" size={17} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-stone-500 dark:text-[#aeb6b1]" />
          <select id="inventory-stock-filter" className={`${selectClass} pl-10 pr-10 font-semibold`} value={filter} onChange={(event) => setFilter(event.target.value as StockFilter)}><option value="in-stock">有庫存</option><option value="expiring">即將到期</option><option value="expired">已過期</option><option value="all">全部食材</option></select>
        </div>
      </div>

      {snapshot.ingredients.length === 0 ? (
        <section className="card mt-4"><EmptyState icon={Package} title="還沒有食材庫存" description="新增採買單並直接輸入食材名稱後，庫存批次會自動出現在這裡。" action="新增採買" onAction={() => navigate('/purchases?new=1')} /></section>
      ) : filtered.length === 0 ? (
        <section className="card mt-4"><EmptyState icon={MagnifyingGlass} title="找不到符合條件的食材" description="試著清除搜尋文字或切換庫存篩選。" /></section>
      ) : (
        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((summary) => {
            const nearest = summary.batches.filter((batch) => batch.remainingQuantityBase > 0 && batch.expiresOn).sort((a, b) => String(a.expiresOn).localeCompare(String(b.expiresOn)))[0]
            return (
              <button key={summary.ingredient.id} type="button" onClick={() => requestIngredient(summary.ingredient.id)} className="card group p-5 text-left transition-colors hover:border-forest-200">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-forest-50 text-forest-700"><Package size={22} weight="duotone" /></span>
                  <StatusBadge status={summary.status} expiresOn={nearest?.expiresOn} />
                </div>
                <div className="mt-4 flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold">{summary.ingredient.name}</h2><p className="mt-1 text-sm text-stone-500">剩餘 <strong className="text-ink">{formatBaseQuantity(summary.remainingQuantity, summary.ingredient.dimension)}</strong></p></div><CaretRight size={17} className="mt-1 shrink-0 text-stone-400" /></div>
                <div className="mt-4 flex items-center justify-between border-t border-oat-100 pt-4"><span className="text-xs text-stone-500">剩餘成本 · {summary.batches.filter((batch) => batch.remainingQuantityBase > 0).length} 批</span><strong className="font-mono text-sm tabular-nums">{formatMoney(summary.remainingCostCents)}</strong></div>
              </button>
            )
          })}
        </section>
      )}

      <section className="card mt-4 overflow-hidden">
        <div className="border-b border-oat-100 p-5"><SectionHeader title="全部庫存調減" subtitle="過期、丟棄、損壞與盤點短少不會計入餐費" action={snapshot.ingredients.length ? '新增調減' : undefined} onAction={() => requestAdjustment('new')} /></div>
        {sortedAdjustments.length === 0 ? (
          <EmptyState icon={Warning} title="沒有調減紀錄" description="有食材過期、損壞或盤點短少時，可在這裡依 FIFO 扣除庫存。" />
        ) : (
          <div className="divide-y divide-oat-100">{sortedAdjustments.map((adjustment) => {
            const ingredient = snapshot.ingredients.find((item) => item.id === adjustment.ingredientId)
            return <button key={adjustment.id} type="button" onClick={() => requestAdjustment(adjustment)} className="flex min-h-[72px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-forest-50/50 sm:px-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><Warning size={19} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{ingredient?.name ?? '未知食材'} · {adjustmentReasonLabels[adjustment.reason]}</strong><span className="mt-1 block text-xs text-stone-500">{formatDateTime(adjustment.occurredAt)}{adjustment.note ? ` · ${adjustment.note}` : ''}</span></span><strong className="shrink-0 text-sm">− {formatBaseQuantity(adjustment.quantityBase, ingredient?.dimension ?? 'count')}</strong><CaretRight size={17} className="shrink-0 text-stone-400" /></button>
          })}</div>
        )}
      </section>

      <BatchDetail summary={selected} purchases={snapshot.purchases} onClose={() => { setSelectedIngredientId(null); clearActionQuery() }} />
      <AdjustmentEditor key={adjustmentEditor === 'new' ? 'new' : adjustmentEditor?.id ?? 'closed'} open={adjustmentEditor !== null} adjustment={adjustmentEditor === 'new' ? undefined : adjustmentEditor ?? undefined} ingredients={snapshot.ingredients} snapshot={snapshot} onClose={() => { setAdjustmentEditor(null); clearActionQuery() }} onDelete={adjustmentEditor && adjustmentEditor !== 'new' ? () => { const target = adjustmentEditor; setAdjustmentEditor(null); clearActionQuery(); setDeleteTarget(target) } : undefined} />
      <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} title="刪除這筆庫存調減？" description="系統會還原扣除量並重新執行所有後續 FIFO 分配；若會造成其他歷史事件缺貨，刪除不會生效。" confirmLabel={deleting ? '刪除中…' : '刪除調減'} tone="danger" pending={deleting} />
    </div>
  )
}

function InventoryStat({ value, label, tone }: { value: number; label: string; tone: 'green' | 'amber' | 'red' }) {
  const styles = { green: 'bg-forest-50 text-forest-800', amber: 'bg-amber-50 text-amber-700', red: 'bg-tomato-50 text-tomato-700' }
  return <div className={`rounded-2xl px-2 py-4 text-center sm:px-3 ${styles[tone]}`}><strong className="block text-2xl tabular-nums">{value}</strong><span className="mt-1 block text-[11px] font-medium sm:text-xs">{label}</span></div>
}

function StatusBadge({ status, expiresOn }: { status: IngredientSummary['status']; expiresOn?: string }) {
  if (status === 'empty') return <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">無庫存</span>
  if (status === 'expired') return <span className="rounded-full bg-tomato-50 px-2.5 py-1 text-xs font-semibold text-tomato-700">{formatExpiry(expiresOn)}</span>
  if (status === 'expiring') return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{formatExpiry(expiresOn)}</span>
  return <span className="rounded-full bg-forest-50 px-2.5 py-1 text-xs font-semibold text-forest-700">庫存正常</span>
}

function BatchDetail({ summary, purchases, onClose }: { summary?: IngredientSummary; purchases: readonly import('../domain/types').Purchase[]; onClose: () => void }) {
  return <Modal open={Boolean(summary)} onClose={onClose} title={summary?.ingredient.name ?? '庫存批次'} description={summary ? `基準單位：${inputUnitLabels[summary.ingredient.baseUnit]}` : undefined} size="lg" footer={<button type="button" className="secondary-button" onClick={onClose}>關閉</button>}>
    {summary && <div className="space-y-3">{summary.batches.length === 0 ? <InlineAlert tone="info">這項食材尚未建立採買批次。</InlineAlert> : summary.batches.map((batch) => {
      const purchase = purchases.find((item) => item.id === batch.purchaseId)
      return <article key={batch.id} className="rounded-2xl border border-oat-200 p-4 dark:border-[#34463e]"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-bold">{purchase?.store ?? '採買批次'}</h3><p className="mt-1 text-xs text-stone-500">購入 {formatDate(batch.occurredAt)} · {formatExpiry(batch.expiresOn)}</p></div>{batch.remainingQuantityBase <= 0 && <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">已耗盡</span>}</div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-xs text-stone-500">原始數量</dt><dd className="mt-1 font-semibold">{formatBaseQuantity(batch.originalQuantityBase, summary.ingredient.dimension)}</dd></div><div><dt className="text-xs text-stone-500">剩餘數量</dt><dd className="mt-1 font-semibold">{formatBaseQuantity(batch.remainingQuantityBase, summary.ingredient.dimension)}</dd></div><div><dt className="text-xs text-stone-500">分攤成本</dt><dd className="mt-1 font-mono font-semibold">{formatMoney(batch.allocatedCostCents)}</dd></div><div><dt className="text-xs text-stone-500">剩餘成本</dt><dd className="mt-1 font-mono font-semibold">{formatMoney(batch.remainingCostCents)}</dd></div></dl></article>
    })}</div>}
  </Modal>
}

function AdjustmentEditor({ open, adjustment, ingredients, snapshot, onClose, onDelete }: { open: boolean; adjustment?: InventoryAdjustment; ingredients: readonly Ingredient[]; snapshot: PantryFlowSnapshot; onClose: () => void; onDelete?: () => void }) {
  const { mutate, describeError } = usePantryData()
  const feedback = useFeedback()
  const formId = useId()
  const initialIngredient = ingredients.find((item) => item.id === adjustment?.ingredientId) ?? ingredients[0]
  const [ingredientId, setIngredientId] = useState(initialIngredient?.id ?? '')
  const [occurredAt, setOccurredAt] = useState(adjustment ? toDateTimeInput(adjustment.occurredAt) : nowDateTimeInput())
  const [quantity, setQuantity] = useState(adjustment ? String(adjustment.quantityBase) : '')
  const [unit, setUnit] = useState<InputUnit>(initialIngredient?.baseUnit ?? 'g')
  const [reason, setReason] = useState<InventoryAdjustmentReason>(adjustment?.reason ?? 'discarded')
  const [note, setNote] = useState(adjustment?.note ?? '')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [saving, setSaving] = useState(false)
  const ingredient = ingredients.find((item) => item.id === ingredientId)
  const adjustmentOccurredAtIso = useMemo(() => {
    try {
      return dateTimeInputToIso(occurredAt)
    } catch {
      return null
    }
  }, [occurredAt])
  const availableByIngredient = useMemo(() => {
    if (!adjustmentOccurredAtIso) return new Map<string, number>()
    try {
      return calculateAdjustmentAvailability(snapshot, {
        id: adjustment?.id ?? '\uffff',
        occurredAt: adjustmentOccurredAtIso,
        createdAt: adjustment?.createdAt ?? new Date().toISOString(),
      })
    } catch {
      return new Map<string, number>()
    }
  }, [adjustment, adjustmentOccurredAtIso, snapshot])
  const available = availableByIngredient.get(ingredientId) ?? 0

  const selectIngredient = (id: string) => {
    const next = ingredients.find((item) => item.id === id)
    setIngredientId(id)
    if (next) setUnit(next.baseUnit)
    setErrors((current) => ({ ...current, ingredient: undefined, quantity: undefined, form: undefined }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!ingredient) next.ingredient = '請選擇食材'
    if (!adjustmentOccurredAtIso) next.occurredAt = '請選擇有效日期與時間'
    const entered = Number(quantity)
    if (!Number.isFinite(entered) || entered <= 0) next.quantity = '數量必須大於 0'
    else if (ingredient && adjustmentOccurredAtIso) {
      try {
        const base = convertToBase(entered, unit, ingredient.dimension)
        if (base > available) next.quantity = `該時間點最多可調減 ${formatBaseQuantity(available, ingredient.dimension)}`
      } catch (caught) { next.quantity = caught instanceof Error ? caught.message : '單位不相容' }
    }
    setErrors(next)
    if (Object.keys(next).length) {
      const firstField = ['ingredient', 'occurredAt', 'quantity'].find((field) => next[field])
      const targetId = firstField === 'ingredient'
        ? `${formId}-ingredient`
        : firstField === 'occurredAt'
          ? `${formId}-time`
          : firstField === 'quantity'
            ? `${formId}-quantity`
            : undefined
      if (targetId) window.requestAnimationFrame(() => document.getElementById(targetId)?.focus())
      return
    }
    setSaving(true)
    try {
      await mutate(() => saveAdjustment({ id: adjustment?.id, ingredientId, occurredAt: adjustmentOccurredAtIso!, enteredQuantity: entered, enteredUnit: unit, reason, note }))
      feedback.success(adjustment ? '庫存調減已更新' : '庫存調減已新增', { description: 'FIFO 批次餘量與剩餘成本已重新計算。' })
      onClose()
    } catch (caught) {
      setErrors({ form: describeError(caught) })
    } finally { setSaving(false) }
  }

  return <Modal open={open} onClose={onClose} title={adjustment ? '編輯庫存調減' : '新增庫存調減'} description="調減會依 FIFO 扣除批次數量與成本，但不會加入餐費。" size="md" closeOnBackdrop={!saving} dismissible={!saving} footer={<>{onDelete && <button type="button" className="danger-button sm:mr-auto" onClick={onDelete} disabled={saving}><Trash size={17} />刪除</button>}<button type="button" className="secondary-button" onClick={onClose} disabled={saving}>取消</button><button type="submit" form={formId} className="primary-button" disabled={saving}>{saving ? '儲存中…' : '儲存調減'}</button></>}>
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate aria-busy={saving}>{errors.form && <InlineAlert>{errors.form}</InlineAlert>}<fieldset disabled={saving} className="contents"><Field label="食材" htmlFor={`${formId}-ingredient`} required error={errors.ingredient}><select id={`${formId}-ingredient`} data-autofocus className={selectClass} value={ingredientId} onChange={(event) => selectIngredient(event.target.value)} required aria-invalid={Boolean(errors.ingredient)} aria-describedby={errors.ingredient ? `${formId}-ingredient-error` : undefined}><option value="">請選擇</option>{ingredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>{ingredient && <InlineAlert tone="info">該時間點可用：{adjustmentOccurredAtIso ? formatBaseQuantity(available, ingredient.dimension) : '請先選擇有效日期與時間'}</InlineAlert>}<div className="grid gap-4 sm:grid-cols-2"><Field label="日期與時間" htmlFor={`${formId}-time`} required error={errors.occurredAt}><input id={`${formId}-time`} type="datetime-local" className={inputClass} value={occurredAt} onChange={(event) => { setOccurredAt(event.target.value); setErrors((current) => ({ ...current, occurredAt: undefined, quantity: undefined, form: undefined })) }} required aria-invalid={Boolean(errors.occurredAt)} aria-describedby={errors.occurredAt ? `${formId}-time-error` : undefined} /></Field><Field label="原因" htmlFor={`${formId}-reason`} required><select id={`${formId}-reason`} className={selectClass} value={reason} onChange={(event) => setReason(event.target.value as InventoryAdjustmentReason)} required>{(Object.keys(adjustmentReasonLabels) as InventoryAdjustmentReason[]).map((value) => <option key={value} value={value}>{adjustmentReasonLabels[value]}</option>)}</select></Field><Field label="數量" htmlFor={`${formId}-quantity`} required error={errors.quantity}><input id={`${formId}-quantity`} type="number" inputMode="decimal" min="0" step="any" className={inputClass} value={quantity} onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined, form: undefined })) }} required aria-invalid={Boolean(errors.quantity)} aria-describedby={errors.quantity ? `${formId}-quantity-error` : undefined} /></Field><Field label="單位" htmlFor={`${formId}-unit`} required><select id={`${formId}-unit`} className={selectClass} value={unit} onChange={(event) => { setUnit(event.target.value as InputUnit); setErrors((current) => ({ ...current, quantity: undefined, form: undefined })) }} required disabled={!ingredient}>{ingredient && unitsForDimension(ingredient.dimension).map((value) => <option key={value} value={value}>{inputUnitLabels[value]}</option>)}</select></Field></div><Field label="備註（選填）" htmlFor={`${formId}-note`}><textarea id={`${formId}-note`} className={textareaClass} value={note} onChange={(event) => setNote(event.target.value)} /></Field></fieldset></form>
  </Modal>
}
