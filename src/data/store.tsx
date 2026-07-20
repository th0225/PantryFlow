import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { InventoryShortageError, recalculateInventory } from '../domain/core'
import type { PantryFlowSnapshot, RecalculatedInventory } from '../domain/types'
import { formatBaseQuantity, formatDateTime } from '../lib/format'
import { loadSnapshot } from './repository'

interface PantryDataContextValue {
  snapshot: PantryFlowSnapshot | null
  derived: RecalculatedInventory | null
  loading: boolean
  pending: boolean
  error: Error | null
  refresh: () => Promise<void>
  mutate: <T>(operation: () => Promise<T>) => Promise<T>
  describeError: (error: unknown) => string
}

const PantryDataContext = createContext<PantryDataContextValue | null>(null)

export function PantryDataProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<PantryFlowSnapshot | null>(null)
  const [derived, setDerived] = useState<RecalculatedInventory | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const nextSnapshot = await loadSnapshot()
      const nextDerived = recalculateInventory(nextSnapshot)
      if (!mountedRef.current) return
      setSnapshot(nextSnapshot)
      setDerived(nextDerived)
      setError(null)
    } catch (caught) {
      if (!mountedRef.current) return
      setError(caught instanceof Error ? caught : new Error('無法讀取本機資料'))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const mutate = useCallback(async <T,>(operation: () => Promise<T>) => {
    setPendingCount((count) => count + 1)
    try {
      const result = await operation()
      await refresh()
      return result
    } finally {
      if (mountedRef.current) setPendingCount((count) => Math.max(0, count - 1))
    }
  }, [refresh])

  const describeError = useCallback((caught: unknown) => {
    if (caught instanceof InventoryShortageError) {
      const ingredient = snapshot?.ingredients.find((item) => item.id === caught.ingredientId)
      const quantity = formatBaseQuantity(
        caught.missingQuantity,
        ingredient?.dimension ?? 'count',
      )
      return `${ingredient?.name ?? '食材'} 在 ${formatDateTime(caught.occurredAt)} 庫存不足，還缺 ${quantity}。請先補登較早的採買，或減少用量。`
    }
    if (caught instanceof DOMException && caught.name === 'QuotaExceededError') {
      return '瀏覽器儲存空間不足，請先匯出備份並清理空間後再試。'
    }
    if (caught instanceof Error && caught.message) return caught.message
    return '操作未完成，請檢查輸入後再試。'
  }, [snapshot])

  const value = useMemo<PantryDataContextValue>(() => ({
    snapshot,
    derived,
    loading,
    pending: pendingCount > 0,
    error,
    refresh,
    mutate,
    describeError,
  }), [snapshot, derived, loading, pendingCount, error, refresh, mutate, describeError])

  return <PantryDataContext.Provider value={value}>{children}</PantryDataContext.Provider>
}

export function usePantryData() {
  const context = useContext(PantryDataContext)
  if (!context) throw new Error('usePantryData 必須在 PantryDataProvider 內使用')
  return context
}
