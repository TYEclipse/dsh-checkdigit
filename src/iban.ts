/**
 * IBAN (ISO 13616) support for dsh-checkdigit.
 *
 * IBAN = 2-letter country code + 2 check digits + BBAN. The check uses
 * mod-97 arithmetic on the digit-expanded string: move the first four
 * characters to the end, expand letters (A=10 … Z=35), and the result must be
 * 1 (mod 97) for a valid IBAN.
 *
 * A compact registry of BBAN lengths for common countries powers validation
 * and generation; countries outside the registry still get the mod-97 check
 * with a length sanity bound.
 *
 * @module dsh-checkdigit/iban
 */

import type { CheckResult } from './core.ts'

export interface IbanDetail {
  country: string
  checkDigits: string
  bban: string
  formatted: string
}

/** Registry of IBAN total lengths by country (BBAN length = total − 4). */
const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MT: 31, MU: 30, NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31,
  SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26,
  UA: 29, VA: 22, VG: 24, XK: 20,
}

/** Min/max total IBAN length across all countries (sanity bound). */
const MIN_LEN = 15
const MAX_LEN = 32

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]+$/

function expandLetters(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    out += code >= 65 && code <= 90 ? String(code - 55) : ch
  }
  return out
}

/** mod-97 of a (possibly very long) digit string, computed in chunks. */
function mod97(digits: string): number {
  let remainder = 0
  for (let i = 0; i < digits.length; i += 9) {
    remainder = Number(`${remainder}${digits.slice(i, i + 9)}`) % 97
  }
  return remainder
}

/** Split a value into the four IBAN parts (case-normalized, no spaces). */
function parseIban(value: string): { country: string; checkDigits: string; bban: string } | undefined {
  const normalized = value.toUpperCase().replace(/[\s-]/g, '')
  if (!IBAN_RE.test(normalized)) return undefined
  return { country: normalized.slice(0, 2), checkDigits: normalized.slice(2, 4), bban: normalized.slice(4) }
}

/** Rearranged digit string for the mod-97 test. */
function rearrange(country: string, checkDigits: string, bban: string): string {
  return expandLetters(bban + country + checkDigits)
}

/** Compute the two check digits for a country + BBAN pair. */
export function ibanCheckDigits(country: string, bban: string): string {
  const remainder = mod97(rearrange(country, '00', bban))
  const check = 98 - remainder
  return String(check).padStart(2, '0')
}

/** Total length expected for a country, or undefined when unknown. */
export function ibanLength(country: string): number | undefined {
  return IBAN_LENGTHS[country]
}

export function formatIban(iban: string): string {
  const normalized = iban.toUpperCase().replace(/[\s-]/g, '')
  return normalized.match(/.{1,4}/g)?.join(' ') ?? normalized
}

/** Validate a full IBAN. */
export function validateIban(value: string): CheckResult {
  const parts = parseIban(value)
  if (parts === undefined) {
    return { valid: false, checkDigit: '', expected: '', detail: 'iban value must be 2 letters + 2 digits + alphanumeric BBAN' }
  }
  const { country, checkDigits, bban } = parts
  const total = bban.length + 4
  if (total < MIN_LEN || total > MAX_LEN) {
    return { valid: false, checkDigit: checkDigits, expected: '', detail: `iban total length ${total} is outside the ISO 13616 range (${MIN_LEN}–${MAX_LEN})` }
  }
  const expectedLen = IBAN_LENGTHS[country]
  if (expectedLen !== undefined && total !== expectedLen) {
    return { valid: false, checkDigit: checkDigits, expected: '', detail: `iban length for ${country} must be ${expectedLen} characters, got ${total}` }
  }
  const ok = mod97(rearrange(country, checkDigits, bban)) === 1
  const expected = ok ? checkDigits : ibanCheckDigits(country, bban)
  return {
    valid: ok,
    checkDigit: checkDigits,
    expected,
    detail: ok
      ? `IBAN ${country}: mod-97 check passed (remainder 1)`
      : `IBAN ${country}: mod-97 check failed — check digits should be ${expected}`,
  }
}

/** Build the IbanDetail block for a structurally valid IBAN. */
export function ibanDetail(value: string): IbanDetail | undefined {
  const parts = parseIban(value)
  if (parts === undefined) return undefined
  return {
    country: parts.country,
    checkDigits: parts.checkDigits,
    bban: parts.bban,
    formatted: formatIban(parts.country + parts.checkDigits + parts.bban),
  }
}

/**
 * Generate the two check digits for an IBAN payload (country code + BBAN).
 * Throws on malformed payloads — the scheme-level generate contract.
 */
export function generateIbanCheck(payload: string): string {
  const normalized = payload.toUpperCase().replace(/[\s-]/g, '')
  if (!/^[A-Z]{2}[A-Z0-9]{1,28}$/.test(normalized)) {
    throw new Error('iban payload must be a 2-letter country code followed by the BBAN (letters/digits, ≤ 28 chars)')
  }
  const country = normalized.slice(0, 2)
  const bban = normalized.slice(2)
  const expectedLen = IBAN_LENGTHS[country]
  if (expectedLen !== undefined && bban.length + 4 !== expectedLen) {
    throw new Error(`iban BBAN for ${country} must be ${expectedLen - 4} characters, got ${bban.length}`)
  }
  if (bban.length + 4 < MIN_LEN || bban.length + 4 > MAX_LEN) {
    throw new Error(`iban total length must be ${MIN_LEN}–${MAX_LEN}, got ${bban.length + 4}`)
  }
  const check = ibanCheckDigits(country, bban)
  if (mod97(rearrange(country, check, bban)) !== 1) {
    throw new Error('internal error: generated check digits failed the mod-97 self-check')
  }
  return check
}
