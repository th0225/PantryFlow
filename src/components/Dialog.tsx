import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const focusableSelector = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) =>
      !element.matches(':disabled') &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]'),
  )
}

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: ModalSize
  initialFocusRef?: { readonly current: HTMLElement | null }
  closeLabel?: string
  closeOnBackdrop?: boolean
  dismissible?: boolean
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

let bodyScrollLockCount = 0
let bodyOverflowBeforeLock = ''

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  closeLabel = '關閉對話框',
  closeOnBackdrop = true,
  dismissible = true,
}: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  const hasDescription = description !== undefined && description !== null && description !== false

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    dismissibleRef.current = dismissible
  }, [dismissible])

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    if (!dialog) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const requestedTarget = initialFocusRef?.current
    const initialTarget =
      (requestedTarget && dialog.contains(requestedTarget) && !requestedTarget.matches(':disabled')
        ? requestedTarget
        : null) ??
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      getFocusableElements(dialog)[0] ??
      dialog

    initialTarget.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
        event.preventDefault()
        lastElement.focus({ preventScroll: true })
      } else if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
        event.preventDefault()
        firstElement.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      const returnTarget = previouslyFocused?.isConnected
        ? previouslyFocused
        : document.getElementById('main-content')
      returnTarget?.focus({ preventScroll: true })
    }
  }, [initialFocusRef, open])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    if (bodyScrollLockCount === 0) bodyOverflowBeforeLock = document.body.style.overflow
    bodyScrollLockCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)
      if (bodyScrollLockCount === 0) document.body.style.overflow = bodyOverflowBeforeLock
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (dismissible && closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hasDescription ? descriptionId : undefined}
        tabIndex={-1}
        className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-oat-200 bg-[#fdfcf9] shadow-2xl dark:border-[#2a3932] dark:bg-[#17221d] sm:rounded-3xl ${sizeClasses[size]}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-oat-100 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-xl font-bold tracking-[-0.02em] text-ink [overflow-wrap:anywhere]">
              {title}
            </h2>
            {hasDescription && (
              <div id={descriptionId} className="mt-1.5 break-words text-sm leading-6 text-stone-600 [overflow-wrap:anywhere]">
                {description}
              </div>
            )}
          </div>
          <button type="button" className="icon-button -mr-2 -mt-2" onClick={onClose} aria-label={closeLabel} disabled={!dismissible}>
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {children !== undefined && children !== null && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        )}

        {footer !== undefined && footer !== null && (
          <footer className="flex shrink-0 flex-col gap-2 border-t border-oat-100 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:px-6 sm:pb-5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: ReactNode
  description: ReactNode
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  pending?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = '確認',
  cancelLabel = '取消',
  tone = 'primary',
  pending = false,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const closeUnlessPending = () => {
    if (!pending) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={closeUnlessPending}
      title={title}
      description={description}
      size="sm"
      initialFocusRef={cancelButtonRef}
      dismissible={!pending}
      footer={
        <>
          <button ref={cancelButtonRef} type="button" className="secondary-button" onClick={closeUnlessPending} disabled={pending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'danger-button' : 'primary-button'}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
