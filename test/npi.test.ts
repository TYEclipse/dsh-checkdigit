/**
 * NPI (US National Provider Identifier) tests for dsh-checkdigit.
 *
 * ORACLE: test/oracle/anchors.py
 *
 * The check digits and the valid published identifiers below are printed by
 * that independently written Python script; the "plain Luhn disagrees" anchor
 * (luhn(123456789) = 7 versus npi(123456789) = 3) is printed there too, and it
 * is the reason ten-digit values are not auto-detected as NPIs.
 */

import { describe, expect, it } from 'vitest'
import { SCHEMES, detectScheme } from '../src/core.ts'
import { repairIdentifier } from '../src/repair.ts'
import { buildCheckdigitTools } from '../src/tools.ts'

const tools = buildCheckdigitTools()

describe('npi scheme spec', () => {
  it('computes the published check digits', () => {
    expect(SCHEMES.npi.generate('123456789')).toBe('3')
    expect(SCHEMES.npi.generate('124531959')).toBe('9')
    expect(SCHEMES.npi.generate('199999998')).toBe('4')
    expect(SCHEMES.npi.generate('100300012')).toBe('6')
  })

  it('accepts the published identifiers and flags a wrong check digit', () => {
    for (const npi of ['1234567893', '1245319599', '1999999984', '1003000126']) {
      expect(SCHEMES.npi.validate(npi).valid).toBe(true)
    }
    const bad = SCHEMES.npi.validate('1234567894')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('3')
    expect(bad.checkDigit).toBe('4')
  })

  it('requires the entity-type first digit (1 individual, 2 organisation)', () => {
    expect(SCHEMES.npi.validate('0234567893').valid).toBe(false)
    expect(SCHEMES.npi.validate('3234567893').valid).toBe(false)
    expect(SCHEMES.npi.validate('0234567893').expected).toBe('')
  })

  it('is not plain Luhn — the 80840 prefix moves the check digit', () => {
    expect(SCHEMES.npi.generate('123456789')).toBe('3')
    expect(SCHEMES.npi.validate('1234567897').valid).toBe(false)
    expect(SCHEMES.npi.validate('1234567897').expected).toBe('3')
  })

  it('throws on malformed payloads instead of guessing', () => {
    expect(() => SCHEMES.npi.generate('12345678')).toThrow(/9 digits/)
    expect(() => SCHEMES.npi.generate('1234567890')).toThrow(/9 digits/)
    expect(() => SCHEMES.npi.generate('12345678X')).toThrow(/digits only/)
  })

  it('is not auto-detected: ten digits stay in isbn10 / luhn territory', () => {
    expect(detectScheme('1234567893')).toBe('isbn10')
    expect(detectScheme('1999999984')).toBe('isbn10')
  })
})

describe('npi repair (explicit scheme — detection cannot claim ten digits)', () => {
  it('repairs a mistyped check digit', () => {
    const result = repairIdentifier('1234567894', 'npi')
    expect(result.scheme).toBe('npi')
    expect(result.total).toBe(12)
    expect(result.repairs[0]).toEqual({ type: 'check-digit', position: 10, from: '4', to: '3', value: '1234567893' })
  })

  it('repairs a swapped adjacent pair', () => {
    const result = repairIdentifier('1245319959', 'npi')
    expect(result.scheme).toBe('npi')
    expect(result.total).toBe(11)
    expect(result.repairs[0].value).toBe('1245319953')
  })
})

describe('npi through the tool surface', () => {
  it('generates and validates through checkdigit_generate / checkdigit_validate', async () => {
    expect(await tools.checkdigit_generate.execute({ scheme: 'npi', payload: '123456789' })).toEqual({
      valid: true,
      scheme: 'npi',
      checkDigit: '3',
      complete: '1234567893',
    })
    const ok = await tools.checkdigit_validate.execute({ value: '1245319599', scheme: 'npi' })
    expect(ok.valid).toBe(true)
    expect(ok.scheme).toBe('npi')
    expect(ok.detail).toContain('80840')
    const bad = await tools.checkdigit_validate.execute({ value: '1003000127', scheme: 'npi' })
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('6')
  })
})
