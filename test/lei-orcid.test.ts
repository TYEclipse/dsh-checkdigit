/**
 * LEI (ISO 17442) and ORCID iD (ISO/IEC 7064 MOD 11-2) scheme tests.
 *
 * ORACLE: test/oracle/anchors.py
 * (every identifier below, and every check character asserted, is printed by
 * that script from LEIs GLEIF issued and ORCID iDs the ORCID registry issued)
 */

import { describe, expect, it } from 'vitest'
import { SCHEMES, SCHEME_IDS, detectScheme } from '../src/core.ts'
import { repairIdentifier } from '../src/repair.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const GLEIF_LEIS = [
  '787200X2SJ7WXPUZ4169',
  '5299008IX1AQQJV9RG61',
  '5299003A531TLH368K72',
  '529900T8BM49AURSDO55',
]

describe('lei', () => {
  it('reproduces the check digits of LEIs GLEIF issued', () => {
    expect(SCHEMES.lei.generate('787200X2SJ7WXPUZ41')).toBe('69')
    expect(SCHEMES.lei.generate('5299008IX1AQQJV9RG')).toBe('61')
    expect(SCHEMES.lei.generate('5299003A531TLH368K')).toBe('72')
    expect(SCHEMES.lei.generate('529900T8BM49AURSDO')).toBe('55')
  })

  it('validates issued identifiers and keeps the last two characters as the check digits', () => {
    for (const value of GLEIF_LEIS) {
      const result = SCHEMES.lei.validate(value)
      expect(result.valid).toBe(true)
      expect(result.checkDigit).toBe(value.slice(-2))
      expect(result.expected).toBe(value.slice(-2))
      assertLossless(result, `lei ${value}`)
    }
  })

  it('points at the right digits when the value is wrong', () => {
    const changed = SCHEMES.lei.validate('787200X2SJ7WXPUZ4168')
    expect(changed.valid).toBe(false)
    expect(changed.checkDigit).toBe('68')
    expect(changed.expected).toBe('69')
    assertLossless(changed, 'lei broken')
  })

  it('rejects the reserved slot when it is not "00"', () => {
    const reserved = SCHEMES.lei.validate('787201X2SJ7WXPUZ4169')
    expect(reserved.valid).toBe(false)
    expect(reserved.expected).toBe('')
    expect(reserved.detail).toContain('reserved')
  })

  it('rejects a truncated value', () => {
    const short = SCHEMES.lei.validate('787200X2SJ7WXPUZ41')
    expect(short.valid).toBe(false)
    expect(short.expected).toBe('')
    expect(short.detail).toContain('20')
  })

  it('accepts lowercase and hyphenated input', () => {
    expect(SCHEMES.lei.validate('5299-00T8BM49AURSDO-55').valid).toBe(true)
    expect(SCHEMES.lei.validate('787200x2sj7wxpuz4169').valid).toBe(true)
  })

  it('refuses to generate from a payload with the wrong reserved slot or length', () => {
    expect(() => SCHEMES.lei.generate('787201X2SJ7WXPUZ41')).toThrow(/reserved/)
    expect(() => SCHEMES.lei.generate('787200X2SJ7WXPUZ4')).toThrow(/18/)
  })
})

describe('orcid', () => {
  it('computes the published check characters', () => {
    expect(SCHEMES.orcid.generate('000000021825009')).toBe('7')
    // Remainder 0 — the corner where "12 - remainder" would print 12.
    expect(SCHEMES.orcid.generate('000000021028694')).toBe('1')
    expect(SCHEMES.orcid.generate('000000015591559')).toBe('9')
    expect(SCHEMES.orcid.generate('000000023555219')).toBe('3')
  })

  it('renders a check character of 10 as X', () => {
    expect(SCHEMES.orcid.generate('000012345678908')).toBe('X')
    expect(SCHEMES.orcid.validate('000012345678908X').valid).toBe(true)
    expect(SCHEMES.orcid.validate('0000123456789080').valid).toBe(false)
  })

  it('validates real ORCID iDs, hyphenated or not', () => {
    expect(SCHEMES.orcid.validate('0000-0002-1825-0097').valid).toBe(true)
    expect(SCHEMES.orcid.validate('0000000210286941').valid).toBe(true)
    expect(SCHEMES.orcid.validate('0000000155915599').valid).toBe(true)
    expect(SCHEMES.orcid.validate('0000000235552193').valid).toBe(true)
  })

  it('reports the expected character for a mistyped one', () => {
    const wrong = SCHEMES.orcid.validate('0000000218250098')
    expect(wrong.valid).toBe(false)
    expect(wrong.checkDigit).toBe('8')
    expect(wrong.expected).toBe('7')
  })

  it('rejects a wrong length', () => {
    const short = SCHEMES.orcid.validate('000000021825009')
    expect(short.valid).toBe(false)
    expect(short.expected).toBe('')
  })
})

describe('detection', () => {
  it('claims a LEI only when the mod-97 remainder confirms it', () => {
    expect(detectScheme('529900T8BM49AURSDO55')).toBe('lei')
    // Right shape, wrong check digits: nothing else claims it either.
    expect(detectScheme('529900T8BM49AURSDO56')).toBeUndefined()
  })

  it('claims ORCID only inside the 0000-000x block, so card numbers stay Luhn', () => {
    expect(detectScheme('0000-0002-1825-0097')).toBe('orcid')
    expect(detectScheme('4111111111111111')).toBe('luhn')
    expect(detectScheme('529900T8BM49AURSDO55')).not.toBe('luhn')
  })

  it('lists both schemes', () => {
    expect(SCHEME_IDS).toContain('lei')
    expect(SCHEME_IDS).toContain('orcid')
  })
})

describe('repair', () => {
  it('repairs a LEI by rewriting its two check digits at the end', () => {
    const result = repairIdentifier('787200X2SJ7WXPUZ4168')
    expect(result.scheme).toBe('lei')
    expect(result.total).toBe(7)
    expect(result.repairs[0]).toEqual({
      type: 'check-digit',
      position: 19,
      from: '68',
      to: '69',
      value: '787200X2SJ7WXPUZ4169',
    })
    assertLossless(result, 'lei repair')
  })

  it('repairs an ORCID by rewriting the check character', () => {
    const result = repairIdentifier('0000000218250098')
    expect(result.scheme).toBe('orcid')
    expect(result.total).toBe(16)
    expect(result.repairs[0]).toEqual({
      type: 'check-digit',
      position: 16,
      from: '8',
      to: '7',
      value: '0000000218250097',
    })
    assertLossless(result, 'orcid repair')
  })
})
