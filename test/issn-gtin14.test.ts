/**
 * ISSN and GTIN-14 scheme tests for dsh-checkdigit.
 *
 * ORACLE: test/oracle/anchors.py
 *
 * The check characters asserted here are printed by that independently written
 * Python script (run it: `python3 test/oracle/anchors.py`).
 */

import { describe, expect, it } from 'vitest'
import { SCHEMES, detectScheme } from '../src/core.ts'

describe('issn', () => {
  it('computes the mod-11 check character from published examples', () => {
    expect(SCHEMES.issn.generate('0378595')).toBe('5') // Hearing Research, ISSN 0378-5955
    expect(SCHEMES.issn.generate('2049363')).toBe('0') // 2049-3630
    expect(SCHEMES.issn.generate('1560791')).toBe('7')
    expect(SCHEMES.issn.generate('1234567')).toBe('9')
  })

  it('uses X for the residual-10 case, case-insensitively', () => {
    expect(SCHEMES.issn.generate('1000002')).toBe('X')
    expect(SCHEMES.issn.validate('1000002X').valid).toBe(true)
    expect(SCHEMES.issn.validate('1000002x').valid).toBe(true)
  })

  it('validates with and without the printed hyphen', () => {
    expect(SCHEMES.issn.validate('0378-5955').valid).toBe(true)
    expect(SCHEMES.issn.validate('03785955').valid).toBe(true)
  })

  it('reports the expected character when the check character is wrong', () => {
    const bad = SCHEMES.issn.validate('20493633')
    expect(bad.valid).toBe(false)
    expect(bad.checkDigit).toBe('3')
    expect(bad.expected).toBe('0')
  })
})

describe('gtin14', () => {
  it('agrees with the EAN/ISBN arithmetic it extends', () => {
    // Prepending the leading zero to a 13-digit Bookland number keeps its check
    // digit: the zero adds nothing and the alternating weights do not shift.
    expect(SCHEMES.gtin14.generate('0978030640615')).toBe('7')
    expect(SCHEMES.gtin14.validate('09780306406157').valid).toBe(true)
    const bad = SCHEMES.gtin14.validate('09780306406151')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('7')
  })

  it('requires a 13-digit payload', () => {
    expect(() => SCHEMES.gtin14.generate('978030640615')).toThrow()
    expect(SCHEMES.gtin14.validate('978030640615').valid).toBe(false)
  })
})

describe('scheme detection with the new schemes', () => {
  it('claims X-terminated ISSN shapes and leaves all-digit ones to ean8', () => {
    expect(detectScheme('1000002X')).toBe('issn')
    // An all-digit ISSN is indistinguishable from EAN-8; ean8 keeps it.
    expect(detectScheme('03785955')).toBe('ean8')
  })

  it('keeps 14-digit values on luhn, so gtin14 has to be named explicitly', () => {
    expect(detectScheme('09780306406157')).toBe('luhn')
  })
})
