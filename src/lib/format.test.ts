import { describe, expect, it } from 'vitest'
import { formatMoney, moneyInputValue, parseMoneyToCents } from './format'

describe('money formatting and parsing', () => {
  it('uses the explicit NT$ prefix without decimal places', () => {
    expect(formatMoney(12_345)).toBe('NT$123')
    expect(formatMoney(12_350)).toBe('NT$124')
    expect(formatMoney(123_456_700)).toBe('NT$1,234,567')
    expect(formatMoney(0)).toBe('NT$0')
  })

  it('parses whole Taiwan-dollar input into safe integer cents', () => {
    expect(parseMoneyToCents('0')).toBe(0)
    expect(parseMoneyToCents('123')).toBe(12_300)
    expect(moneyInputValue(12_345)).toBe('123')
    expect(moneyInputValue(12_350)).toBe('124')
  })

  it('rejects decimal, blank, negative, and non-finite money input', () => {
    expect(() => parseMoneyToCents('123.45')).toThrow(/整數元/)
    expect(() => parseMoneyToCents('1e3')).toThrow(/整數元/)
    expect(() => parseMoneyToCents('   ')).toThrow(/請輸入金額/)
    expect(() => parseMoneyToCents('-1')).toThrow(/有效金額/)
    expect(() => parseMoneyToCents('Infinity')).toThrow(/有效金額/)
    expect(() => parseMoneyToCents(String(Number.MAX_SAFE_INTEGER))).toThrow(/金額過大/)
  })
})
