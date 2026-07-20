import { lazy, Suspense, useEffect, useState } from 'react'
import {
  CaretRight,
  CheckCircle,
  CookingPot,
  ForkKnife,
  Gear,
  House,
  Moon,
  Package,
  Receipt,
  ShoppingBagOpen,
  Sun,
} from '@phosphor-icons/react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Modal } from './components/Dialog'
import { FeedbackProvider } from './components/Feedback'
import { LoadingScreen } from './components/Common'
import { PantryDataProvider } from './data/store'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const LedgerPage = lazy(() => import('./pages/LedgerPage'))
const MealsPage = lazy(() => import('./pages/MealsPage'))
const PurchasesPage = lazy(() => import('./pages/PurchasesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

type IconType = typeof House

const navItems: { to: string; label: string; icon: IconType }[] = [
  { to: '/', label: '首頁', icon: House },
  { to: '/ledger', label: '記帳', icon: Receipt },
  { to: '/purchases', label: '採買', icon: ShoppingBagOpen },
  { to: '/inventory', label: '庫存', icon: Package },
  { to: '/meals', label: '餐點', icon: ForkKnife },
]

const quickActions: { to: string; label: string; hint: string; icon: IconType }[] = [
  { to: '/ledger?new=1', label: '一般交易', hint: '收入或支出', icon: Receipt },
  { to: '/purchases?new=1', label: '食材採買', hint: '同步支出與庫存', icon: ShoppingBagOpen },
  { to: '/meals?new=1', label: '一頓餐點', hint: 'FIFO 計算成本', icon: ForkKnife },
  { to: '/inventory?adjust=1', label: '庫存調減', hint: '過期或盤點短少', icon: Package },
]

function getInitialDarkMode() {
  try {
    const saved = window.localStorage.getItem('pantryflow-theme')
    if (saved) return saved === 'dark'
  } catch {
    // Theme persistence is optional when storage is unavailable.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-forest-600 text-white shadow-sm" aria-hidden="true">
        <CookingPot size={23} weight="fill" />
      </span>
      <span className="text-lg font-bold tracking-[-0.02em] text-ink">PantryFlow</span>
    </div>
  )
}

function ThemeToggle({ darkMode, onToggle }: { darkMode: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-stone-600 transition-colors hover:bg-oat-100 hover:text-ink dark:text-[#b9c1bc] dark:hover:bg-[#243129] dark:hover:text-white"
      aria-label={darkMode ? '切換為淺色模式' : '切換為深色模式'}
      aria-pressed={darkMode}
    >
      {darkMode ? <Sun size={21} weight="duotone" aria-hidden="true" /> : <Moon size={21} weight="duotone" aria-hidden="true" />}
      <span className="flex-1 text-left">{darkMode ? '淺色模式' : '深色模式'}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${darkMode ? 'bg-forest-500' : 'bg-stone-300'}`} aria-hidden="true">
        <span className={`absolute left-1 top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function OfflineReadyCard() {
  return (
    <div className="rounded-2xl border border-forest-100 bg-forest-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-forest-800">
        <CheckCircle size={18} weight="fill" aria-hidden="true" />
        已可離線使用
      </div>
      <p className="mt-1.5 text-xs leading-5 text-stone-600">資料僅儲存在這台裝置，不會上傳雲端。</p>
    </div>
  )
}

function QuickAddModal({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (path: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="想記錄什麼？" description="選擇一個動作開始" size="md">
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map(({ to, label, hint, icon: Icon }, index) => (
          <button
            key={to}
            type="button"
            data-autofocus={index === 0 || undefined}
            onClick={() => onSelect(to)}
            className="rounded-2xl border border-oat-200 p-4 text-left transition-colors hover:border-forest-200 hover:bg-forest-50"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-forest-100 text-forest-700">
              <Icon size={20} weight="duotone" aria-hidden="true" />
            </span>
            <strong className="mt-3 block text-sm">{label}</strong>
            <span className="mt-1 block text-xs leading-5 text-stone-500">{hint}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function MobileMenu({
  open,
  onClose,
  onOpenSettings,
  offlineReady,
}: {
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
  offlineReady: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title="更多" description="設定與本機資料狀態" size="sm">
      <button
        type="button"
        data-autofocus
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-forest-50 px-4 text-left font-semibold text-forest-800 transition-colors hover:bg-forest-100"
        onClick={onOpenSettings}
      >
        <Gear size={21} aria-hidden="true" />
        <span className="flex-1">設定與資料管理</span>
        <CaretRight size={17} aria-hidden="true" />
      </button>
      {offlineReady && (
        <div className="mt-3">
          <OfflineReadyCard />
        </div>
      )}
    </Modal>
  )
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [quickOpen, setQuickOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [darkMode, setDarkMode] = useState(getInitialDarkMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#101713' : '#1f5c4a')
    try {
      window.localStorage.setItem('pantryflow-theme', darkMode ? 'dark' : 'light')
    } catch {
      // The selected theme still applies for this session.
    }
  }, [darkMode])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let active = true
    void navigator.serviceWorker.ready
      .then(() => {
        if (active) setOfflineReady(true)
      })
      .catch(() => {
        // Offline status remains hidden when registration is unavailable.
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setQuickOpen(false)
    setMenuOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [location.pathname])

  const selectQuickAction = (path: string) => {
    setQuickOpen(false)
    navigate(path)
  }

  const openSettings = () => {
    setMenuOpen(false)
    navigate('/settings')
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-canvas text-ink transition-colors duration-200 dark:bg-[#101713]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-oat-200 bg-[#fbfaf6] p-5 dark:border-[#2a3932] dark:bg-[#121b17] lg:flex">
        <Logo />
        <nav className="mt-10 space-y-1.5" aria-label="主要導覽">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
              {({ isActive }) => (
                <>
                  <Icon size={21} weight={isActive ? 'fill' : 'duotone'} aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <ThemeToggle darkMode={darkMode} onToggle={() => setDarkMode((value) => !value)} />
        </div>
        {offlineReady && (
          <div className="mt-3">
            <OfflineReadyCard />
          </div>
        )}
        <NavLink to="/settings" className={({ isActive }) => `nav-item mt-3 ${isActive ? 'nav-item-active' : ''}`}>
          {({ isActive }) => (
            <>
              <Gear size={21} weight={isActive ? 'fill' : 'duotone'} aria-hidden="true" />
              <span>設定與資料</span>
            </>
          )}
        </NavLink>
      </aside>

      <header className="sticky top-0 z-20 border-b border-oat-200/80 bg-canvas/90 px-4 py-3 backdrop-blur-md dark:border-[#2a3932] dark:bg-[#101713]/90 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="icon-button"
              onClick={() => setDarkMode((value) => !value)}
              aria-label={darkMode ? '切換為淺色模式' : '切換為深色模式'}
              aria-pressed={darkMode}
            >
              {darkMode ? <Sun size={22} aria-hidden="true" /> : <Moon size={22} aria-hidden="true" />}
            </button>
            <button type="button" className="icon-button" onClick={() => setMenuOpen(true)} aria-label="開啟設定選單" aria-expanded={menuOpen}>
              <Gear size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="pb-28 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 lg:ml-[248px] lg:pb-10">
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<DashboardPage onQuickAdd={() => setQuickOpen(true)} />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/meals" element={<MealsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-oat-200 bg-[#fbfaf6]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-lg dark:border-[#2a3932] dark:bg-[#121b17]/95 lg:hidden"
        aria-label="主要導覽"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `bottom-nav-item ${isActive ? 'bottom-nav-active' : ''}`}>
              {({ isActive }) => (
                <>
                  <Icon size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <QuickAddModal open={quickOpen} onClose={() => setQuickOpen(false)} onSelect={selectQuickAction} />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} onOpenSettings={openSettings} offlineReady={offlineReady} />
    </div>
  )
}

export default function App() {
  return (
    <FeedbackProvider>
      <PantryDataProvider>
        <AppShell />
      </PantryDataProvider>
    </FeedbackProvider>
  )
}
