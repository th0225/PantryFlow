import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  Database,
  DownloadSimple,
  PencilSimple,
  Plus,
  Tag,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react'
import { ConfirmDialog, Modal } from '../components/Dialog'
import {
  Field,
  InlineAlert,
  LoadingScreen,
  PageHeader,
  inputClass,
  selectClass,
} from '../components/Common'
import { useFeedback } from '../components/Feedback'
import { DEFAULT_CATEGORY_IDS } from '../data/db'
import type { Category, TransactionType } from '../domain/types'
import {
  clearAllData,
  deleteCategory,
  exportBackup,
  importBackup,
  saveCategory,
  setCategoryActive,
  validateBackup,
} from '../data/repository'
import { usePantryData } from '../data/store'
import { transactionTypeLabels } from '../lib/options'

const CLEAR_PHRASE = '清除全部資料'

export default function SettingsPage() {
  const { snapshot, loading, error, refresh, mutate, describeError } = usePantryData()
  const feedback = useFeedback()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [importCandidate, setImportCandidate] = useState<unknown | null>(null)
  const [importName, setImportName] = useState('')
  const [importing, setImporting] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearPhraseOpen, setClearPhraseOpen] = useState(false)
  const [clearPhrase, setClearPhrase] = useState('')
  const [clearing, setClearing] = useState(false)
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<Category | null>(null)
  const [deletingCategory, setDeletingCategory] = useState(false)

  if (loading) return <LoadingScreen />
  if (!snapshot) return <div className="page-shell"><PageHeader eyebrow="SETTINGS" title="設定與資料管理" description="管理分類與這台裝置上的本機資料。" /><div className="mt-7"><InlineAlert>{describeError(error)}</InlineAlert><button type="button" className="secondary-button mt-4" onClick={() => void refresh()}>重新載入</button></div></div>

  const downloadBackup = async () => {
    try {
      const backup = await exportBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `pantryflow-backup-${backup.exportedAt.slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      feedback.success('備份已匯出', { description: '請將 JSON 檔保存到安全的位置。' })
    } catch (caught) {
      feedback.error('無法匯出備份', { description: describeError(caught) })
    }
  }

  const chooseBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      feedback.error('備份檔過大', { description: '請選擇小於 20 MB 的 PantryFlow JSON 備份。' })
      return
    }
    try {
      const value = JSON.parse(await file.text()) as unknown
      const validated = validateBackup(value)
      setImportCandidate(validated)
      setImportName(file.name)
    } catch (caught) {
      feedback.error('備份驗證失敗', { description: caught instanceof SyntaxError ? '檔案不是有效的 JSON，請重新選擇。' : describeError(caught) })
    }
  }

  const confirmImport = async () => {
    if (importCandidate === null) return
    setImporting(true)
    try {
      await mutate(() => importBackup(importCandidate))
      feedback.success('資料已還原', { description: '來源資料、庫存與餐費已完成驗證及 FIFO 重算。' })
      setImportCandidate(null)
      setImportName('')
    } catch (caught) {
      feedback.error('備份驗證失敗', { description: describeError(caught) })
    } finally {
      setImporting(false)
    }
  }

  const confirmClear = async () => {
    if (clearPhrase !== CLEAR_PHRASE) return
    setClearing(true)
    try {
      await mutate(() => clearAllData())
      feedback.success('資料已清除', { description: '已重新建立必要的預設收支分類。' })
      setClearPhrase('')
      setClearPhraseOpen(false)
    } catch (caught) {
      feedback.error('無法清除資料', { description: describeError(caught) })
    } finally {
      setClearing(false)
    }
  }

  const requestCategoryDelete = (category: Category) => {
    setCategoryOpen(false)
    setCategoryDeleteTarget(category)
  }

  const closeCategoryDelete = () => {
    if (deletingCategory) return
    const returnFocusId = categoryDeleteTarget?.id
    setCategoryDeleteTarget(null)
    setCategoryOpen(true)
    if (returnFocusId) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById(`category-delete-${returnFocusId}`)?.focus()
        })
      })
    }
  }

  const confirmCategoryDelete = async () => {
    if (!categoryDeleteTarget || deletingCategory) return
    setDeletingCategory(true)
    try {
      await mutate(() => deleteCategory(categoryDeleteTarget.id))
      feedback.success('分類已刪除', { description: '未被交易使用的分類已永久移除。' })
      setCategoryDeleteTarget(null)
      setCategoryOpen(true)
    } catch (caught) {
      feedback.error('無法刪除分類', { description: describeError(caught) })
    } finally {
      setDeletingCategory(false)
    }
  }

  const backupData = typeof importCandidate === 'object' && importCandidate !== null && 'data' in importCandidate
    ? (importCandidate as { data?: Record<string, unknown> }).data
    : undefined
  const backupSummary = backupData
    ? [
        ['交易', backupData.transactions],
        ['採買', backupData.purchases],
        ['食材', backupData.ingredients],
        ['餐點', backupData.meals],
      ].map(([label, value]) => `${label} ${Array.isArray(value) ? value.length : '—'} 筆`).join('、')
    : '將在還原前完整驗證檔案格式、關聯與 FIFO 庫存。'
  const transactionCounts = snapshot.transactions.reduce((counts, transaction) => {
    counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1)
    return counts
  }, new Map<string, number>())

  return (
    <div className="page-shell max-w-5xl">
      <PageHeader eyebrow="SETTINGS" title="設定與資料管理" description="管理收支分類、備份本機資料，或在需要時還原完整資料庫。" />

      {error && <div className="mt-5"><InlineAlert><div className="flex flex-wrap items-center justify-between gap-2"><span>{describeError(error)}</span><button type="button" className="text-button" onClick={() => void refresh()}>重新載入</button></div></InlineAlert></div>}

      <div className="mt-7 rounded-2xl border border-forest-200 bg-forest-50 p-4 text-sm leading-6 text-forest-800 dark:border-[#315b4b] dark:bg-[#1a382d] dark:text-[#b9e5d2]">
        <div className="flex items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-forest-600 text-white"><Check size={17} weight="bold" /></span><div><strong className="font-bold">資料只保存在這台裝置</strong><p className="mt-1 text-xs leading-5">瀏覽器網站資料被清除時，帳務與庫存也會遺失。建議定期匯出 JSON 備份。</p></div></div>
      </div>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <SettingsCard icon={Tag} title="收支分類" description={`${snapshot.categories.filter((item) => item.isActive).length} 個啟用分類；可新增、改名、設定顏色或停用。`} action="管理分類" onAction={() => setCategoryOpen(true)} />
        <SettingsCard icon={DownloadSimple} title="匯出備份" description={`下載完整來源資料：${snapshot.transactions.length} 筆交易、${snapshot.purchases.length} 張採買、${snapshot.meals.length} 餐。`} action="匯出 JSON" onAction={() => void downloadBackup()} />
        <SettingsCard icon={UploadSimple} title="還原資料" description="驗證格式、關聯與 FIFO 後，整庫取代目前資料；不會與現有資料合併。" action="選擇備份檔" onAction={() => fileInputRef.current?.click()} />
        <SettingsCard icon={Database} title="清除全部資料" description="移除這台裝置上的交易、採買、食材、庫存與餐點；此操作需確認兩次。" action="清除資料" onAction={() => setClearConfirmOpen(true)} danger />
      </section>

      <input ref={fileInputRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void chooseBackup(event)} />

      <CategoryManager open={categoryOpen} categories={snapshot.categories} transactionCounts={transactionCounts} onClose={() => setCategoryOpen(false)} onRequestDelete={requestCategoryDelete} />

      <ConfirmDialog open={categoryDeleteTarget !== null} onClose={closeCategoryDelete} onConfirm={() => void confirmCategoryDelete()} title="永久刪除這個分類？" description={categoryDeleteTarget ? `「${categoryDeleteTarget.name}」尚未被任何交易使用；刪除後無法復原。` : '刪除後無法復原。'} confirmLabel={deletingCategory ? '刪除中…' : '刪除分類'} tone="danger" pending={deletingCategory} />

      <ConfirmDialog open={importCandidate !== null} onClose={() => { if (!importing) { setImportCandidate(null); setImportName('') } }} onConfirm={() => void confirmImport()} title="以備份取代目前資料？" description={`檔案：${importName || '未命名備份'}。還原會永久取代這台裝置上的現有 PantryFlow 資料。`} confirmLabel={importing ? '驗證與還原中…' : '驗證並還原'} tone="danger" pending={importing}><InlineAlert tone="info">{backupSummary}</InlineAlert></ConfirmDialog>

      <ConfirmDialog open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)} onConfirm={() => { setClearConfirmOpen(false); setClearPhraseOpen(true) }} title="要清除全部資料嗎？" description="所有交易、採買、庫存調減與餐點都會永久移除。請先確認已有可用的 JSON 備份。" confirmLabel="繼續第二次確認" tone="danger" />

      <Modal open={clearPhraseOpen} onClose={() => { if (!clearing) { setClearPhraseOpen(false); setClearPhrase('') } }} title="第二次確認" description={<>請輸入「<strong>{CLEAR_PHRASE}</strong>」以執行不可復原的清除操作。</>} size="sm" closeOnBackdrop={!clearing} dismissible={!clearing} footer={<><button type="button" className="secondary-button" onClick={() => { setClearPhraseOpen(false); setClearPhrase('') }} disabled={clearing}>取消</button><button type="button" className="danger-button" onClick={() => void confirmClear()} disabled={clearing || clearPhrase !== CLEAR_PHRASE}>{clearing ? '清除中…' : '永久清除'}</button></>}>
        <Field label="確認文字" htmlFor="clear-confirmation" required><input id="clear-confirmation" className={inputClass} value={clearPhrase} onChange={(event) => setClearPhrase(event.target.value)} autoComplete="off" data-autofocus /></Field>
      </Modal>
    </div>
  )
}

function SettingsCard({ icon: Icon, title, description, action, onAction, danger = false }: { icon: typeof Tag; title: string; description: string; action: string; onAction: () => void; danger?: boolean }) {
  return <article className="card p-6"><span className={`grid size-11 place-items-center rounded-xl ${danger ? 'bg-tomato-50 text-tomato-700' : 'bg-forest-50 text-forest-700'}`}><Icon size={22} weight="duotone" /></span><h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 min-h-[44px] text-sm leading-6 text-stone-600">{description}</p><button type="button" onClick={onAction} className={`mt-5 ${danger ? 'danger-button' : 'secondary-button'}`}>{action}<ArrowRight size={16} /></button></article>
}

function CategoryManager({ open, categories, transactionCounts, onClose, onRequestDelete }: { open: boolean; categories: readonly Category[]; transactionCounts: ReadonlyMap<string, number>; onClose: () => void; onRequestDelete: (category: Category) => void }) {
  const { mutate, describeError } = usePantryData()
  const feedback = useFeedback()
  const formId = useId()
  const [editing, setEditing] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<TransactionType>('expense')
  const [color, setColor] = useState('#2b725c')
  const [nameError, setNameError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const sorted = useMemo(() => [...categories].sort((a, b) => a.type.localeCompare(b.type) || Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'zh-Hant')), [categories])
  const reset = () => { setEditing(null); setName(''); setType('expense'); setColor('#2b725c'); setNameError(''); setFormError('') }
  const beginEdit = (category: Category) => { setEditing(category); setName(category.name); setType(category.type); setColor(category.color); setNameError(''); setFormError('') }
  const busy = saving || togglingId !== null

  useEffect(() => {
    if (editing && !categories.some((category) => category.id === editing.id)) reset()
  }, [categories, editing])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setNameError('請輸入分類名稱'); window.requestAnimationFrame(() => document.getElementById(`${formId}-name`)?.focus()); return }
    if (categories.some((category) => category.id !== editing?.id && category.type === type && category.name.toLocaleLowerCase('zh-Hant') === trimmed.toLocaleLowerCase('zh-Hant'))) { setNameError(`已有同名的${transactionTypeLabels[type]}分類`); window.requestAnimationFrame(() => document.getElementById(`${formId}-name`)?.focus()); return }
    setSaving(true)
    setNameError('')
    setFormError('')
    try {
      await mutate(() => saveCategory({ id: editing?.id, name: trimmed, type, color }))
      feedback.success(editing ? '分類已更新' : '分類已新增')
      reset()
    } catch (caught) { setFormError(describeError(caught)) } finally { setSaving(false) }
  }

  const toggle = async (category: Category) => {
    setTogglingId(category.id)
    try {
      await mutate(() => setCategoryActive(category.id, !category.isActive))
      feedback.success(category.isActive ? '分類已停用' : '分類已啟用', { description: category.isActive && (transactionCounts.get(category.id) ?? 0) > 0 ? '歷史交易仍會保留這個分類。' : undefined })
    } catch (caught) { feedback.error('無法更新分類狀態', { description: describeError(caught) }) } finally { setTogglingId(null) }
  }

  return <Modal open={open} onClose={onClose} title="收支分類" description="已被交易使用的分類會保留在歷史資料中；食材分類是採買必要分類，其餘不再使用時可停用。" size="lg" dismissible={!busy} footer={<button type="button" className="secondary-button" onClick={onClose} disabled={busy}>完成</button>}>
    <form id={formId} onSubmit={submit} className="rounded-2xl border border-oat-200 p-4 dark:border-[#34463e]" noValidate aria-busy={busy}><fieldset disabled={busy} className="contents"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{editing ? `編輯 ${editing.name}` : '新增分類'}</h3>{editing && <button type="button" className="text-button" onClick={reset}>取消編輯</button>}</div>{formError && <div className="mt-3"><InlineAlert>{formError}</InlineAlert></div>}<div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px_100px]"><Field label="名稱" htmlFor={`${formId}-name`} required error={nameError}><input id={`${formId}-name`} data-autofocus className={inputClass} value={name} onChange={(event) => { setName(event.target.value); setNameError(''); setFormError('') }} required aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `${formId}-name-error` : undefined} /></Field><Field label="類型" htmlFor={`${formId}-type`} required hint={editing ? '建立後不可更改' : undefined}><select id={`${formId}-type`} className={selectClass} value={type} onChange={(event) => setType(event.target.value as TransactionType)} required disabled={Boolean(editing)}><option value="expense">支出</option><option value="income">收入</option></select></Field><Field label="顏色" htmlFor={`${formId}-color`} required><input id={`${formId}-color`} type="color" className={`${inputClass} cursor-pointer p-1.5`} value={color} onChange={(event) => setColor(event.target.value)} required /></Field></div><div className="mt-3 flex justify-end"><button type="submit" className="primary-button"><Plus size={17} />{saving ? '儲存中…' : editing ? '更新分類' : '新增分類'}</button></div></fieldset></form>
    <div className="mt-5 space-y-2">{sorted.map((category) => { const transactionCount = transactionCounts.get(category.id) ?? 0; const isRequired = category.id === DEFAULT_CATEGORY_IDS.groceries; return <article key={category.id} className="flex min-h-[68px] items-center gap-3 rounded-2xl border border-oat-200 px-3 py-2 dark:border-[#34463e]"><span className="size-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: category.color }} aria-label={`分類顏色 ${category.color}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm">{category.name}</strong><span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">{transactionTypeLabels[category.type]}</span>{isRequired && <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[10px] font-semibold text-forest-700">採買必要</span>}{!category.isActive && <span className="rounded-full bg-tomato-50 px-2 py-0.5 text-[10px] font-semibold text-tomato-700">已停用</span>}</div><p className="mt-1 text-xs text-stone-500">{transactionCount} 筆交易</p></div><button type="button" className="icon-button-sm" aria-label={`編輯 ${category.name}`} onClick={() => beginEdit(category)} disabled={busy}><PencilSimple size={18} /></button>{transactionCount === 0 && !isRequired && <button id={`category-delete-${category.id}`} type="button" className="icon-button-sm text-tomato-700" aria-label={`刪除 ${category.name}`} onClick={() => onRequestDelete(category)} disabled={busy}><Trash size={18} /></button>}{(!isRequired || !category.isActive) && <button type="button" className={category.isActive ? 'danger-button px-3' : 'secondary-button px-3'} onClick={() => void toggle(category)} disabled={busy}>{togglingId === category.id ? '更新中' : category.isActive ? '停用' : '啟用'}</button>}</article> })}</div>
  </Modal>
}
