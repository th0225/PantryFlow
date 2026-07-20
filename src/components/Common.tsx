import type { ReactNode } from 'react'
import { ArrowClockwise, CaretRight, Plus, WarningCircle } from '@phosphor-icons/react'

export type AppIcon = typeof Plus

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  actionIcon: Icon = Plus,
  onAction,
  secondaryAction,
}: {
  eyebrow: string
  title: string
  description: string
  action?: string
  actionIcon?: AppIcon
  onAction?: () => void
  secondaryAction?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title mt-2">{title}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-stone-600">{description}</p>
      </div>
      {(action || secondaryAction) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondaryAction}
          {action && (
            <button type="button" className="primary-button flex-1 sm:flex-none" onClick={onAction}>
              <Icon size={20} weight="bold" />
              {action}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export function SectionHeader({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string
  subtitle?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold tracking-[-0.01em]">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-5 text-stone-500">{subtitle}</p>}
      </div>
      {action && (
        <button type="button" onClick={onAction} className="text-button">
          {action}
          <CaretRight size={14} />
        </button>
      )}
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  required = false,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
}) {
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && (
          <>
            <span className="ml-1 text-tomato-700" aria-hidden="true">*</span>
            <span className="sr-only">（必填）</span>
          </>
        )}
      </label>
      <div data-error-id={errorId}>{children}</div>
      {hint && !error && <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-1.5 text-xs leading-5 text-stone-500">{hint}</p>}
      {error && <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold leading-5 text-tomato-700"><WarningCircle className="mt-0.5 shrink-0" size={15} />{error}</p>}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: AppIcon
  title: string
  description: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-forest-50 text-forest-700">
        <Icon size={27} weight="duotone" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-bold">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500">{description}</p>
      {action && (
        <button type="button" className="secondary-button mt-5" onClick={onAction}>
          <Plus size={17} weight="bold" />
          {action}
        </button>
      )}
    </div>
  )
}

export function LoadingScreen() {
  return (
    <div className="grid min-h-[55dvh] place-items-center px-6 text-center" role="status" aria-live="polite">
      <div>
        <ArrowClockwise size={30} className="mx-auto animate-spin text-forest-600" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-stone-600">正在載入本機資料…</p>
      </div>
    </div>
  )
}

export function InlineAlert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'success' }) {
  const style = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
    : tone === 'success'
      ? 'border-forest-200 bg-forest-50 text-forest-800 dark:border-[#315b4b] dark:bg-[#1a382d] dark:text-[#b9e5d2]'
      : 'border-oat-200 bg-oat-100 text-stone-700 dark:border-[#34463e] dark:bg-[#243129] dark:text-[#d4dbd6]'
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-3 text-sm leading-6 ${style}`}>{children}</div>
}

export const inputClass = 'form-input min-h-12 w-full rounded-xl border-oat-200 bg-[#fdfcf9] px-3.5 text-base text-ink shadow-sm transition-colors placeholder:text-stone-400 focus:border-forest-500 focus:ring-2 focus:ring-forest-600/15 dark:border-[#34463e] dark:bg-[#121b17] dark:text-[#edf3ef] sm:text-sm'
export const selectClass = 'form-select min-h-12 w-full cursor-pointer rounded-xl border-oat-200 bg-[#fdfcf9] px-3.5 text-base text-ink shadow-sm transition-colors focus:border-forest-500 focus:ring-2 focus:ring-forest-600/15 disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-[#fdfcf9] [&>option]:text-ink dark:border-[#34463e] dark:bg-[#121b17] dark:text-[#edf3ef] dark:[&>option]:bg-[#121b17] dark:[&>option]:text-[#edf3ef] sm:text-sm'
export const textareaClass = 'form-textarea min-h-24 w-full resize-y rounded-xl border-oat-200 bg-[#fdfcf9] px-3.5 py-3 text-base text-ink shadow-sm transition-colors placeholder:text-stone-400 focus:border-forest-500 focus:ring-2 focus:ring-forest-600/15 dark:border-[#34463e] dark:bg-[#121b17] dark:text-[#edf3ef] sm:text-sm'
