/**
 * ISBN-10 <-> ISBN-13 conversion for the isbn_convert tool.
 *
 * ISBN-10 -> ISBN-13: validate the mod-11 check digit, prepend the 978
 * Bookland prefix and recompute the EAN-13 check digit.
 * ISBN-13 -> ISBN-10: validate the EAN-13 check digit, drop the prefix and
 * recompute the mod-11 check. Only the 978 prefix maps back to ISBN-10;
 * 979-prefixed ISBNs (and everything else) have no ISBN-10 equivalent.
 *
 * Hyphens and spaces are ignored on input; when the input is hyphenated the
 * formatted output keeps the same grouping (978 prepended / dropped).
 *
 * @module dsh-checkdigit/isbn
 */

import { isbn10Check, weightedMod10Check, ISBN13_WEIGHTS } from './core.ts'

export type IsbnDirection = 'to13' | 'to10'

export interface IsbnConvertResult {
  valid: boolean
  /** Conversion direction (present only on success — lossless JSON). */
  direction?: IsbnDirection
  /** Normalised source ISBN (10 or 13 characters). */
  source?: string
  /** Normalised converted ISBN. */
  converted?: string
  /** Human-readable hyphenated form (same grouping as the input). */
  formatted?: string
  /** Failure reason (present only when valid is false). */
  error?: string
}

function digitGroups(raw: string): string[] {
  return raw.split(/[\s-]+/).filter((g) => g !== '' && /^[\dX]+$/.test(g))
}

export function convertIsbn(input: string): IsbnConvertResult {
  const raw = input.trim().toUpperCase()
  const normalized = raw.replace(/[\s-]/g, '')
  const groups = digitGroups(raw)
  const hyphenated = raw.includes('-') || raw.includes(' ')

  // ISBN-10 -> ISBN-13 -------------------------------------------------------
  if (/^\d{9}[\dX]$/.test(normalized)) {
    const payload9 = normalized.slice(0, 9)
    const expected = isbn10Check(payload9)
    if (normalized[9] !== expected) {
      return {
        valid: false,
        error: `ISBN-10 check digit should be ${expected}, but the input ends in ${normalized[9]}`,
      }
    }
    const base13 = `978${payload9}`
    const check13 = weightedMod10Check(base13, ISBN13_WEIGHTS)
    const converted = `${base13}${check13}`
    const result: IsbnConvertResult = { valid: true, direction: 'to13', source: normalized, converted }
    result.formatted = hyphenated && groups.length >= 2
      ? ['978', ...groups.slice(0, -1), check13].join('-')
      : converted
    return result
  }

  // ISBN-13 -> ISBN-10 -------------------------------------------------------
  if (/^\d{13}$/.test(normalized)) {
    const check13 = weightedMod10Check(normalized.slice(0, 12), ISBN13_WEIGHTS)
    if (normalized[12] !== check13) {
      return {
        valid: false,
        error: `ISBN-13 check digit should be ${check13}, but the input ends in ${normalized[12]}`,
      }
    }
    const prefix = normalized.slice(0, 3)
    if (prefix !== '978') {
      return {
        valid: false,
        error: `ISBN-13 with the ${prefix} prefix has no ISBN-10 equivalent; only the 978 Bookland prefix maps back to ISBN-10`,
      }
    }
    const payload9 = normalized.slice(3, 12)
    const check10 = isbn10Check(payload9)
    const converted = `${payload9}${check10}`
    const result: IsbnConvertResult = { valid: true, direction: 'to10', source: normalized, converted }
    result.formatted = hyphenated && groups.length >= 3
      ? [...groups.slice(1, -1), check10].join('-')
      : converted
    return result
  }

  return {
    valid: false,
    error: `not an ISBN: expected 10 digits (optionally ending in X) or 13 digits, optionally hyphenated; got "${raw}"`,
  }
}
