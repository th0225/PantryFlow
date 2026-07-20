import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CaretRight,
  MagnifyingGlass,
  Receipt,
  ShoppingBagOpen,
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
import { deleteTransaction, saveTransaction } from '../data/repository'
import { usePantryData } from '../data/store'
import type { Category, Transaction, TransactionType } from '../domain/types'
import {
  currentMonthInput,
  dateInputToIso,
  formatFullDate,
  formatMoney,
  moneyInputValue,
  monthKey,
  nowDateInput,
  parseMoneyToCents,
  toDateInput,
} from '../lib/format'
import { transactionTypeLabels } from '../lib/options'

const MONTH_STORAGE_KEY = 'pantryflow-ledger-month'
const TRANSACTION_FORM_ID = 'ledger-transaction-form'

type TypeFilter = 'all' | TransactionType
type CategoryFilter = 'all' | string

interface TransactionFormState {
  date: string
  amount: string
  type: TransactionType
  categoryId: string
  note: string
}

type TransactionFormErrors = Partial<Record<keyof TransactionFormState, string>>

function readStoredMonth() {
  try {
    const saved = window.localStorage.getItem(MONTH_STORAGE_KEY)
    if (saved && /^\d{4}-(0[1-9]|1[0-2])$/.test(saved)) return saved
  } catch {
    // The current month remains usable when storage is unavailable.
  }
  return currentMonthInput()
}

function compareTransactionsNewestFirst(left: Transaction, right: Transaction) {
  return (
    right.occurredAt.localeCompare(left.occurredAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  )
}

function activeCategoriesForType(categories: readonly Category[], type: TransactionType) {
  return categories
    .filter((category) => category.type === type && category.isActive)
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant'))
}

function createFormState(transaction: Transaction | null, categories: readonly Category[]): TransactionFormState {
  const type = transaction?.type ?? 'expense'
  const activeCategories = activeCategoriesForType(categories, type)
  const currentCategory = categories.find(
    (category) => category.type === type && category.id === transaction?.categoryId,
  )

  return {
    date: transaction ? toDateInput(transaction.occurredAt) : nowDateInput(),
    amount: transaction ? moneyInputValue(transaction.amountCents) : '',
    type,
    categoryId: currentCategory?.id ?? activeCategories[0]?.id ?? '',
    note: transaction?.note ?? '',
  }
}

function formatSignedMoney(amountCents: number) {
  if (amountCents > 0) return `+ ${formatMoney(amountCents)}`
  if (amountCents < 0) return `− ${formatMoney(Math.abs(amountCents))}`
  return formatMoney(0)
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-')
  return `${Number(year)} 年 ${Number(month)} 月`
}

export default function LedgerPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const feedback = useFeedback()
  const { snapshot, loading, pending, error, refresh, mutate, describeError } = usePantryData()

  const [selectedMonth, setSelectedMonth] = useState(readStoredMonth)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [form, setForm] = useState<TransactionFormState>(() => createFormState(null, []))
  const [formErrors, setFormErrors] = useState<TransactionFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState(false)
  const handledQueryRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(MONTH_STORAGE_KEY, selectedMonth)
    } catch {
      // Month persistence is optional when storage is unavailable.
    }
  }, [selectedMonth])

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
      setEditingTransaction(null)
      setFormErrors({})
      setSubmitError(null)
      return
    }
    if (!snapshot || handledQueryRef.current === requestedEditorKey) return

    handledQueryRef.current = requestedEditorKey

    if (requestedNew) {
      setEditingTransaction(null)
      setForm(createFormState(null, snapshot.categories))
      setFormErrors({})
      setSubmitError(null)
      setFormOpen(true)
      return
    }

    const transaction = snapshot.transactions.find((item) => item.id === requestedEditId)
    if (!transaction) {
      feedback.error('找不到指定的交易', { description: '交易可能已被刪除，請重新選擇。' })
      clearEditorQuery()
      return
    }

    if (transaction.purchaseId) {
      navigate(`/purchases?edit=${encodeURIComponent(transaction.purchaseId)}`, { replace: true })
      return
    }

    setEditingTransaction(transaction)
    setForm(createFormState(transaction, snapshot.categories))
    setFormErrors({})
    setSubmitError(null)
    setFormOpen(true)
  }, [
    clearEditorQuery,
    feedback,
    navigate,
    requestedEditId,
    requestedEditorKey,
    requestedNew,
    snapshot,
  ])

  const categoriesById = useMemo(
    () => new Map((snapshot?.categories ?? []).map((category) => [category.id, category])),
    [snapshot?.categories],
  )

  const filterCategories = useMemo(
    () =>
      (snapshot?.categories ?? [])
        .filter((category) => typeFilter === 'all' || category.type === typeFilter)
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant')),
    [snapshot?.categories, typeFilter],
  )

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('zh-TW')

    return (snapshot?.transactions ?? [])
      .filter((transaction) => {
        if (monthKey(transaction.occurredAt) !== selectedMonth) return false
        if (typeFilter !== 'all' && transaction.type !== typeFilter) return false
        if (categoryFilter !== 'all' && transaction.categoryId !== categoryFilter) return false
        if (!query) return true

        const categoryName = categoriesById.get(transaction.categoryId)?.name ?? ''
        const searchableText = [
          transaction.note ?? '',
          categoryName,
          transactionTypeLabels[transaction.type],
          transaction.purchaseId ? '採買' : '',
        ]
          .join(' ')
          .toLocaleLowerCase('zh-TW')

        return searchableText.includes(query)
      })
      .sort(compareTransactionsNewestFirst)
  }, [
    categoriesById,
    categoryFilter,
    search,
    selectedMonth,
    snapshot?.transactions,
    typeFilter,
  ])

  const summary = useMemo(() => {
    let incomeCents = 0
    let expenseCents = 0
    for (const transaction of filteredTransactions) {
      if (transaction.type === 'income') incomeCents += transaction.amountCents
      else expenseCents += transaction.amountCents
    }
    return { incomeCents, expenseCents, differenceCents: incomeCents - expenseCents }
  }, [filteredTransactions])

  const formCategories = useMemo(() => {
    const categories = snapshot?.categories ?? []
    const active = activeCategoriesForType(categories, form.type)
    const historical = editingTransaction
      ? categories.find(
          (category) =>
            category.id === editingTransaction.categoryId && category.type === form.type,
        )
      : undefined

    if (!historical || active.some((category) => category.id === historical.id)) return active
    return [historical, ...active]
  }, [editingTransaction, form.type, snapshot?.categories])

  const requestNew = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    next.set('new', '1')
    setSearchParams(next, { state: { pantryflowEditorEntry: true } })
  }

  const requestEdit = (transaction: Transaction) => {
    if (transaction.purchaseId) {
      navigate(`/purchases?edit=${encodeURIComponent(transaction.purchaseId)}`)
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.set('edit', transaction.id)
    setSearchParams(next, { state: { pantryflowEditorEntry: true } })
  }

  const closeForm = () => {
    if (submitting) return
    setFormOpen(false)
    setEditingTransaction(null)
    setFormErrors({})
    setSubmitError(null)
    clearEditorQuery()
  }

  const updateFormField = <Key extends keyof TransactionFormState,>(
    key: Key,
    value: TransactionFormState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFormErrors((current) => ({ ...current, [key]: undefined }))
    setSubmitError(null)
  }

  const updateFormType = (type: TransactionType) => {
    const categoryId = activeCategoriesForType(snapshot?.categories ?? [], type)[0]?.id ?? ''
    setForm((current) => ({ ...current, type, categoryId }))
    setFormErrors((current) => ({ ...current, type: undefined, categoryId: undefined }))
    setSubmitError(null)
  }

  const focusFirstError = (errors: TransactionFormErrors) => {
    const idByField: Partial<Record<keyof TransactionFormState, string>> = {
      date: 'transaction-date',
      amount: 'transaction-amount',
      type: 'transaction-type',
      categoryId: 'transaction-category',
      note: 'transaction-note',
    }
    const field = (['date', 'amount', 'type', 'categoryId', 'note'] as const).find(
      (key) => errors[key],
    )
    const id = field ? idByField[field] : undefined
    if (id) window.requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  const submitTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!snapshot || submitting) return

    const nextErrors: TransactionFormErrors = {}
    let occurredAt = ''
    let amountCents = 0

    try {
      occurredAt = dateInputToIso(form.date)
    } catch (caught) {
      nextErrors.date = caught instanceof Error ? caught.message : '請選擇有效日期'
    }

    try {
      amountCents = parseMoneyToCents(form.amount)
      if (amountCents <= 0) nextErrors.amount = '金額必須大於 0'
      else if (!Number.isSafeInteger(amountCents)) nextErrors.amount = '金額過大，請輸入較小的數值'
    } catch (caught) {
      nextErrors.amount = caught instanceof Error ? caught.message : '請輸入有效金額'
    }

    const category = snapshot.categories.find((item) => item.id === form.categoryId)
    const keepsHistoricalInactiveCategory = Boolean(
      category &&
      editingTransaction &&
      editingTransaction.type === form.type &&
      editingTransaction.categoryId === category.id,
    )
    if (
      !category ||
      category.type !== form.type ||
      (!category.isActive && !keepsHistoricalInactiveCategory)
    ) {
      nextErrors.categoryId = '請選擇與交易類型相符的啟用分類'
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors)
      focusFirstError(nextErrors)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await mutate(() =>
        saveTransaction({
          id: editingTransaction?.id,
          type: form.type,
          occurredAt,
          amountCents,
          categoryId: form.categoryId,
          note: form.note.trim() || undefined,
        }),
      )
      feedback.success(editingTransaction ? '交易已更新' : '交易已新增')
      setFormOpen(false)
      setEditingTransaction(null)
      clearEditorQuery()
    } catch (caught) {
      const message = describeError(caught)
      setSubmitError(message)
      feedback.error(editingTransaction ? '無法更新交易' : '無法新增交易', {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const requestDelete = () => {
    if (!editingTransaction || submitting) return
    const target = editingTransaction
    setFormOpen(false)
    setEditingTransaction(null)
    setFormErrors({})
    setSubmitError(null)
    clearEditorQuery()
    setDeleteTarget(target)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await mutate(() => deleteTransaction(deleteTarget.id))
      feedback.success('交易已刪除')
      setDeleteTarget(null)
    } catch (caught) {
      feedback.error('無法刪除交易', { description: describeError(caught) })
    } finally {
      setDeleting(false)
    }
  }

  const resetSecondaryFilters = () => {
    setTypeFilter('all')
    setCategoryFilter('all')
    setSearch('')
  }

  const hasSecondaryFilters = typeFilter !== 'all' || categoryFilter !== 'all' || search.trim() !== ''
  const formBusy = submitting || pending
  const header = (
    <PageHeader
      eyebrow="LEDGER"
      title="記帳"
      description="記錄日常收入與支出；採買產生的食材支出會與採買單保持同步。"
      action="新增交易"
      onAction={requestNew}
    />
  )

  if (loading) return <LoadingScreen />

  if (!snapshot) {
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

      <section className="mt-7 grid min-w-0 grid-cols-3 gap-3" aria-label={`${formatMonthLabel(selectedMonth)}篩選結果摘要`}>
        <SummaryCard label="收入" value={formatMoney(summary.incomeCents)} tone="green" />
        <SummaryCard label="支出" value={formatMoney(summary.expenseCents)} tone="red" />
        <SummaryCard label="差額" value={formatSignedMoney(summary.differenceCents)} tone="dark" />
      </section>

      <section className="card mt-4 min-w-0 p-4 sm:p-5" aria-label="交易篩選">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="月份" htmlFor="ledger-month">
            <input
              id="ledger-month"
              type="month"
              value={selectedMonth}
              onChange={(event) => {
                if (event.target.value) setSelectedMonth(event.target.value)
              }}
              className={inputClass}
            />
          </Field>
          <Field label="交易類型" htmlFor="ledger-type-filter">
            <select
              id="ledger-type-filter"
              value={typeFilter}
              onChange={(event) => {
                const nextType = event.target.value as TypeFilter
                setTypeFilter(nextType)
                if (
                  categoryFilter !== 'all' &&
                  nextType !== 'all' &&
                  categoriesById.get(categoryFilter)?.type !== nextType
                ) {
                  setCategoryFilter('all')
                }
              }}
              className={selectClass}
            >
              <option value="all">全部類型</option>
              <option value="income">收入</option>
              <option value="expense">支出</option>
            </select>
          </Field>
          <Field label="分類" htmlFor="ledger-category-filter">
            <select
              id="ledger-category-filter"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={selectClass}
            >
              <option value="all">全部分類</option>
              {filterCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}{category.isActive ? '' : '（已停用）'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="搜尋" htmlFor="ledger-search">
            <div className="search-field min-w-0">
              <MagnifyingGlass size={18} className="shrink-0" aria-hidden="true" />
              <input
                id="ledger-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="備註、分類或類型"
              />
            </div>
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-oat-100 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-stone-500" aria-live="polite">
            找到 {filteredTransactions.length.toLocaleString('zh-TW')} 筆交易
          </p>
          {hasSecondaryFilters && (
            <button type="button" className="secondary-button" onClick={resetSecondaryFilters}>
              清除篩選
            </button>
          )}
        </div>
      </section>

      <section className="card mt-4 min-w-0 overflow-hidden" aria-label="交易明細">
        {filteredTransactions.length > 0 ? (
          <div className="divide-y divide-oat-100">
            {filteredTransactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                category={categoriesById.get(transaction.categoryId)}
                onClick={() => requestEdit(transaction)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={hasSecondaryFilters ? MagnifyingGlass : Receipt}
            title={hasSecondaryFilters ? '沒有符合篩選的交易' : `${formatMonthLabel(selectedMonth)}還沒有交易`}
            description={hasSecondaryFilters ? '調整搜尋字詞或清除篩選後再試。' : '新增第一筆收入或支出，這裡會自動整理本月收支。'}
            action={hasSecondaryFilters ? '清除篩選' : '新增交易'}
            onAction={hasSecondaryFilters ? resetSecondaryFilters : requestNew}
          />
        )}
      </section>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editingTransaction ? '編輯交易' : '新增交易'}
        description="金額以新台幣整數元輸入，不接受小數。"
        size="md"
        dismissible={!formBusy}
        footer={
          <>
            {editingTransaction && (
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
              form={TRANSACTION_FORM_ID}
              className="primary-button"
              disabled={formBusy || formCategories.length === 0}
              aria-busy={submitting || undefined}
            >
              {submitting ? '儲存中…' : editingTransaction ? '儲存變更' : '新增交易'}
            </button>
          </>
        }
      >
        <form
          id={TRANSACTION_FORM_ID}
          className="space-y-5"
          onSubmit={(event) => void submitTransaction(event)}
          noValidate
          aria-busy={formBusy}
        >
          {submitError && <InlineAlert>{submitError}</InlineAlert>}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="日期" htmlFor="transaction-date" required error={formErrors.date}>
              <input
                id="transaction-date"
                data-autofocus
                type="date"
                value={form.date}
                onChange={(event) => updateFormField('date', event.target.value)}
                className={inputClass}
                required
                disabled={formBusy}
                aria-invalid={Boolean(formErrors.date)}
                aria-describedby={formErrors.date ? 'transaction-date-error' : undefined}
              />
            </Field>
            <Field label="金額（元）" htmlFor="transaction-amount" required error={formErrors.amount}>
              <input
                id="transaction-amount"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.amount}
                onChange={(event) => updateFormField('amount', event.target.value)}
                placeholder="0"
                className={inputClass}
                required
                disabled={formBusy}
                aria-invalid={Boolean(formErrors.amount)}
                aria-describedby={formErrors.amount ? 'transaction-amount-error' : undefined}
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="交易類型" htmlFor="transaction-type" required error={formErrors.type}>
              <select
                id="transaction-type"
                value={form.type}
                onChange={(event) => updateFormType(event.target.value as TransactionType)}
                className={selectClass}
                required
                disabled={formBusy}
                aria-invalid={Boolean(formErrors.type)}
                aria-describedby={formErrors.type ? 'transaction-type-error' : undefined}
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </Field>
            <Field label="分類" htmlFor="transaction-category" required error={formErrors.categoryId}>
              <select
                id="transaction-category"
                value={form.categoryId}
                onChange={(event) => updateFormField('categoryId', event.target.value)}
                className={selectClass}
                required
                disabled={formBusy || formCategories.length === 0}
                aria-invalid={Boolean(formErrors.categoryId)}
                aria-describedby={formErrors.categoryId ? 'transaction-category-error' : undefined}
              >
                {formCategories.length === 0 ? (
                  <option value="">沒有可用分類</option>
                ) : (
                  formCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}{category.isActive ? '' : '（已停用，保留原分類）'}
                    </option>
                  ))
                )}
              </select>
            </Field>
          </div>

          {formCategories.length === 0 && (
            <InlineAlert tone="info">
              目前沒有啟用中的{transactionTypeLabels[form.type]}分類，請先到設定新增或啟用分類。
            </InlineAlert>
          )}

          <Field label="備註" htmlFor="transaction-note" error={formErrors.note}>
            <textarea
              id="transaction-note"
              value={form.note}
              onChange={(event) => updateFormField('note', event.target.value)}
              placeholder="選填，例如用途或付款方式"
              className={textareaClass}
              disabled={formBusy}
              aria-invalid={Boolean(formErrors.note)}
              aria-describedby={formErrors.note ? 'transaction-note-error' : undefined}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) setDeleteTarget(null)
        }}
        onConfirm={() => void confirmDelete()}
        title="刪除這筆交易？"
        description="刪除後無法復原，本月收支統計也會立即更新。"
        confirmLabel={deleting ? '刪除中…' : '刪除交易'}
        tone="danger"
        pending={deleting}
      >
        {deleteTarget && (
          <div className="rounded-2xl bg-oat-100 p-4 text-sm dark:bg-[#243129]">
            <strong className="block truncate">{deleteTarget.note || transactionTypeLabels[deleteTarget.type]}</strong>
            <span className="mt-1 block text-stone-600">
              {formatFullDate(deleteTarget.occurredAt)} · {formatMoney(deleteTarget.amountCents)}
            </span>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'dark' }) {
  const toneClasses = {
    green: 'bg-forest-50 text-forest-800',
    red: 'bg-tomato-50 text-tomato-700',
    dark: 'bg-forest-700 text-white',
  }

  return (
    <article className={`min-w-0 rounded-2xl p-3 sm:p-5 ${toneClasses[tone]}`}>
      <span className="text-xs font-medium opacity-75">{label}</span>
      <strong className="mt-2 block break-words font-mono text-xs tabular-nums sm:text-lg">{value}</strong>
    </article>
  )
}

function TransactionRow({
  transaction,
  category,
  onClick,
}: {
  transaction: Transaction
  category?: Category
  onClick: () => void
}) {
  const isIncome = transaction.type === 'income'
  const title = transaction.note || category?.name || transactionTypeLabels[transaction.type]
  const actionLabel = transaction.purchaseId ? '前往採買單' : '編輯交易'

  return (
    <button
      type="button"
      className="flex min-w-0 w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-forest-50/50 focus-visible:bg-forest-50 sm:items-center sm:px-5"
      onClick={onClick}
      aria-label={`${actionLabel}：${title}，${formatMoney(transaction.amountCents)}`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${
          isIncome ? 'bg-forest-50 text-forest-700' : 'bg-oat-100 text-stone-600'
        }`}
      >
        {transaction.purchaseId ? (
          <ShoppingBagOpen size={19} weight="duotone" aria-hidden="true" />
        ) : isIncome ? (
          <ArrowDown size={18} weight="bold" aria-hidden="true" />
        ) : (
          <ArrowUp size={18} weight="bold" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <strong className="min-w-0 truncate text-sm">{title}</strong>
          <strong className={`break-words font-mono text-sm tabular-nums ${isIncome ? 'text-forest-700' : 'text-ink'}`}>
            {isIncome ? '+' : '−'} {formatMoney(transaction.amountCents)}
          </strong>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-stone-500">
          <span>{formatFullDate(transaction.occurredAt)}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: category?.color || '#78716c' }}
              aria-hidden="true"
            />
            {category?.name ?? '未分類'}
          </span>
          {transaction.purchaseId && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-forest-700">連結採買單</span>
            </>
          )}
        </span>
      </span>
      <CaretRight size={17} className="mt-2 shrink-0 text-stone-400 sm:mt-3" aria-hidden="true" />
    </button>
  )
}
