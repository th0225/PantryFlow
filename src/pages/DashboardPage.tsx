import {
  ArrowDown,
  ArrowUp,
  CaretRight,
  ChartDonut,
  CheckCircle,
  ClockCountdown,
  ForkKnife,
  MinusCircle,
  Package,
  Receipt,
  ShoppingBagOpen,
  Warning,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import {
  EmptyState,
  InlineAlert,
  LoadingScreen,
  PageHeader,
  SectionHeader,
  type AppIcon,
} from '../components/Common'
import { usePantryData } from '../data/store'
import type {
  DerivedInventoryBatch,
  Ingredient,
  Meal,
  PantryFlowSnapshot,
  RecalculatedInventory,
} from '../domain/types'
import {
  currentMonthInput,
  expiryDaysFromToday,
  formatBaseQuantity,
  formatDashboardDate,
  formatDateTime,
  formatExpiry,
  formatMoney,
  monthKey,
} from '../lib/format'

export interface DashboardPageProps {
  onQuickAdd: () => void
}

interface ExpenseCategorySummary {
  id: string
  label: string
  color: string
  amountCents: number
  percentage: number
}

const mealTypeLabels: Record<Meal['mealType'], string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '點心',
  other: '其他',
}

const percentFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 1,
})

export function DashboardPage({ onQuickAdd }: DashboardPageProps) {
  const navigate = useNavigate()
  const { snapshot, derived, loading, error, refresh, describeError } = usePantryData()
  const header = (
    <PageHeader
      eyebrow={formatDashboardDate()}
      title="儀表板"
      description="掌握本月收支、庫存效期與每餐實際食材成本。"
      action="快速新增"
      onAction={onQuickAdd}
    />
  )

  if (loading) return <LoadingScreen />

  if (!snapshot || !derived) {
    return (
      <div className="page-shell">
        {header}
        <div className="mt-7">
          <InlineAlert>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{error ? describeError(error) : '本機資料尚未準備完成，請重新載入。'}</p>
              <button
                type="button"
                className="secondary-button shrink-0"
                onClick={() => void refresh()}
              >
                重新載入
              </button>
            </div>
          </InlineAlert>
        </div>
      </div>
    )
  }

  const dashboard = buildDashboardData(snapshot, derived)

  return (
    <div className="page-shell">
      {header}

      {error && (
        <div className="mt-5">
          <InlineAlert>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>{describeError(error)}</p>
              <button
                type="button"
                className="secondary-button shrink-0"
                onClick={() => void refresh()}
              >
                重試
              </button>
            </div>
          </InlineAlert>
        </div>
      )}

      <section
        className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-12"
        aria-label={`${dashboard.monthLabel}收支摘要`}
      >
        <article className="relative col-span-2 overflow-hidden rounded-3xl bg-forest-700 p-6 text-white shadow-card md:col-span-6">
          <div
            className="absolute -right-10 -top-16 size-44 rounded-full border-[28px] border-white/5"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-forest-100">本月收支差額</p>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-forest-50">
                {dashboard.monthLabel}
              </span>
            </div>
            <p className="mt-5 break-words font-mono text-[1.8rem] font-semibold tracking-[-0.04em] tabular-nums sm:text-[2rem]">
              {formatSignedMoney(dashboard.differenceCents)}
            </p>
            <p className="mt-6 text-sm text-forest-100">
              本月共 {dashboard.transactionCount.toLocaleString('zh-TW')} 筆交易
            </p>
          </div>
        </article>

        <MetricCard
          label="收入"
          valueCents={dashboard.incomeCents}
          icon={ArrowDown}
          tone="green"
          detail={`${dashboard.incomeCount.toLocaleString('zh-TW')} 筆交易`}
        />
        <MetricCard
          label="支出"
          valueCents={dashboard.expenseCents}
          icon={ArrowUp}
          tone="orange"
          detail={`${dashboard.expenseCount.toLocaleString('zh-TW')} 筆交易`}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <article className="card p-5 sm:p-6">
          <SectionHeader
            title="庫存概況"
            subtitle={`目前有 ${dashboard.availableIngredientCount.toLocaleString('zh-TW')} 種食材仍有庫存`}
            action="查看全部"
            onAction={() => navigate('/inventory')}
          />
          <div className="mt-5 grid grid-cols-3 gap-3">
            <InventoryStat
              value={dashboard.availableIngredientCount}
              label="有庫存"
              tone="green"
            />
            <InventoryStat
              value={dashboard.expiringBatches.length}
              label="7 日內到期"
              tone="amber"
            />
            <InventoryStat
              value={dashboard.expiredBatches.length}
              label="已過期"
              tone="red"
            />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">現有食材</h3>
              <span className="text-xs text-stone-500">所有剩餘庫存</span>
            </div>
            {dashboard.availableIngredients.length > 0 ? (
              <ul
                className="mt-3 grid gap-2 sm:grid-cols-2"
                aria-label="目前有庫存的食材與剩餘量"
              >
                {dashboard.availableIngredients.map((item) => (
                  <InventoryIngredientRow
                    key={item.ingredient.id}
                    ingredient={item.ingredient}
                    remainingQuantityBase={item.remainingQuantityBase}
                    batchCount={item.batchCount}
                  />
                ))}
              </ul>
            ) : (
              <div className="mt-3 rounded-2xl border border-oat-100 bg-[#fbfaf6] px-4 py-5 text-center dark:bg-[#121b17]">
                <Package
                  size={24}
                  weight="duotone"
                  className="mx-auto text-stone-400"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm font-semibold">目前沒有庫存</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">新增採買後，剩餘量會顯示在這裡。</p>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-oat-100 pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">效期提醒</h3>
              <span className="text-xs text-stone-500">已過期與 7 日內到期</span>
            </div>
            {dashboard.priorityBatches.length > 0 ? (
              <div className="mt-3 space-y-2.5" aria-label="需優先處理的庫存批次">
                {dashboard.priorityBatches.map((batch) => (
                  <ExpiryBatchRow
                    key={batch.purchaseItemId}
                    batch={batch}
                    ingredient={dashboard.ingredientsById.get(batch.ingredientId)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-oat-100 bg-[#fbfaf6] px-4 py-5 text-center dark:bg-[#121b17]">
                <CheckCircle
                  size={24}
                  weight="duotone"
                  className="mx-auto text-forest-600"
                  aria-hidden="true"
                />
                <p className="mt-2 text-sm font-semibold">目前沒有 7 日內到期或已過期批次</p>
              </div>
            )}
          </div>
        </article>

        <article className="card p-5 sm:p-6">
          <SectionHeader
            title="本月支出"
            subtitle="依分類"
            action="明細"
            onAction={() => navigate('/ledger')}
          />
          {dashboard.expenseCents > 0 && dashboard.expenseCategories.length > 0 ? (
            <ExpenseBreakdown
              totalCents={dashboard.expenseCents}
              categories={dashboard.expenseCategories}
            />
          ) : (
            <EmptyState
              icon={ChartDonut}
              title="本月還沒有支出"
              description="新增一筆支出後，這裡會依分類整理占比。"
              action="新增支出"
              onAction={() => navigate('/ledger?new=1')}
            />
          )}
        </article>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="card overflow-hidden">
          <div className="p-5 pb-3 sm:p-6 sm:pb-4">
            <SectionHeader
              title="最近餐點"
              subtitle="FIFO 計算的實際食材成本"
              action="新增餐點"
              onAction={() => navigate('/meals?new=1')}
            />
          </div>
          {dashboard.recentMeals.length > 0 ? (
            <div className="divide-y divide-oat-100">
              {dashboard.recentMeals.map((item) => (
                <MealRow
                  key={item.meal.id}
                  meal={item.meal}
                  ingredientCount={item.ingredientCount}
                  costCents={item.costCents}
                  onClick={() => navigate(`/meals?edit=${encodeURIComponent(item.meal.id)}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ForkKnife}
              title="還沒有餐點記錄"
              description="記錄每餐使用的食材，系統會依 FIFO 自動計算成本。"
              action="記錄第一餐"
              onAction={() => navigate('/meals?new=1')}
            />
          )}
        </article>

        <article className="card p-5 sm:p-6">
          <SectionHeader title="常用操作" subtitle="快速開始日常記錄" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <QuickLink
              icon={Receipt}
              label="記一筆帳"
              hint="收入或支出"
              onClick={() => navigate('/ledger?new=1')}
            />
            <QuickLink
              icon={ShoppingBagOpen}
              label="新增採買"
              hint="同步支出與庫存"
              onClick={() => navigate('/purchases?new=1')}
            />
            <QuickLink
              icon={ForkKnife}
              label="記錄餐點"
              hint="FIFO 計算成本"
              onClick={() => navigate('/meals?new=1')}
            />
            <QuickLink
              icon={MinusCircle}
              label="庫存調減"
              hint="過期、丟棄或盤點"
              onClick={() => navigate('/inventory?adjust=1')}
            />
          </div>
        </article>
      </section>
    </div>
  )
}

function buildDashboardData(snapshot: PantryFlowSnapshot, derived: RecalculatedInventory) {
  const selectedMonth = currentMonthInput()
  const monthTransactions = snapshot.transactions.filter(
    (transaction) => monthKey(transaction.occurredAt) === selectedMonth,
  )
  const incomeTransactions = monthTransactions.filter((transaction) => transaction.type === 'income')
  const expenseTransactions = monthTransactions.filter((transaction) => transaction.type === 'expense')
  const incomeCents = incomeTransactions.reduce((sum, transaction) => sum + transaction.amountCents, 0)
  const expenseCents = expenseTransactions.reduce((sum, transaction) => sum + transaction.amountCents, 0)

  const remainingBatches = derived.batches.filter((batch) => batch.remainingQuantityBase > 0)
  const ingredientsById = new Map(snapshot.ingredients.map((ingredient) => [ingredient.id, ingredient]))
  const inventoryByIngredient = new Map<string, { remainingQuantityBase: number; batchCount: number }>()
  for (const batch of remainingBatches) {
    const summary = inventoryByIngredient.get(batch.ingredientId) ?? {
      remainingQuantityBase: 0,
      batchCount: 0,
    }
    summary.remainingQuantityBase += batch.remainingQuantityBase
    summary.batchCount += 1
    inventoryByIngredient.set(batch.ingredientId, summary)
  }
  const availableIngredients = [...inventoryByIngredient.entries()]
    .flatMap(([ingredientId, summary]) => {
      const ingredient = ingredientsById.get(ingredientId)
      return ingredient ? [{ ingredient, ...summary }] : []
    })
    .sort((left, right) => left.ingredient.name.localeCompare(right.ingredient.name, 'zh-TW'))
  const availableIngredientCount = new Set(
    remainingBatches.map((batch) => batch.ingredientId),
  ).size
  const expiredBatches = remainingBatches.filter((batch) => {
    const days = expiryDaysFromToday(batch.expiresOn)
    return days !== null && days < 0
  })
  const expiringBatches = remainingBatches.filter((batch) => {
    const days = expiryDaysFromToday(batch.expiresOn)
    return days !== null && days >= 0 && days <= 7
  })
  const priorityBatches = [...expiredBatches, ...expiringBatches]
    .sort((left, right) => (left.expiresOn ?? '').localeCompare(right.expiresOn ?? ''))
    .slice(0, 3)

  const mealIngredientIds = new Map<string, Set<string>>()
  for (const item of snapshot.mealIngredients) {
    const ingredientIds = mealIngredientIds.get(item.mealId) ?? new Set<string>()
    ingredientIds.add(item.ingredientId)
    mealIngredientIds.set(item.mealId, ingredientIds)
  }
  const recentMeals = [...snapshot.meals]
    .sort(compareMealsNewestFirst)
    .slice(0, 3)
    .map((mealItem) => ({
      meal: mealItem,
      ingredientCount: mealIngredientIds.get(mealItem.id)?.size ?? 0,
      costCents: derived.mealCosts[mealItem.id] ?? 0,
    }))

  const categoriesById = new Map(snapshot.categories.map((category) => [category.id, category]))
  const expenseByCategory = new Map<string, number>()
  for (const transaction of expenseTransactions) {
    expenseByCategory.set(
      transaction.categoryId,
      (expenseByCategory.get(transaction.categoryId) ?? 0) + transaction.amountCents,
    )
  }
  const expenseCategories = [...expenseByCategory.entries()]
    .map(([id, amountCents]): ExpenseCategorySummary => {
      const category = categoriesById.get(id)
      return {
        id,
        label: category?.name ?? '未分類',
        color: category?.color || '#78716c',
        amountCents,
        percentage: expenseCents > 0 ? (amountCents / expenseCents) * 100 : 0,
      }
    })
    .sort((left, right) => right.amountCents - left.amountCents || left.id.localeCompare(right.id))

  return {
    monthLabel: formatMonthLabel(selectedMonth),
    incomeCents,
    expenseCents,
    differenceCents: incomeCents - expenseCents,
    incomeCount: incomeTransactions.length,
    expenseCount: expenseTransactions.length,
    transactionCount: monthTransactions.length,
    availableIngredientCount,
    availableIngredients,
    expiredBatches,
    expiringBatches,
    priorityBatches,
    recentMeals,
    expenseCategories,
    ingredientsById,
  }
}

function MetricCard({
  label,
  valueCents,
  icon: Icon,
  tone,
  detail,
}: {
  label: string
  valueCents: number
  icon: AppIcon
  tone: 'green' | 'orange'
  detail: string
}) {
  const iconStyle = tone === 'green'
    ? 'bg-forest-50 text-forest-700'
    : 'bg-amber-50 text-amber-700'

  return (
    <article className="card col-span-1 flex min-h-[148px] flex-col justify-between p-4 sm:p-5 md:col-span-3 md:min-h-[160px]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-stone-600">{label}</p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${iconStyle}`}>
          <Icon size={18} weight="bold" aria-hidden="true" />
        </span>
      </div>
      <div>
        <p className="break-words font-mono text-base font-semibold tabular-nums text-ink sm:text-xl">
          {formatMoney(valueCents)}
        </p>
        <p className="mt-1 text-xs text-stone-500">{detail}</p>
      </div>
    </article>
  )
}

function InventoryStat({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'green' | 'amber' | 'red'
}) {
  const styles = {
    green: 'bg-forest-50 text-forest-800',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-tomato-50 text-tomato-700',
  }

  return (
    <div className={`rounded-2xl px-2 py-4 text-center sm:px-3 ${styles[tone]}`}>
      <strong className="block text-2xl tabular-nums">{value.toLocaleString('zh-TW')}</strong>
      <span className="mt-1 block text-[11px] font-medium sm:text-xs">{label}</span>
    </div>
  )
}

function InventoryIngredientRow({
  ingredient,
  remainingQuantityBase,
  batchCount,
}: {
  ingredient: Ingredient
  remainingQuantityBase: number
  batchCount: number
}) {
  return (
    <li className="flex min-h-16 min-w-0 items-center gap-3 rounded-2xl border border-oat-100 bg-[#fdfcf9] px-3 py-2.5 dark:bg-[#121b17]">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700">
        <Package size={18} weight="duotone" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold">{ingredient.name}</strong>
        <span className="mt-0.5 block text-xs text-stone-500">
          {batchCount.toLocaleString('zh-TW')} 個庫存批次
        </span>
      </span>
      <strong className="shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-forest-800">
        {formatBaseQuantity(remainingQuantityBase, ingredient.dimension)}
      </strong>
    </li>
  )
}

function ExpiryBatchRow({
  batch,
  ingredient,
}: {
  batch: DerivedInventoryBatch
  ingredient?: Ingredient
}) {
  const days = expiryDaysFromToday(batch.expiresOn)
  const isExpired = days !== null && days < 0
  const isVerySoon = days !== null && days >= 0 && days <= 2
  const badgeStyle = isExpired
    ? 'bg-tomato-50 text-tomato-700'
    : isVerySoon
      ? 'bg-amber-50 text-amber-700'
      : 'bg-stone-100 text-stone-600'
  const Icon = isExpired ? Warning : ClockCountdown

  return (
    <div className="list-row px-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-oat-100 text-forest-700">
        <Icon size={20} weight="duotone" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-semibold">
          {ingredient?.name ?? '未知食材'}
        </strong>
        <span className="mt-0.5 block text-xs text-stone-500">
          剩餘{' '}
          {formatBaseQuantity(batch.remainingQuantityBase, ingredient?.dimension ?? 'count')}
          {' · '}{formatMoney(batch.remainingCostCents)}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeStyle}`}>
        {formatExpiry(batch.expiresOn)}
      </span>
    </div>
  )
}

function ExpenseBreakdown({
  totalCents,
  categories,
}: {
  totalCents: number
  categories: readonly ExpenseCategorySummary[]
}) {
  const chartLabel = `本月支出分類：${categories
    .map((category) => `${category.label} ${formatPercentage(category.percentage)}`)
    .join('、')}`

  return (
    <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      <div
        className="donut"
        role="img"
        aria-label={chartLabel}
        style={{ background: conicGradient(categories) }}
      >
        <div>
          <span>{formatMoney(totalCents)}</span>
          <small>總支出</small>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-3 text-sm" aria-label="支出分類圖例">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-2.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-stone-600">{category.label}</span>
            <span className="text-right">
              <strong className="block font-mono text-xs font-semibold tabular-nums sm:text-sm">
                {formatPercentage(category.percentage)}
              </strong>
              <small className="block text-[10px] text-stone-500">
                {formatMoney(category.amountCents)}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </div>
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
  const typeLabel = mealTypeLabels[meal.mealType]
  const displayName = meal.note?.trim() || `${typeLabel}記錄`

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[82px] w-full items-center gap-3 px-5 text-left transition-colors hover:bg-forest-50/50 focus-visible:bg-forest-50 sm:px-6"
      aria-label={`編輯${typeLabel}：${displayName}`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-oat-100 text-forest-700">
        <ForkKnife size={20} weight="duotone" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <strong className="truncate text-sm font-semibold">{displayName}</strong>
          <small className="shrink-0 rounded bg-oat-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
            {typeLabel}
          </small>
        </span>
        <span className="mt-1 block text-xs text-stone-500">
          {formatDateTime(meal.occurredAt)} · {ingredientCount.toLocaleString('zh-TW')} 種食材
        </span>
      </span>
      <span className="shrink-0 text-right">
        <strong className="block font-mono text-sm tabular-nums">{formatMoney(costCents)}</strong>
        <small className="text-[10px] text-stone-500">FIFO 成本</small>
      </span>
      <CaretRight size={16} className="hidden shrink-0 text-stone-400 sm:block" aria-hidden="true" />
    </button>
  )
}

function QuickLink({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: AppIcon
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-h-[118px] rounded-2xl border border-oat-200 bg-[#fdfcf9] p-4 text-left transition duration-200 hover:border-forest-200 hover:bg-forest-50 focus-visible:border-forest-500"
    >
      <span className="grid size-9 place-items-center rounded-xl bg-forest-100 text-forest-700 transition-colors group-hover:bg-forest-600 group-hover:text-white">
        <Icon size={19} weight="duotone" aria-hidden="true" />
      </span>
      <strong className="mt-3 block text-sm">{label}</strong>
      <span className="mt-1 block text-xs leading-5 text-stone-500">{hint}</span>
    </button>
  )
}

function compareMealsNewestFirst(left: Meal, right: Meal): number {
  const occurredDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
  if (occurredDifference !== 0) return occurredDifference
  const createdDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt)
  if (createdDifference !== 0) return createdDifference
  return right.id.localeCompare(left.id)
}

function formatSignedMoney(amountCents: number) {
  return amountCents > 0 ? `+ ${formatMoney(amountCents)}` : formatMoney(amountCents)
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-')
  return `${year} 年 ${Number(month)} 月`
}

function formatPercentage(value: number) {
  return `${percentFormatter.format(value)}%`
}

function conicGradient(categories: readonly ExpenseCategorySummary[]) {
  let cursor = 0
  const stops = categories.map((category, index) => {
    const start = cursor
    cursor = index === categories.length - 1 ? 100 : cursor + category.percentage
    return `${category.color} ${start}% ${cursor}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}

export default DashboardPage
