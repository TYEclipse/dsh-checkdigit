/**
 * Free-text identifier scan for dsh-checkdigit.
 *
 * `checkdigit_batch` needs one value per line; real pastes are prose — a
 * receipt, an email, a spreadsheet export with labels around the numbers. This
 * module walks the text and reports the identifiers whose check digit actually
 * holds, with the offsets needed to slice them back out.
 *
 * Two deliberate rules keep the output honest:
 *
 *   1. **A match is a claim the check digit can back.** Nothing is reported
 *      unless a scheme recognises the shape; validity is decided by the same
 *      validators the other tools use.
 *   2. **Groups are merged only when the merged value validates.** IBANs are
 *      printed in blocks of four and ISBNs in five groups, so adjacent tokens
 *      are tried as one value (up to five groups, 34 characters). A failed
 *      merge proves nothing and is dropped — which is also why prose does not
 *      get glued into identifiers.
 *
 * @module dsh-checkdigit/scan
 */

import { SCHEMES, detectScheme, type SchemeId } from './core.ts'
import type { CheckResult } from './core.ts'

/** Longest text accepted by one scan call. */
export const SCAN_TEXT_LIMIT = 20000
/** Most matches returned by one call (the total is always reported in full). */
export const SCAN_LIMIT = 50
/** How many whitespace-separated groups may be merged into one value. */
export const SCAN_MERGE_GROUPS = 8
/** Longest single group that may take part in a merge. */
export const SCAN_GROUP_MAX = 12
/** Longest merged value that is still worth checking. */
export const SCAN_MERGED_MAX = 34
/** Auto-detection only claims Luhn for identifier-length runs, not for any number. */
export const LUHN_SCAN_MIN = 12
export const LUHN_SCAN_MAX = 19

export interface ScanMatch {
  /** The text exactly as it appears (separators included). */
  value: string
  /** Which scheme claimed it. */
  scheme: string
  /** True when the check digit holds. */
  valid: boolean
  /** Offset of the first character in the scanned text. */
  start: number
  /** Offset one past the last character. */
  end: number
  /** The check character(s) found. */
  checkDigit: string
  /** The check character(s) the payload requires. */
  expected: string
}

export interface ScanResult {
  /** Tokens examined (whitespace-separated, punctuation trimmed, length ≥ 3). */
  scanned: number
  /** Matches found, before the result cap. */
  total: number
  validCount: number
  invalidCount: number
  /** True when the returned list was cut off at the requested limit. */
  truncated: boolean
  matches: ScanMatch[]
  /** Set only when the request itself was rejected. */
  error?: string
}

interface Token {
  /** The token with surrounding punctuation removed. */
  core: string
  /** Absolute offset of `core` in the text. */
  start: number
  /** Absolute offset one past `core`. */
  end: number
}

const TOKEN_RE = /\S+/g
const EDGE_JUNK = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g

/** Split the text into tokens, trimming the punctuation people wrap numbers in. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  for (const match of text.matchAll(TOKEN_RE)) {
    const raw = match[0]
    const base = match.index ?? 0
    const core = raw.replace(EDGE_JUNK, '')
    if (core === '') continue
    const offset = raw.indexOf(core)
    tokens.push({ core, start: base + offset, end: base + offset + core.length })
  }
  return tokens
}

interface Candidate {
  scheme: SchemeId
  result: CheckResult
}

/**
 * Decide what a candidate string is. With an explicit scheme list every listed
 * scheme is tried in turn; otherwise the documented detection order decides.
 */
function evaluate(value: string, schemes: readonly SchemeId[] | undefined): Candidate | undefined {
  if (schemes !== undefined && schemes.length > 0) {
    let fallback: Candidate | undefined
    for (const scheme of schemes) {
      const result = SCHEMES[scheme].validate(value)
      if (result.valid) return { scheme, result }
      // `expected !== ''` means the shape matched but the check digit did not.
      if (fallback === undefined && result.expected !== '') fallback = { scheme, result }
    }
    return fallback
  }
  const scheme = detectScheme(value)
  if (scheme === undefined) return undefined
  return { scheme, result: SCHEMES[scheme].validate(value) }
}

/** Auto-detection claims Luhn only for identifier-length digit runs. */
function plausible(candidate: Candidate, value: string, explicit: boolean): boolean {
  if (explicit || candidate.scheme !== 'luhn') return true
  const digits = value.replace(/[\s.-]/g, '')
  return digits.length >= LUHN_SCAN_MIN && digits.length <= LUHN_SCAN_MAX
}

/**
 * Scan free text for identifiers.
 *
 * @param text     the text to read
 * @param options  `schemes` restricts the search, `includeInvalid` also reports
 *                 single tokens whose check digit fails, `limit` caps the list
 */
export function scanText(
  text: string,
  options: { schemes?: readonly SchemeId[]; includeInvalid?: boolean; limit?: number } = {},
): ScanResult {
  const empty: ScanResult = { scanned: 0, total: 0, validCount: 0, invalidCount: 0, truncated: false, matches: [] }
  if (text.trim() === '') return { ...empty, error: 'give some text to scan' }
  if (text.length > SCAN_TEXT_LIMIT) {
    return { ...empty, error: `text is too long: ${text.length} characters (limit ${SCAN_TEXT_LIMIT} per call)` }
  }
  const limit = options.limit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > SCAN_LIMIT) {
    return { ...empty, error: `limit must be an integer from 1 to ${SCAN_LIMIT}` }
  }
  const explicit = options.schemes !== undefined && options.schemes.length > 0
  const tokens = tokenize(text)
  const matches: ScanMatch[] = []
  let total = 0
  let validCount = 0
  let invalidCount = 0
  let scanned = 0

  const record = (token: Token, candidate: Candidate, value: string): void => {
    total++
    if (candidate.result.valid) validCount++
    else invalidCount++
    if (matches.length >= limit) return
    matches.push({
      value,
      scheme: candidate.scheme,
      valid: candidate.result.valid,
      start: token.start,
      end: token.end,
      checkDigit: candidate.result.checkDigit,
      expected: candidate.result.expected,
    })
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    const single = token.core.length >= 3 ? evaluate(token.core, options.schemes) : undefined
    if (token.core.length >= 3) scanned++
    if (single !== undefined && plausible(single, token.core, explicit)) {
      if (single.result.valid) {
        record(token, single, token.core)
        continue
      }
      if (options.includeInvalid === true) {
        record(token, single, token.core)
        continue
      }
    }
    // Not a whole identifier on its own: try the next few tokens as the groups
    // of one value (IBANs come in fours, ISBNs in five parts). Two rules keep
    // this honest: a merge may only START from a token that carries a digit (so
    // a word is never glued onto the front of a number), and the longest
    // grouping is tried first so the complete identifier wins over a prefix
    // that happens to pass by chance.
    if (!/\d/.test(token.core)) continue
    let merged = false
    const maxGroups = Math.min(SCAN_MERGE_GROUPS, tokens.length - i)
    for (let k = maxGroups; k >= 2; k--) {
      const group = tokens.slice(i, i + k)
      if (!group.every((item) => item.core.length >= 1 && item.core.length <= SCAN_GROUP_MAX)) continue
      const joined = group.map((item) => item.core).join('')
      if (joined.length > SCAN_MERGED_MAX) continue
      const candidate = evaluate(joined, options.schemes)
      if (candidate === undefined || !candidate.result.valid) continue
      if (!plausible(candidate, joined, explicit)) continue
      const first = group[0]!
      const last = group[group.length - 1]!
      record({ core: joined, start: first.start, end: last.end }, candidate, text.slice(first.start, last.end))
      i += k - 1
      merged = true
      break
    }
    if (merged) continue
  }

  return {
    scanned,
    total,
    validCount,
    invalidCount,
    truncated: total > matches.length,
    matches,
  }
}
