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
import { createPortal } from 'react-dom'

export const FEEDBACK_DURATION_MS = 4_000

export type FeedbackType = 'success' | 'error' | 'info'

export interface FeedbackOptions {
  description?: ReactNode
}

export interface FeedbackToast {
  id: string
  type: FeedbackType
  message: ReactNode
  description?: ReactNode
}

interface FeedbackApi {
  notify: (type: FeedbackType, message: ReactNode, options?: FeedbackOptions) => string
  success: (message: ReactNode, options?: FeedbackOptions) => string
  error: (message: ReactNode, options?: FeedbackOptions) => string
  info: (message: ReactNode, options?: FeedbackOptions) => string
  dismiss: (id: string) => void
}

export interface ToastHostProps {
  toasts: readonly FeedbackToast[]
  onDismiss: (id: string) => void
}

const FeedbackContext = createContext<FeedbackApi | null>(null)

let toastSequence = 0

const toastStyles: Record<FeedbackType, { border: string; icon: string }> = {
  success: {
    border: 'border-forest-200',
    icon: 'bg-forest-50 text-forest-700',
  },
  error: {
    border: 'border-red-200 dark:border-[#6b3932]',
    icon: 'bg-tomato-50 text-tomato-700',
  },
  info: {
    border: 'border-oat-200',
    icon: 'bg-amber-50 text-amber-700',
  },
}

const toastTypeLabels: Record<FeedbackType, string> = {
  success: '成功',
  error: '錯誤',
  info: '資訊',
}

function ToastIcon({ type }: { type: FeedbackType }) {
  if (type === 'success') {
    return (
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    )
  }

  if (type === 'error') {
    return (
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 17h.01" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </svg>
  )
}

export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <ol
      className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col gap-2 sm:left-auto sm:right-5 sm:w-full sm:max-w-sm"
      aria-label="通知"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {toasts.map((toast) => {
        const styles = toastStyles[toast.type]
        return (
          <li
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-atomic="true"
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-[#fdfcf9] p-4 shadow-card dark:bg-[#17221d] ${styles.border}`}
          >
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${styles.icon}`}>
              <ToastIcon type={toast.type} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-bold leading-5 text-ink">
                <span className="sr-only">{toastTypeLabels[toast.type]}：</span>
                {toast.message}
              </p>
              {toast.description !== undefined && toast.description !== null && (
                <div className="mt-1 text-xs leading-5 text-stone-600">{toast.description}</div>
              )}
            </div>
            <button type="button" className="icon-button-sm -mr-2 -mt-2" onClick={() => onDismiss(toast.id)} aria-label="關閉通知">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        )
      })}
    </ol>,
    document.body,
  )
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<FeedbackToast[]>([])
  const timersRef = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timersRef.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((type: FeedbackType, message: ReactNode, options: FeedbackOptions = {}) => {
    toastSequence += 1
    const id = `feedback-${Date.now()}-${toastSequence}`
    const toast: FeedbackToast = { id, type, message, description: options.description }

    setToasts((current) => [...current, toast])
    const timer = window.setTimeout(() => {
      timersRef.current.delete(id)
      setToasts((current) => current.filter((item) => item.id !== id))
    }, FEEDBACK_DURATION_MS)
    timersRef.current.set(id, timer)

    return id
  }, [])

  const api = useMemo<FeedbackApi>(
    () => ({
      notify,
      success: (message, options) => notify('success', message, options),
      error: (message, options) => notify('error', message, options),
      info: (message, options) => notify('info', message, options),
      dismiss,
    }),
    [dismiss, notify],
  )

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current.clear()
    },
    [],
  )

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const context = useContext(FeedbackContext)
  if (!context) throw new Error('useFeedback 必須在 FeedbackProvider 內使用')
  return context
}

export const ToastProvider = FeedbackProvider
export const useToast = useFeedback
