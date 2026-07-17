import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BowlFood,
  CalendarBlank,
  CaretDown,
  CaretRight,
  ChartLineUp,
  Check,
  CheckCircle,
  Clock,
  CookingPot,
  CurrencyCircleDollar,
  Database,
  DownloadSimple,
  ForkKnife,
  Gear,
  House,
  List,
  MagnifyingGlass,
  Moon,
  Package,
  Plus,
  Receipt,
  ShoppingBagOpen,
  SlidersHorizontal,
  Sparkle,
  Storefront,
  Sun,
  Tag,
  Trash,
  TrendDown,
  TrendUp,
  UploadSimple,
  Warning,
  X,
} from '@phosphor-icons/react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

type IconType = typeof House

const navItems: { to: string; label: string; icon: IconType }[] = [
  { to: '/', label: '首頁', icon: House },
  { to: '/ledger', label: '記帳', icon: Receipt },
  { to: '/purchases', label: '採買', icon: ShoppingBagOpen },
  { to: '/inventory', label: '庫存', icon: Package },
  { to: '/meals', label: '餐點', icon: ForkKnife },
]

const formatMoney = (value: number) =>
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 2 }).format(value)

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-forest-600 text-white shadow-sm" aria-hidden="true">
        <CookingPot size={23} weight="fill" />
      </span>
      {!compact && (
        <span className="text-lg font-bold tracking-[-0.02em] text-ink">PantryFlow</span>
      )}
    </div>
  )
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [quickOpen, setQuickOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('pantryflow-theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light'
    localStorage.setItem('pantryflow-theme', darkMode ? 'dark' : 'light')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#101713' : '#1f5c4a')
  }, [darkMode])

  useEffect(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true })
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-canvas text-ink transition-colors duration-200 dark:bg-[#101713]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-oat-200 bg-[#fbfaf6] p-5 dark:border-[#2a3932] dark:bg-[#121b17] lg:flex">
        <Logo />
        <nav className="mt-10 space-y-1.5" aria-label="主要導覽">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
              <Icon size={21} weight="duotone" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <ThemeToggle darkMode={darkMode} onToggle={() => setDarkMode((value) => !value)} />
        </div>
        <div className="mt-3 rounded-2xl border border-forest-100 bg-forest-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-forest-800">
            <CheckCircle size={18} weight="fill" />
            已可離線使用
          </div>
          <p className="mt-1.5 text-xs leading-5 text-stone-600">資料僅儲存在這台裝置，不會上傳雲端。</p>
        </div>
        <NavLink to="/settings" className="nav-item mt-3">
          <Gear size={21} weight="duotone" />
          <span>設定與資料</span>
        </NavLink>
      </aside>

      <header className="sticky top-0 z-20 border-b border-oat-200/80 bg-canvas/90 px-4 py-3 backdrop-blur-md dark:border-[#2a3932] dark:bg-[#101713]/90 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1">
            <button type="button" className="icon-button" onClick={() => setDarkMode((value) => !value)} aria-label={darkMode ? '切換為淺色模式' : '切換為深色模式'} aria-pressed={darkMode}>
              {darkMode ? <Sun size={22} /> : <Moon size={22} />}
            </button>
            <button type="button" className="icon-button" onClick={() => setMenuOpen(true)} aria-label="開啟設定選單">
              <Gear size={22} />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="pb-28 outline-none lg:ml-[248px] lg:pb-10">
        <Routes>
          <Route path="/" element={<Dashboard onQuickAdd={() => setQuickOpen(true)} />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/meals" element={<MealsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Dashboard onQuickAdd={() => setQuickOpen(true)} />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-oat-200 bg-[#fbfaf6]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-lg dark:border-[#2a3932] dark:bg-[#121b17]/95 lg:hidden" aria-label="主要導覽">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `bottom-nav-item ${isActive ? 'bottom-nav-active' : ''}`}>
              <Icon size={22} weight={location.pathname === to ? 'fill' : 'regular'} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <QuickAdd open={quickOpen} onClose={() => setQuickOpen(false)} onSelect={(path) => { setQuickOpen(false); navigate(path) }} />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}

function ThemeToggle({ darkMode, onToggle }: { darkMode: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-stone-600 transition-colors hover:bg-oat-100 hover:text-ink dark:text-[#b9c1bc] dark:hover:bg-[#243129] dark:hover:text-white" aria-pressed={darkMode}>
      {darkMode ? <Sun size={21} weight="duotone" /> : <Moon size={21} weight="duotone" />}
      <span className="flex-1 text-left">{darkMode ? '淺色模式' : '深色模式'}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${darkMode ? 'bg-forest-500' : 'bg-stone-300'}`} aria-hidden="true">
        <span className={`absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function Dashboard({ onQuickAdd }: { onQuickAdd: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="page-shell">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow"><span className="size-2 rounded-full bg-forest-500" />7 月 17 日・星期五</div>
          <h1 className="page-title mt-2">儀表板</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-stone-600">本月收支穩定，冰箱裡有 3 項食材需要優先使用。</p>
        </div>
        <button type="button" className="primary-button shrink-0" onClick={onQuickAdd}>
          <Plus size={20} weight="bold" />快速新增
        </button>
      </section>

      <section className="mt-7 grid gap-4 md:grid-cols-12" aria-label="本月收支摘要">
        <article className="relative overflow-hidden rounded-3xl bg-forest-700 p-6 text-white shadow-card md:col-span-6">
          <div className="absolute -right-10 -top-16 size-44 rounded-full border-[28px] border-white/5" aria-hidden="true" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-forest-100">本月收支差額</p>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-forest-50">2026 年 7 月</span>
            </div>
            <p className="mt-5 font-mono text-[2rem] font-semibold tracking-[-0.04em] tabular-nums">+ {formatMoney(27979)}</p>
            <div className="mt-6 flex items-center gap-2 text-sm text-forest-100">
              <TrendUp size={18} weight="bold" />比上月多結餘 {formatMoney(3480)}
            </div>
          </div>
        </article>
        <MetricCard label="收入" value={46800} icon={ArrowDown} tone="green" detail="2 筆交易" />
        <MetricCard label="支出" value={18821} icon={ArrowUp} tone="orange" detail="12 筆交易" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <article className="card p-5 sm:p-6">
          <SectionHeader title="庫存概況" subtitle="目前有 12 種食材可使用" action="查看全部" onAction={() => navigate('/inventory')} />
          <div className="mt-5 grid grid-cols-3 gap-3">
            <InventoryStat value="12" label="有庫存" tone="green" />
            <InventoryStat value="3" label="即將到期" tone="amber" />
            <InventoryStat value="1" label="已過期" tone="red" />
          </div>
          <div className="mt-5 space-y-2.5">
            <ExpiryItem name="嫩豆腐" amount="1 盒" date="今天到期" status="urgent" icon={BowlFood} />
            <ExpiryItem name="青江菜" amount="280 g" date="明天到期" status="soon" icon={Sparkle} />
            <ExpiryItem name="鮮奶" amount="620 ml" date="剩 3 天" status="normal" icon={Package} />
          </div>
        </article>

        <article className="card p-5 sm:p-6">
          <SectionHeader title="本月支出" subtitle="依分類" action="明細" onAction={() => navigate('/ledger')} />
          <div className="mt-6 flex items-center gap-6">
            <div className="donut" role="img" aria-label="本月支出：食材 49%、餐飲 22%、交通 17%、其他 12%">
              <div><span>{formatMoney(18821)}</span><small>總支出</small></div>
            </div>
            <ul className="min-w-0 flex-1 space-y-3 text-sm">
              <Legend color="bg-forest-600" label="食材" value="49%" />
              <Legend color="bg-amber-500" label="餐飲" value="22%" />
              <Legend color="bg-[#799a8e]" label="交通" value="17%" />
              <Legend color="bg-oat-300" label="其他" value="12%" />
            </ul>
          </div>
        </article>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="card overflow-hidden">
          <div className="p-5 pb-3 sm:p-6 sm:pb-4">
            <SectionHeader title="最近餐點" subtitle="FIFO 計算的實際食材成本" action="新增餐點" onAction={() => navigate('/meals')} />
          </div>
          <div className="divide-y divide-oat-100">
            <MealRow type="晚餐" name="番茄豆腐蛋" time="昨天 19:12" cost={72.4} icon={CookingPot} />
            <MealRow type="午餐" name="雞肉蔬菜便當" time="昨天 12:25" cost={93.18} icon={BowlFood} />
            <MealRow type="早餐" name="鮮奶燕麥" time="7 月 15 日 08:10" cost={38.6} icon={ForkKnife} />
          </div>
        </article>

        <article className="card p-5 sm:p-6">
          <SectionHeader title="常用操作" subtitle="把日常記錄變得更順手" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <QuickLink icon={Receipt} label="記一筆帳" hint="收入或支出" onClick={() => navigate('/ledger')} />
            <QuickLink icon={ShoppingBagOpen} label="新增採買" hint="同步庫存與支出" onClick={() => navigate('/purchases')} />
            <QuickLink icon={ForkKnife} label="記錄餐點" hint="自動計算餐費" onClick={() => navigate('/meals')} />
            <QuickLink icon={Package} label="庫存調減" hint="過期、丟棄或盤點" onClick={() => navigate('/inventory')} />
          </div>
        </article>
      </section>
    </div>
  )
}

function MetricCard({ label, value, icon: Icon, tone, detail }: { label: string; value: number; icon: IconType; tone: 'green' | 'orange'; detail: string }) {
  return (
    <article className="card flex min-h-[160px] flex-col justify-between p-5 md:col-span-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-stone-600">{label}</p>
        <span className={`grid size-9 place-items-center rounded-xl ${tone === 'green' ? 'bg-forest-50 text-forest-700' : 'bg-amber-50 text-amber-700'}`}><Icon size={18} weight="bold" /></span>
      </div>
      <div>
        <p className="font-mono text-xl font-semibold tabular-nums text-ink">{formatMoney(value)}</p>
        <p className="mt-1 text-xs text-stone-500">{detail}</p>
      </div>
    </article>
  )
}

function InventoryStat({ value, label, tone }: { value: string; label: string; tone: 'green' | 'amber' | 'red' }) {
  const styles = { green: 'bg-forest-50 text-forest-800', amber: 'bg-amber-50 text-amber-700', red: 'bg-tomato-50 text-tomato-700' }
  return <div className={`rounded-2xl px-3 py-4 text-center ${styles[tone]}`}><strong className="block text-2xl tabular-nums">{value}</strong><span className="mt-1 block text-xs font-medium">{label}</span></div>
}

function ExpiryItem({ name, amount, date, status, icon: Icon }: { name: string; amount: string; date: string; status: 'urgent' | 'soon' | 'normal'; icon: IconType }) {
  const badge = { urgent: 'bg-tomato-50 text-tomato-700', soon: 'bg-amber-50 text-amber-700', normal: 'bg-stone-100 text-stone-600' }
  return (
    <button type="button" className="list-row w-full text-left">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-oat-100 text-forest-700"><Icon size={20} weight="duotone" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">{name}</strong><span className="mt-0.5 block text-xs text-stone-500">剩餘 {amount}</span></span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge[status]}`}>{date}</span>
      <CaretRight size={16} className="text-stone-400" />
    </button>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return <li className="flex items-center gap-2.5"><span className={`size-2.5 rounded-full ${color}`} /><span className="flex-1 text-stone-600">{label}</span><strong className="font-mono font-semibold tabular-nums">{value}</strong></li>
}

function MealRow({ type, name, time, cost, icon: Icon }: { type: string; name: string; time: string; cost: number; icon: IconType }) {
  return (
    <button type="button" className="flex min-h-[76px] w-full items-center gap-3 px-5 text-left transition-colors hover:bg-forest-50/50 focus-visible:bg-forest-50 sm:px-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-oat-100 text-forest-700"><Icon size={20} weight="duotone" /></span>
      <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm font-semibold">{name}</strong><small className="rounded bg-oat-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">{type}</small></span><span className="mt-1 block text-xs text-stone-500">{time}</span></span>
      <span className="text-right"><strong className="block font-mono text-sm tabular-nums">{formatMoney(cost)}</strong><small className="text-[10px] text-stone-500">食材成本</small></span>
    </button>
  )
}

function QuickLink({ icon: Icon, label, hint, onClick }: { icon: IconType; label: string; hint: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group min-h-[118px] rounded-2xl border border-oat-200 bg-[#fdfcf9] p-4 text-left transition duration-200 hover:border-forest-200 hover:bg-forest-50 focus-visible:border-forest-500"><span className="grid size-9 place-items-center rounded-xl bg-forest-100 text-forest-700 transition-colors group-hover:bg-forest-600 group-hover:text-white"><Icon size={19} weight="duotone" /></span><strong className="mt-3 block text-sm">{label}</strong><span className="mt-1 block text-xs leading-5 text-stone-500">{hint}</span></button>
}

function SectionHeader({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-bold tracking-[-0.01em]">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-stone-500">{subtitle}</p>}</div>{action && <button type="button" onClick={onAction} className="text-button">{action}<CaretRight size={14} /></button>}</div>
}

function PageHeader({ eyebrow, title, description, action, icon: Icon = Plus }: { eyebrow: string; title: string; description: string; action?: string; icon?: IconType }) {
  return <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title mt-2">{title}</h1><p className="mt-2 max-w-2xl text-[15px] leading-6 text-stone-600">{description}</p></div>{action && <button type="button" className="primary-button shrink-0"><Icon size={20} weight="bold" />{action}</button>}</section>
}

function LedgerPage() {
  const rows = [
    ['7/16', '全聯食材採買', '食材', -1286, 'purchase'], ['7/15', '七月薪資', '薪資', 46800, 'income'], ['7/14', '捷運加值', '交通', -500, 'expense'], ['7/12', '朋友聚餐', '餐飲', -1260, 'expense'], ['7/10', '居家用品', '居家', -846, 'expense'],
  ] as const
  return <div className="page-shell"><PageHeader eyebrow="LEDGER" title="記帳" description="檢視收入與支出；採買產生的食材支出會與採買單保持同步。" action="新增交易" />
    <section className="mt-7 grid grid-cols-3 gap-3"><SummaryMini label="收入" value={46800} tone="green" /><SummaryMini label="支出" value={18821} tone="red" /><SummaryMini label="差額" value={27979} tone="dark" /></section>
    <section className="card mt-4 overflow-hidden"><div className="flex flex-col gap-3 border-b border-oat-100 p-4 sm:flex-row sm:items-center"><label className="search-field flex-1"><MagnifyingGlass size={18} /><span className="sr-only">搜尋交易</span><input type="search" placeholder="搜尋備註或分類" /></label><div className="flex gap-2"><FilterButton icon={CalendarBlank}>2026 年 7 月</FilterButton><FilterButton icon={SlidersHorizontal}>全部</FilterButton></div></div>
      <div className="divide-y divide-oat-100">{rows.map(([date, note, category, amount, type]) => <div key={note} className="flex min-h-[76px] items-center gap-3 px-4 sm:px-5"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${amount > 0 ? 'bg-forest-50 text-forest-700' : 'bg-oat-100 text-stone-600'}`}>{amount > 0 ? <ArrowDown size={18} weight="bold" /> : type === 'purchase' ? <ShoppingBagOpen size={19} /> : <ArrowUp size={18} />}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{note}</strong><span className="mt-1 block text-xs text-stone-500">{date} · {category}{type === 'purchase' ? ' · 連結採買單' : ''}</span></div><strong className={`font-mono text-sm tabular-nums ${amount > 0 ? 'text-forest-700' : 'text-ink'}`}>{amount > 0 ? '+' : '−'} {formatMoney(Math.abs(amount))}</strong><button type="button" className="icon-button-sm" aria-label={`編輯 ${note}`}><CaretRight size={17} /></button></div>)}</div>
    </section>
  </div>
}

function PurchasesPage() {
  return <div className="page-shell"><PageHeader eyebrow="PURCHASES" title="食材採買" description="一張採買單同時建立食材支出與獨立庫存批次，折扣差額也會精確分攤。" action="新增採買" icon={ShoppingBagOpen} />
    <div className="mt-7 grid gap-4 lg:grid-cols-[1fr_320px]"><section className="card overflow-hidden"><div className="border-b border-oat-100 p-5"><SectionHeader title="近期採買" subtitle="共 4 張採買單" /></div>{[
      ['全聯福利中心','7 月 16 日','4 項食材',1286],['東門市場','7 月 11 日','6 項食材',842],['家樂福','7 月 6 日','5 項食材',1643],['全聯福利中心','7 月 2 日','3 項食材',698]
    ].map(([store,date,count,total]) => <button key={String(date)} type="button" className="flex min-h-[84px] w-full items-center gap-3 border-b border-oat-100 px-5 text-left transition-colors last:border-0 hover:bg-forest-50/50"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700"><Storefront size={22} weight="duotone" /></span><span className="flex-1"><strong className="block text-sm">{store}</strong><span className="mt-1 block text-xs text-stone-500">{date} · {count}</span></span><strong className="font-mono text-sm tabular-nums">{formatMoney(Number(total))}</strong><CaretRight size={17} className="text-stone-400" /></button>)}</section>
      <aside className="rounded-3xl bg-forest-700 p-6 text-white shadow-card"><ShoppingBagOpen size={30} weight="duotone" className="text-forest-100" /><h2 className="mt-5 text-lg font-bold">本月食材採買</h2><p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{formatMoney(4469)}</p><div className="mt-6 border-t border-white/10 pt-5 text-sm text-forest-100"><div className="flex justify-between"><span>採買次數</span><strong className="text-white">4 次</strong></div><div className="mt-3 flex justify-between"><span>平均每次</span><strong className="text-white">{formatMoney(1117.25)}</strong></div></div></aside>
    </div>
  </div>
}

function InventoryPage() {
  const items = [
    ['雞胸肉','1.2 kg','冷凍','7/30',72],['雞蛋','8 個','常溫','7/25',58],['鮮奶','620 ml','冷藏','7/20',44],['青江菜','280 g','冷藏','7/18',22],['嫩豆腐','1 盒','冷藏','今天',15],['燕麥片','860 g','常溫','9/12',96],
  ] as const
  return <div className="page-shell"><PageHeader eyebrow="INVENTORY" title="食材與庫存" description="依食材與採買批次查看剩餘數量、效期與成本，所有耗用都遵循 FIFO。" action="新增調減" icon={Package} />
    <div className="mt-7 flex flex-col gap-3 sm:flex-row"><label className="search-field flex-1"><MagnifyingGlass size={18} /><span className="sr-only">搜尋食材</span><input type="search" placeholder="搜尋食材" /></label><FilterButton icon={SlidersHorizontal}>有庫存 · 依效期</FilterButton></div>
    <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(([name,amount,storage,expiry,cost]) => <article key={name} className="card group p-5"><div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-2xl bg-forest-50 text-forest-700"><Package size={22} weight="duotone" /></span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${expiry === '今天' ? 'bg-tomato-50 text-tomato-700' : expiry === '7/18' ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>{expiry === '今天' ? '今天到期' : `效期 ${expiry}`}</span></div><h2 className="mt-4 font-bold">{name}</h2><p className="mt-1 text-sm text-stone-500">剩餘 <strong className="text-ink">{amount}</strong> · {storage}</p><div className="mt-4 flex items-center justify-between border-t border-oat-100 pt-4"><span className="text-xs text-stone-500">剩餘成本</span><strong className="font-mono text-sm tabular-nums">{formatMoney(Number(cost))}</strong></div></article>)}</section>
  </div>
}

function MealsPage() {
  return <div className="page-shell"><PageHeader eyebrow="MEALS" title="餐點" description="記錄實際使用量，系統會從最早購入的批次扣料並計算真實食材成本。" action="記錄餐點" icon={ForkKnife} />
    <section className="mt-7 grid gap-4 lg:grid-cols-[1fr_340px]"><div className="card overflow-hidden"><div className="border-b border-oat-100 p-5"><SectionHeader title="最近餐點" subtitle="2026 年 7 月" /></div>{[
      ['晚餐','番茄豆腐蛋','昨天 19:12','3 種食材',72.4],['午餐','雞肉蔬菜便當','昨天 12:25','4 種食材',93.18],['早餐','鮮奶燕麥','7 月 15 日 08:10','2 種食材',38.6],['晚餐','清炒時蔬雞肉','7 月 14 日 18:45','3 種食材',86.25]
    ].map(([type,name,time,count,cost]) => <button type="button" key={String(name)} className="flex min-h-[86px] w-full items-center gap-3 border-b border-oat-100 px-5 text-left transition-colors last:border-0 hover:bg-forest-50/50"><span className="grid size-11 place-items-center rounded-xl bg-oat-100 text-forest-700"><ForkKnife size={21} weight="duotone" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{name}</strong><span className="mt-1 block text-xs text-stone-500">{type} · {time} · {count}</span></span><span className="text-right"><strong className="block font-mono text-sm tabular-nums">{formatMoney(Number(cost))}</strong><small className="text-[10px] text-stone-500">食材成本</small></span><CaretRight size={17} className="text-stone-400" /></button>)}</div>
      <aside className="card p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><ChartLineUp size={21} /></span><div><h2 className="font-bold">本月餐費</h2><p className="text-xs text-stone-500">已記錄 18 餐</p></div></div><p className="mt-6 font-mono text-3xl font-semibold tabular-nums">{formatMoney(1836.42)}</p><div className="mt-5 rounded-2xl bg-forest-50 p-4 text-sm text-forest-800"><div className="flex items-center gap-2 font-semibold"><TrendDown size={18} weight="bold" />平均每餐 {formatMoney(102.02)}</div><p className="mt-1.5 text-xs leading-5 text-forest-700">比上月平均少 {formatMoney(12.6)}</p></div></aside>
    </section>
  </div>
}

function SettingsPage() {
  return <div className="page-shell max-w-5xl"><PageHeader eyebrow="SETTINGS" title="設定與資料管理" description="管理收支分類、備份本機資料，或在需要時還原完整資料庫。" />
    <section className="mt-7 grid gap-4 md:grid-cols-2"><SettingsCard icon={Tag} title="收支分類" description="新增、改名、設定顏色或停用分類。" action="管理分類" /><SettingsCard icon={DownloadSimple} title="匯出備份" description="下載包含完整來源資料的 JSON 檔案。" action="匯出 JSON" /><SettingsCard icon={UploadSimple} title="還原資料" description="驗證格式與 FIFO 後，整庫取代目前資料。" action="選擇備份檔" /><SettingsCard icon={Database} title="清除全部資料" description="永久移除這台裝置上的所有 PantryFlow 資料。" action="清除資料" danger /></section>
  </div>
}

function SettingsCard({ icon: Icon, title, description, action, danger = false }: { icon: IconType; title: string; description: string; action: string; danger?: boolean }) {
  return <article className="card p-6"><span className={`grid size-11 place-items-center rounded-xl ${danger ? 'bg-tomato-50 text-tomato-700' : 'bg-forest-50 text-forest-700'}`}><Icon size={22} weight="duotone" /></span><h2 className="mt-4 font-bold">{title}</h2><p className="mt-2 min-h-[44px] text-sm leading-6 text-stone-600">{description}</p><button type="button" className={`mt-5 ${danger ? 'danger-button' : 'secondary-button'}`}>{action}<ArrowRight size={16} /></button></article>
}

function SummaryMini({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' | 'dark' }) {
  const tones = { green: 'bg-forest-50 text-forest-800', red: 'bg-tomato-50 text-tomato-700', dark: 'bg-forest-700 text-white' }
  return <div className={`rounded-2xl p-4 sm:p-5 ${tones[tone]}`}><span className="text-xs font-medium opacity-75">{label}</span><strong className="mt-2 block truncate font-mono text-sm tabular-nums sm:text-lg">{tone === 'dark' ? '+ ' : ''}{formatMoney(value)}</strong></div>
}

function FilterButton({ icon: Icon, children }: { icon: IconType; children: ReactNode }) {
  return <button type="button" className="filter-button"><Icon size={17} /><span>{children}</span><CaretDown size={14} /></button>
}

function QuickAdd({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (path: string) => void }) {
  const titleId = useId()
  useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey) }, [open, onClose])
  if (!open) return null
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="flex items-center justify-between"><div><h2 id={titleId} className="text-xl font-bold">想記錄什麼？</h2><p className="mt-1 text-sm text-stone-500">選擇一個動作開始</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="關閉"><X size={21} /></button></div><div className="mt-6 grid grid-cols-2 gap-3"><ModalAction icon={Receipt} label="一般交易" hint="收入或支出" onClick={() => onSelect('/ledger')} /><ModalAction icon={ShoppingBagOpen} label="食材採買" hint="同步支出與庫存" onClick={() => onSelect('/purchases')} /><ModalAction icon={ForkKnife} label="一頓餐點" hint="FIFO 計算成本" onClick={() => onSelect('/meals')} /><ModalAction icon={Package} label="庫存調減" hint="過期或盤點短少" onClick={() => onSelect('/inventory')} /></div></section></div>
}

function ModalAction({ icon: Icon, label, hint, onClick }: { icon: IconType; label: string; hint: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-2xl border border-oat-200 p-4 text-left transition-colors hover:border-forest-200 hover:bg-forest-50"><span className="grid size-10 place-items-center rounded-xl bg-forest-100 text-forest-700"><Icon size={20} weight="duotone" /></span><strong className="mt-3 block text-sm">{label}</strong><span className="mt-1 block text-xs leading-5 text-stone-500">{hint}</span></button>
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  if (!open) return null
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="bottom-sheet" role="dialog" aria-modal="true" aria-label="設定選單"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">更多</h2><button type="button" className="icon-button" onClick={onClose} aria-label="關閉"><X size={21} /></button></div><button type="button" className="mt-5 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-forest-50 px-4 text-left font-semibold text-forest-800" onClick={() => navigate('/settings')}><Gear size={21} /><span className="flex-1">設定與資料管理</span><CaretRight size={17} /></button><div className="mt-3 flex items-center gap-3 rounded-2xl border border-oat-200 p-4"><CheckCircle size={22} weight="fill" className="text-forest-600" /><div><strong className="text-sm">已可離線使用</strong><p className="mt-0.5 text-xs text-stone-500">資料僅儲存在這台裝置</p></div></div></section></div>
}

export default function App() { return <AppShell /> }
