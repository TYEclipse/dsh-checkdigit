/**
 * Check-digit mathematics for dsh-checkdigit.
 *
 * Every scheme is implemented from its published specification with pure
 * integer arithmetic (no float math, no external services, no runtime
 * dependencies). Each scheme exposes `generate(payload)` and
 * `validate(value)`, plus metadata for the info tool.
 *
 * @module dsh-checkdigit/core
 */

import { generateIbanCheck, validateIban } from './iban.ts'

/** Identifiers of every supported check-digit scheme. */
export const SCHEME_IDS = [
  'luhn',
  'verhoeff',
  'damm',
  'isbn10',
  'isbn13',
  'ean8',
  'ean13',
  'upca',
  'isin',
  'cusip',
  'iban',
] as const

export type SchemeId = (typeof SCHEME_IDS)[number]

export interface SchemeMeta {
  id: SchemeId
  name: string
  description: string
  /** Full identifier length, or a human-readable range. */
  length: string
  /** What the payload (input to generate) must look like. */
  payload: string
  /** Where the check digit sits. */
  check: string
  example: string
}

export interface CheckResult {
  /** True when the check digit is correct for the payload. */
  valid: boolean
  /** The check digit as found in the value ('' when absent). */
  checkDigit: string
  /** The check digit the payload requires. */
  expected: string
  /** Human-readable explanation of the arithmetic. */
  detail: string
}

const DIGITS = /^\d+$/

/** Split a value into payload + trailing check digit. */
function splitLast(value: string): { payload: string; check: string } {
  return { payload: value.slice(0, -1), check: value.slice(-1) }
}

/** Sum of the digits of an integer. */
function digitSum(n: number): number {
  let sum = 0
  while (n > 0) {
    sum += n % 10
    n = Math.floor(n / 10)
  }
  return sum
}

// ---------------------------------------------------------------------------
// Luhn (ISO/IEC 7812) — credit/debit cards, IMEI, and the base of ISIN.
// From the rightmost payload digit, double every second digit; products >= 10
// are reduced by subtracting 9 (equal to their digit sum). Check = -sum mod 10.
// ---------------------------------------------------------------------------

function luhnCheck(payload: string): string {
  let sum = 0
  // The rightmost payload digit is the second digit from the right of the full
  // number (the check digit sits right of it), so it IS doubled.
  let double = true
  for (let i = payload.length - 1; i >= 0; i--) {
    const d = payload.charCodeAt(i) - 48
    sum += double ? (d * 2 >= 10 ? d * 2 - 9 : d * 2) : d
    double = !double
  }
  return String((10 - (sum % 10)) % 10)
}

// ---------------------------------------------------------------------------
// Verhoeff — dihedral-group check digit, catches all transpositions and most
// twins. Uses the published multiplication d-table, permutation p-table and
// inverse table.
// ---------------------------------------------------------------------------

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]

const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]

function verhoeffTally(value: string, offset = 0): number {
  let c = 0
  for (let i = offset; i < value.length + offset; i++) {
    const digit = value.charCodeAt(value.length - 1 - (i - offset)) - 48
    c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![digit]!]!
  }
  return c
}

function verhoeffCheck(payload: string): string {
  // During generation the check digit will occupy position i = 0, so the
  // payload's rightmost digit is processed at i = 1.
  return String(VERHOEFF_INV[verhoeffTally(payload, 1)]!)
}

// ---------------------------------------------------------------------------
// Damm — quasigroup operation table; the check digit makes the tally over the
// full value come out to zero. Detects all single errors and transpositions.
// ---------------------------------------------------------------------------

const DAMM_Q = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
]

function dammTally(value: string): number {
  let interim = 0
  for (let i = 0; i < value.length; i++) {
    interim = DAMM_Q[interim]![value.charCodeAt(i) - 48]!
  }
  return interim
}

// ---------------------------------------------------------------------------
// ISBN-10 — weights 10..1 (payload positions 1..9 get 10-i). Check r is the
// residue mod 11; r=0 gives '0', r=1 gives 'X' (representing 10), else 11-r.
// ---------------------------------------------------------------------------

function isbn10Check(payload: string): string {
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * (payload.charCodeAt(i) - 48)
  }
  const r = sum % 11
  return r === 0 ? '0' : r === 1 ? 'X' : String(11 - r)
}

// ---------------------------------------------------------------------------
// EAN family (EAN-8 / EAN-13 / ISBN-13 / UPC-A) — alternating weights on the
// payload only; the check digit makes the weighted sum a multiple of 10.
// ---------------------------------------------------------------------------

function weightedMod10Check(payload: string, weights: readonly number[]): string {
  let sum = 0
  for (let i = 0; i < payload.length; i++) {
    sum += (payload.charCodeAt(i) - 48) * (weights[i % weights.length] ?? 0)
  }
  return String((10 - (sum % 10)) % 10)
}

const EAN8_WEIGHTS = [3, 1] // position 1 gets weight 3
const EAN13_WEIGHTS = [1, 3] // position 1 gets weight 1
const UPCA_WEIGHTS = [3, 1] // position 1 gets weight 3

// ---------------------------------------------------------------------------
// ISIN (ISO 6166) — 2 letters + 9 alphanumerics + 1 check digit. Letters are
// expanded to two digits (A=10 … Z=35) and Luhn is applied to the expansion.
// ---------------------------------------------------------------------------

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/

function expandLetters(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code >= 65 && code <= 90) out += String(code - 55) // A -> 10
    else out += ch
  }
  return out
}

// ---------------------------------------------------------------------------
// CUSIP — 8 base characters (digits, letters, *, @, #) + 1 check digit.
// Character values: digits 0-9, A=10 … Z=35, *=36, @=37, #=38; weights 2,1
// alternating from position 1; products are reduced to their digit sum.
// ---------------------------------------------------------------------------

const CUSIP_RE = /^[A-Z0-9*@#]{8}\d$/

function cusipCharValue(ch: string): number | undefined {
  const code = ch.charCodeAt(0)
  if (code >= 48 && code <= 57) return code - 48
  if (code >= 65 && code <= 90) return code - 55
  if (ch === '*') return 36
  if (ch === '@') return 37
  if (ch === '#') return 38
  return undefined
}

function cusipCheck(payload: string): string {
  let sum = 0
  for (let i = 0; i < 8; i++) {
    const value = cusipCharValue(payload[i]!)
    if (value === undefined) throw new Error(`invalid CUSIP character: ${payload[i]}`)
    // CUSIP doubles the EVEN positions (2nd, 4th, ... from the left).
    const product = value * (i % 2 === 0 ? 1 : 2)
    sum += digitSum(product)
  }
  return String((10 - (sum % 10)) % 10)
}

// ---------------------------------------------------------------------------
// Shared generate/validate API. Every generator throws on a malformed
// payload; callers wrap the throw into a valid:false result.
// ---------------------------------------------------------------------------

export interface SchemeSpec {
  meta: SchemeMeta
  generate: (payload: string) => string
  validate: (value: string) => CheckResult
}

function numericScheme(
  meta: SchemeMeta,
  payloadLength: number,
  generator: (payload: string) => string,
  validator?: (payload: string) => string,
  valuePattern: RegExp = /^\d+$/,
  normalize?: (value: string) => string,
): SchemeSpec {
  const compute = validator ?? generator
  return {
    meta,
    generate(payload: string): string {
      if (!DIGITS.test(payload)) throw new Error(`${meta.id} payload must be digits only`)
      if (payload.length !== payloadLength) throw new Error(`${meta.id} payload must be exactly ${payloadLength} digits, got ${payload.length}`)
      return generator(payload)
    },
    validate(value: string): CheckResult {
      const normalized = normalize === undefined ? value : normalize(value)
      if (!valuePattern.test(normalized)) {
        return { valid: false, checkDigit: '', expected: '', detail: `${meta.id} value must be digits only` }
      }
      if (normalized.length !== payloadLength + 1) {
        return { valid: false, checkDigit: '', expected: '', detail: `${meta.id} value must be ${payloadLength + 1} digits, got ${normalized.length}` }
      }
      const { payload, check } = splitLast(normalized)
      const expected = compute(payload)
      const ok = check === expected
      return {
        valid: ok,
        checkDigit: check,
        expected,
        detail: ok
          ? `${meta.name}: check digit ${check} matches the weighted-sum requirement`
          : `${meta.name}: check digit should be ${expected}, but the value ends in ${check}`,
      }
    },
  }
}

export const SCHEMES: Record<SchemeId, SchemeSpec> = {
  luhn: {
    meta: {
      id: 'luhn',
      name: 'Luhn (ISO/IEC 7812)',
      description: 'The classic card-number checksum: credit/debit cards, IMEI, loyalty cards.',
      length: 'variable (2+ digits)',
      payload: 'any digits, at least 1',
      check: 'last digit',
      example: '79927398713',
    },
    generate(payload: string): string {
      if (!DIGITS.test(payload) || payload.length < 1) throw new Error('luhn payload must be at least 1 digit')
      return luhnCheck(payload)
    },
    validate(value: string): CheckResult {
      if (!DIGITS.test(value) || value.length < 2) {
        return { valid: false, checkDigit: '', expected: '', detail: 'luhn value must be at least 2 digits' }
      }
      const { payload, check } = splitLast(value)
      const expected = luhnCheck(payload)
      const ok = check === expected
      return {
        valid: ok,
        checkDigit: check,
        expected,
        detail: ok
          ? `Luhn: check digit ${check} matches the mod-10 doubling sum`
          : `Luhn: check digit should be ${expected}, but the value ends in ${check}`,
      }
    },
  },
  verhoeff: {
    meta: {
      id: 'verhoeff',
      name: 'Verhoeff',
      description: 'Dihedral-group checksum that catches all single errors and all adjacent transpositions.',
      length: 'variable (2+ digits)',
      payload: 'any digits, at least 1',
      check: 'last digit',
      example: '2363',
    },
    generate(payload: string): string {
      if (!DIGITS.test(payload) || payload.length < 1) throw new Error('verhoeff payload must be at least 1 digit')
      return verhoeffCheck(payload)
    },
    validate(value: string): CheckResult {
      if (!DIGITS.test(value) || value.length < 2) {
        return { valid: false, checkDigit: '', expected: '', detail: 'verhoeff value must be at least 2 digits' }
      }
      const ok = verhoeffTally(value) === 0
      const { payload, check } = splitLast(value)
      return {
        valid: ok,
        checkDigit: check,
        expected: ok ? check : verhoeffCheck(payload),
        detail: ok
          ? 'Verhoeff: the dihedral tally over the full value is zero'
          : `Verhoeff: the dihedral tally over the full value is ${verhoeffTally(value)}, not zero`,
      }
    },
  },
  damm: {
    meta: {
      id: 'damm',
      name: 'Damm',
      description: 'Quasigroup-operation checksum; the tally over the full value must be zero. Detects all single errors and transpositions.',
      length: 'variable (2+ digits)',
      payload: 'any digits, at least 1',
      check: 'last digit',
      example: '5724',
    },
    generate(payload: string): string {
      if (!DIGITS.test(payload) || payload.length < 1) throw new Error('damm payload must be at least 1 digit')
      return String(dammTally(payload))
    },
    validate(value: string): CheckResult {
      if (!DIGITS.test(value) || value.length < 2) {
        return { valid: false, checkDigit: '', expected: '', detail: 'damm value must be at least 2 digits' }
      }
      const ok = dammTally(value) === 0
      const { payload, check } = splitLast(value)
      return {
        valid: ok,
        checkDigit: check,
        expected: ok ? check : String(dammTally(payload)),
        detail: ok
          ? 'Damm: the quasigroup tally over the full value is zero'
          : `Damm: the quasigroup tally over the full value is ${dammTally(value)}, not zero`,
      }
    },
  },
  isbn10: numericScheme(
    {
      id: 'isbn10',
      name: 'ISBN-10',
      description: 'Ten-digit book identifier; the check digit is computed mod 11 and may be the letter X (value 10).',
      length: '10',
      payload: '9 digits',
      check: '10th character (0-9 or X)',
      example: '0306406152',
    },
    9,
    isbn10Check,
    undefined,
    /^\d{9}[\dX]$/i,
    (v) => v.toUpperCase(),
  ),
  isbn13: numericScheme(
    {
      id: 'isbn13',
      name: 'ISBN-13 / EAN-13 (Bookland)',
      description: 'Thirteen-digit book identifier, identical arithmetic to EAN-13.',
      length: '13',
      payload: '12 digits',
      check: '13th digit',
      example: '9780306406157',
    },
    12,
    (p) => weightedMod10Check(p, EAN13_WEIGHTS),
  ),
  ean8: numericScheme(
    {
      id: 'ean8',
      name: 'EAN-8',
      description: 'Compact eight-digit barcode number (GTIN-8).',
      length: '8',
      payload: '7 digits',
      check: '8th digit',
      example: '96385074',
    },
    7,
    (p) => weightedMod10Check(p, EAN8_WEIGHTS),
  ),
  ean13: numericScheme(
    {
      id: 'ean13',
      name: 'EAN-13 (GTIN-13)',
      description: 'Thirteen-digit retail barcode number.',
      length: '13',
      payload: '12 digits',
      check: '13th digit',
      example: '4006381333931',
    },
    12,
    (p) => weightedMod10Check(p, EAN13_WEIGHTS),
  ),
  upca: numericScheme(
    {
      id: 'upca',
      name: 'UPC-A (GTIN-12)',
      description: 'Twelve-digit North American retail barcode number.',
      length: '12',
      payload: '11 digits',
      check: '12th digit',
      example: '036000291452',
    },
    11,
    (p) => weightedMod10Check(p, UPCA_WEIGHTS),
  ),
  isin: {
    meta: {
      id: 'isin',
      name: 'ISIN (ISO 6166)',
      description: 'Twelve-character securities identifier: 2-letter country + 9 alphanumerics + check digit (Luhn over letter-expanded digits).',
      length: '12',
      payload: '2 letters + 9 alphanumerics',
      check: '12th character (digit)',
      example: 'US0378331005',
    },
    generate(payload: string): string {
      const normalized = payload.toUpperCase()
      if (!/^[A-Z]{2}[A-Z0-9]{9}$/.test(normalized)) throw new Error('isin payload must be 2 letters + 9 alphanumerics')
      return luhnCheck(expandLetters(normalized))
    },
    validate(value: string): CheckResult {
      const normalized = value.toUpperCase()
      if (!ISIN_RE.test(normalized)) {
        return { valid: false, checkDigit: '', expected: '', detail: 'isin value must be 2 letters + 9 alphanumerics + 1 digit' }
      }
      const { payload, check } = splitLast(normalized)
      const expected = luhnCheck(expandLetters(payload))
      const ok = check === expected
      return {
        valid: ok,
        checkDigit: check,
        expected,
        detail: ok
          ? `ISIN: Luhn over the letter-expanded digits matches check digit ${check}`
          : `ISIN: check digit should be ${expected}, but the value ends in ${check}`,
      }
    },
  },
  cusip: {
    meta: {
      id: 'cusip',
      name: 'CUSIP',
      description: 'Nine-character North American securities identifier; * @ # are valid payload characters.',
      length: '9',
      payload: '8 characters (digits, letters, * @ #)',
      check: '9th character (digit)',
      example: '037833100',
    },
    generate(payload: string): string {
      const normalized = payload.toUpperCase()
      if (!/^[A-Z0-9*@#]{8}$/.test(normalized)) throw new Error('cusip payload must be 8 chars from [A-Z0-9*@#]')
      return cusipCheck(normalized)
    },
    validate(value: string): CheckResult {
      const normalized = value.toUpperCase()
      if (!CUSIP_RE.test(normalized)) {
        return { valid: false, checkDigit: '', expected: '', detail: 'cusip value must be 8 base characters + 1 digit' }
      }
      const { payload, check } = splitLast(normalized)
      const expected = cusipCheck(payload)
      const ok = check === expected
      return {
        valid: ok,
        checkDigit: check,
        expected,
        detail: ok
          ? `CUSIP: weighted digit-sum matches check digit ${check}`
          : `CUSIP: check digit should be ${expected}, but the value ends in ${check}`,
      }
    },
  },
  iban: {
    meta: {
      id: 'iban',
      name: 'IBAN (ISO 13616)',
      description: 'International bank account number: 2-letter country + 2 mod-97 check digits + BBAN (length per country).',
      length: '15–32 (per country)',
      payload: '2-letter country code + BBAN digits',
      check: 'characters 3–4 (two digits)',
      example: 'GB82WEST12345698765432',
    },
    generate: generateIbanCheck,
    validate: validateIban,
  },
}

/**
 * Detect the most likely scheme for a value. Ordering matters: stricter
 * formats (ISIN, CUSIP, ISBN-10) are tested before the loose digit fallbacks.
 */
export function detectScheme(value: string): SchemeId | undefined {
  const normalized = value.replace(/[\s-]/g, '').toUpperCase()
  // ISIN and CUSIP first: an ISIN (12 chars) would otherwise match the IBAN
  // shape if it were tested without a length bound.
  if (ISIN_RE.test(normalized)) return 'isin'
  if (CUSIP_RE.test(normalized)) return 'cusip'
  // IBAN: 2 letters + 2 check digits + BBAN of 11..28 -> total length 15..32.
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,28}$/.test(normalized)) return 'iban'
  if (/^\d{13}$/.test(normalized)) return 'ean13'
  if (/^\d{12}$/.test(normalized)) return 'upca'
  if (/^\d{8}$/.test(normalized)) return 'ean8'
  if (/^\d{9}[\dX]$/.test(normalized)) return 'isbn10'
  if (/^\d{2,}$/.test(normalized)) return 'luhn'
  return undefined
}

/** Metadata for every scheme, for the info tool. */
export function schemeMetaList(): SchemeMeta[] {
  return SCHEME_IDS.map((id) => SCHEMES[id].meta)
}
