const TAIPEI_TIME_ZONE = 'Asia/Taipei'

const dateParts = (value: string | Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(typeof value === 'string' ? new Date(value) : value)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

export const formatMoney = (amountCents: number) =>
  `NT$${new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountCents / 100)}`

export const moneyInputValue = (amountCents: number) => String(Math.round(amountCents / 100))

export const parseMoneyToCents = (value: string) => {
  const normalized = value.trim()
  if (!normalized) throw new Error('請輸入金額')
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('請輸入有效金額')
  if (!/^\d+$/.test(normalized)) throw new Error('金額僅能輸入整數元')
  const cents = amount * 100
  if (!Number.isSafeInteger(cents)) throw new Error('金額過大，請輸入較小的數值')
  return cents
}

export const toDateInput = (iso: string) => {
  const parts = dateParts(iso)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export const toDateTimeInput = (iso: string) => {
  const parts = dateParts(iso)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export const dateInputToIso = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('請選擇有效日期')
  const date = new Date(`${value}T12:00:00+08:00`)
  if (!Number.isFinite(date.getTime())) throw new Error('請選擇有效日期')
  return date.toISOString()
}

export const dateTimeInputToIso = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('請選擇有效日期與時間')
  const date = new Date(`${value}:00+08:00`)
  if (!Number.isFinite(date.getTime())) throw new Error('請選擇有效日期與時間')
  return date.toISOString()
}

export const nowDateInput = () => toDateInput(new Date().toISOString())
export const nowDateTimeInput = () => toDateTimeInput(new Date().toISOString())
export const currentMonthInput = () => nowDateInput().slice(0, 7)
export const monthKey = (iso: string) => toDateInput(iso).slice(0, 7)

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI_TIME_ZONE,
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso))

export const formatFullDate = (iso: string) =>
  new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso))

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))

export const formatDashboardDate = () =>
  new Intl.DateTimeFormat('zh-TW', {
    timeZone: TAIPEI_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())

export const expiryDaysFromToday = (expiresOn?: string) => {
  if (!expiresOn) return null
  const today = new Date(`${nowDateInput()}T00:00:00+08:00`).getTime()
  const expiry = new Date(`${expiresOn}T00:00:00+08:00`).getTime()
  return Math.round((expiry - today) / 86_400_000)
}

export const formatExpiry = (expiresOn?: string) => {
  const days = expiryDaysFromToday(expiresOn)
  if (days === null) return '無效期'
  if (days < 0) return `已過期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  if (days === 1) return '明天到期'
  if (days <= 7) return `剩 ${days} 天`
  return `效期 ${expiresOn?.replaceAll('-', '/')}`
}

export const formatBaseQuantity = (quantity: number, dimension: 'mass' | 'volume' | 'count') => {
  const rounded = Number(quantity.toFixed(3))
  if (dimension === 'mass' && Math.abs(rounded) >= 1000) return `${Number((rounded / 1000).toFixed(3))} kg`
  if (dimension === 'volume' && Math.abs(rounded) >= 1000) return `${Number((rounded / 1000).toFixed(3))} L`
  const unit = dimension === 'mass' ? 'g' : dimension === 'volume' ? 'ml' : '個'
  return `${rounded.toLocaleString('zh-TW')} ${unit}`
}

export const cn = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ')
