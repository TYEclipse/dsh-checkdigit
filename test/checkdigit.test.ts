/**
 * Scheme-level tests for dsh-checkdigit.
 *
 * Every anchor value below was fixed by an independent Python implementation
 * (~/.hermes/scripts/anchors-checkdigit.py) cross-checked against published
 * worked examples, NOT by round-tripping through this implementation.
 */

import { describe, expect, it } from 'vitest'
import { SCHEMES, detectScheme } from '../src/core.ts'

// ---------------------------------------------------------------------------
// Luhn (ISO/IEC 7812)
// ---------------------------------------------------------------------------

describe('luhn', () => {
  it('generates the classic check digit', () => {
    expect(SCHEMES.luhn.generate('7992739871')).toBe('3')
  })

  it('generates known test-card check digits', () => {
    expect(SCHEMES.luhn.generate('411111111111111')).toBe('1') // Visa
    expect(SCHEMES.luhn.generate('555555555555444')).toBe('4') // Mastercard
  })

  it('validates good and bad values', () => {
    expect(SCHEMES.luhn.validate('79927398713').valid).toBe(true)
    expect(SCHEMES.luhn.validate('4111111111111111').valid).toBe(true)
    const bad = SCHEMES.luhn.validate('79927398714')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('3')
  })

  it('rejects non-digit or too-short input', () => {
    expect(SCHEMES.luhn.validate('7992A398713').valid).toBe(false)
    expect(SCHEMES.luhn.validate('7').valid).toBe(false)
    expect(() => SCHEMES.luhn.generate('')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Verhoeff
// ---------------------------------------------------------------------------

describe('verhoeff', () => {
  it('generates the classic check digit (236 -> 3)', () => {
    expect(SCHEMES.verhoeff.generate('236')).toBe('3')
  })

  it('generates a longer anchor (12345 -> 1)', () => {
    expect(SCHEMES.verhoeff.generate('12345')).toBe('1')
  })

  it('validates the full value via zero tally', () => {
    expect(SCHEMES.verhoeff.validate('2363').valid).toBe(true)
    expect(SCHEMES.verhoeff.validate('2360').valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Damm
// ---------------------------------------------------------------------------

describe('damm', () => {
  it('generates the classic check digit (572 -> 4)', () => {
    expect(SCHEMES.damm.generate('572')).toBe('4')
  })

  it('validates via zero tally', () => {
    expect(SCHEMES.damm.validate('5724').valid).toBe(true)
    expect(SCHEMES.damm.validate('5725').valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ISBN-10 / ISBN-13
// ---------------------------------------------------------------------------

describe('isbn10', () => {
  it('generates numeric and X check digits', () => {
    expect(SCHEMES.isbn10.generate('030640615')).toBe('2')
    expect(SCHEMES.isbn10.generate('097522980')).toBe('X')
    expect(SCHEMES.isbn10.generate('080442957')).toBe('X')
  })

  it('validates good and bad ISBNs', () => {
    expect(SCHEMES.isbn10.validate('0306406152').valid).toBe(true)
    expect(SCHEMES.isbn10.validate('097522980X').valid).toBe(true)
    const bad = SCHEMES.isbn10.validate('0306406153')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('2')
  })

  it('rejects wrong length or non-digit payloads', () => {
    expect(SCHEMES.isbn10.validate('306406152').valid).toBe(false)
    expect(() => SCHEMES.isbn10.generate('03064061X')).toThrow()
  })
})

describe('isbn13', () => {
  it('generates the classic check digit (978030640615 -> 7)', () => {
    expect(SCHEMES.isbn13.generate('978030640615')).toBe('7')
  })

  it('validates good and bad ISBNs', () => {
    expect(SCHEMES.isbn13.validate('9780306406157').valid).toBe(true)
    const bad = SCHEMES.isbn13.validate('9780306406158')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('7')
  })
})

// ---------------------------------------------------------------------------
// EAN-8 / EAN-13 / UPC-A
// ---------------------------------------------------------------------------

describe('ean8', () => {
  it('generates the classic check digit (9638507 -> 4)', () => {
    expect(SCHEMES.ean8.generate('9638507')).toBe('4')
  })

  it('validates good and bad values', () => {
    expect(SCHEMES.ean8.validate('96385074').valid).toBe(true)
    expect(SCHEMES.ean8.validate('96385075').valid).toBe(false)
  })
})

describe('ean13', () => {
  it('generates the classic check digit (400638133393 -> 1)', () => {
    expect(SCHEMES.ean13.generate('400638133393')).toBe('1')
  })

  it('validates good and bad values', () => {
    expect(SCHEMES.ean13.validate('4006381333931').valid).toBe(true)
    const bad = SCHEMES.ean13.validate('4006381333932')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('1')
  })
})

describe('upca', () => {
  it('generates the classic check digit (03600029145 -> 2)', () => {
    expect(SCHEMES.upca.generate('03600029145')).toBe('2')
  })

  it('validates good and bad values', () => {
    expect(SCHEMES.upca.validate('036000291452').valid).toBe(true)
    expect(SCHEMES.upca.validate('036000291453').valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ISIN
// ---------------------------------------------------------------------------

describe('isin', () => {
  it('generates check digits for published real-world ISINs', () => {
    expect(SCHEMES.isin.generate('US037833100')).toBe('5') // Apple
    expect(SCHEMES.isin.generate('GB000263494')).toBe('6') // BAE Systems
    expect(SCHEMES.isin.generate('DE000BAY001')).toBe('7') // Bayer
    expect(SCHEMES.isin.generate('AU0000XVGZA')).toBe('3') // TCV bond
  })

  it('validates published real-world ISINs', () => {
    expect(SCHEMES.isin.validate('US0378331005').valid).toBe(true)
    expect(SCHEMES.isin.validate('gb0002634946').valid).toBe(true) // case-insensitive
    expect(SCHEMES.isin.validate('AU0000XVGZA3').valid).toBe(true)
  })

  it('rejects bad check digits and malformed shapes', () => {
    const bad = SCHEMES.isin.validate('US0378331006')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('5')
    expect(SCHEMES.isin.validate('US037833100').valid).toBe(false) // too short
    expect(() => SCHEMES.isin.generate('U0037833100')).toThrow() // bad country position
  })
})

// ---------------------------------------------------------------------------
// CUSIP
// ---------------------------------------------------------------------------

describe('cusip', () => {
  it('generates check digits for published real-world CUSIPs', () => {
    expect(SCHEMES.cusip.generate('03783310')).toBe('0') // Apple
    expect(SCHEMES.cusip.generate('59491810')).toBe('4') // Microsoft
  })

  it('validates published real-world CUSIPs', () => {
    expect(SCHEMES.cusip.validate('037833100').valid).toBe(true)
    expect(SCHEMES.cusip.validate('594918104').valid).toBe(true)
  })

  it('rejects bad check digits', () => {
    const bad = SCHEMES.cusip.validate('037833101')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// Scheme detection
// ---------------------------------------------------------------------------

describe('detectScheme', () => {
  it('detects each fixed-length format', () => {
    expect(detectScheme('US0378331005')).toBe('isin')
    expect(detectScheme('037833100')).toBe('cusip')
    expect(detectScheme('9780306406157')).toBe('ean13')
    expect(detectScheme('036000291452')).toBe('upca')
    expect(detectScheme('96385074')).toBe('ean8')
    expect(detectScheme('0306406152')).toBe('isbn10')
    expect(detectScheme('097522980X')).toBe('isbn10')
  })

  it('detects IBAN before generic digit formats', () => {
    expect(detectScheme('GB82WEST12345698765432')).toBe('iban')
    expect(detectScheme('DE89 3704 0044 0532 0130 00')).toBe('iban') // spaced
  })

  it('falls back to luhn for loose digit strings and unknown for garbage', () => {
    expect(detectScheme('79927398713')).toBe('luhn')
    expect(detectScheme('hello world')).toBeUndefined()
  })
})
