/**
 * IBAN tests for dsh-checkdigit. Anchors fixed by the independent Python
 * script against published worked examples.
 */

import { describe, expect, it } from 'vitest'
import {
  formatIban,
  ibanCheckDigits,
  ibanDetail,
  ibanLength,
  validateIban,
} from '../src/iban.ts'
import { SCHEMES } from '../src/core.ts'
import { buildCheckdigitTools } from '../src/tools.ts'

describe('ibanCheckDigits', () => {
  it('computes the classic check digits', () => {
    expect(ibanCheckDigits('GB', 'WEST12345698765432')).toBe('82')
    expect(ibanCheckDigits('DE', '370400440532013000')).toBe('89')
    expect(ibanCheckDigits('FR', '20041010050500013M02606')).toBe('14')
  })
})

describe('iban scheme spec', () => {
  it('generates check digits from country + BBAN', () => {
    expect(SCHEMES.iban.generate('GBWEST12345698765432')).toBe('82')
    expect(SCHEMES.iban.generate('de370400440532013000')).toBe('89') // lowercase ok
  })

  it('rejects wrong BBAN length for known countries', () => {
    expect(() => SCHEMES.iban.generate('GB12345')).toThrow(/18 characters/)
  })

  it('validates real-world IBANs', () => {
    expect(validateIban('GB82WEST12345698765432').valid).toBe(true)
    expect(validateIban('DE89 3704 0044 0532 0130 00').valid).toBe(true) // spaced
    expect(validateIban('NL91ABNA0417164300').valid).toBe(true)
    expect(validateIban('SE4550000000058398257466').valid).toBe(true)
    expect(validateIban('FR1420041010050500013M02606').valid).toBe(true)
  })

  it('flags wrong check digits with the expected value', () => {
    const bad = validateIban('GB00WEST12345698765432')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('82')
  })

  it('flags wrong total length for a known country', () => {
    const bad = validateIban('GB82WEST123456987654321') // 23 chars, GB needs 22
    expect(bad.valid).toBe(false)
    expect(bad.detail).toContain('22')
  })
})

describe('ibanDetail / formatIban', () => {
  it('extracts country, check digits, BBAN and formatted form', () => {
    const detail = ibanDetail('GB82WEST12345698765432')
    expect(detail).toEqual({
      country: 'GB',
      checkDigits: '82',
      bban: 'WEST12345698765432',
      formatted: 'GB82 WEST 1234 5698 7654 32',
    })
    expect(formatIban('gb82west12345698765432')).toBe('GB82 WEST 1234 5698 7654 32')
  })

  it('returns undefined for malformed values', () => {
    expect(ibanDetail('12345')).toBeUndefined()
  })
})

describe('iban registry', () => {
  it('knows common country lengths', () => {
    expect(ibanLength('GB')).toBe(22)
    expect(ibanLength('DE')).toBe(22)
    expect(ibanLength('NO')).toBe(15)
    expect(ibanLength('ZZ')).toBeUndefined()
  })
})

describe('tool-level iban integration', () => {
  const tools = buildCheckdigitTools()

  it('checkdigit_generate assembles the complete IBAN', async () => {
    const result = await tools.checkdigit_generate.execute({ scheme: 'iban', payload: 'GBWEST12345698765432' })
    expect(result).toEqual({
      valid: true,
      scheme: 'iban',
      checkDigit: '82',
      complete: 'GB82WEST12345698765432',
    })
  })

  it('checkdigit_validate auto-detects and enriches IBANs', async () => {
    const result = await tools.checkdigit_validate.execute({ value: 'GB82WEST12345698765432' })
    expect(result.valid).toBe(true)
    expect(result.scheme).toBe('iban')
    expect(result.iban?.country).toBe('GB')
    expect(result.iban?.formatted).toBe('GB82 WEST 1234 5698 7654 32')
  })
})
