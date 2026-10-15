/**
 * Single-edit repair search for dsh-checkdigit.
 *
 * When a value fails its check digit the useful question is not "is it wrong"
 * but "what was it most likely meant to be". Every scheme here has a small,
 * enumerable repair space, so this module searches it exhaustively and returns
 * the edits that make the value valid:
 *
 *   1. `check-digit` — the check character itself was mistyped (by far the most
 *      common error: a single wrong final digit).
 *   2. `transpose`   — two adjacent characters were swapped.
 *   3. `substitute`  — one payload character was mistyped as another.
 *
 * The search is bounded (alphabet + length decide the work, the result list is
 * capped) and every candidate is confirmed by the scheme's own validator, so a
 * repair is never reported unless the repaired value really validates.
 *
 * @module dsh-checkdigit/repair
 */

import { SCHEMES, detectScheme, type SchemeId } from './core.ts'

/** Maximum number of repairs returned (the count is always reported in full). */
export const REPAIR_LIMIT = 20

export type RepairKind = 'check-digit' | 'transpose' | 'substitute'

export interface RepairCandidate {
  /** How the value has to be edited. */
  type: RepairKind
  /** 1-based position of the edit in the normalised value. */
  position: number
  /** Character(s) currently at that position. */
  from: string
  /** Character(s) the repair puts there. */
  to: string
  /** The repaired identifier. */
  value: string
}

export interface RepairResult {
  /** True when the input already satisfies its check digit. */
  valid: boolean
  /** The scheme used (or 'unknown' when nothing matched). */
  scheme: string
  /** The check character(s) found in the input. */
  checkDigit: string
  /** The check character(s) the payload requires. */
  expected: string
  /** How many repairs exist (may exceed the returned list). */
  total: number
  /** True when the returned list was cut off at REPAIR_LIMIT. */
  truncated: boolean
  /** The repairs, most likely first. */
  repairs: RepairCandidate[]
  /** Human-readable explanation. */
  detail: string
}

/** Characters an edit may introduce; letters only for the alphanumeric schemes. */
const ALPHANUMERIC: readonly SchemeId[] = ['isin', 'cusip', 'sedol', 'iban']
/** Schemes whose check character may be the letter X. */
const X_SCHEMES: readonly SchemeId[] = ['isbn10', 'issn']

/** Drop separators (spaces, dashes, dots) and fold case for the letter schemes. */
const UPPERCASE_SCHEMES: readonly SchemeId[] = ['isin', 'cusip', 'sedol', 'iban', 'isbn10', 'issn']

function normalize(scheme: SchemeId, value: string): string {
  const stripped = value.replace(/[\s.-]/g, '')
  return UPPERCASE_SCHEMES.includes(scheme) ? stripped.toUpperCase() : stripped
}

function replaceAt(value: string, index: number, char: string): string {
  return value.slice(0, index) + char + value.slice(index + 1)
}

function emptyResult(scheme: string, detail: string): RepairResult {
  return { valid: false, scheme, checkDigit: '', expected: '', total: 0, truncated: false, repairs: [], detail }
}

/** Position of the check characters: the trailing character(s) of the value. */
function checkSpan(scheme: SchemeId, length: number): { start: number; size: number } {
  return scheme === 'iban' ? { start: 2, size: 2 } : { start: length - 1, size: 1 }
}

/**
 * Enumerate the single-edit repairs for `value` under `scheme` (auto-detected
 * when omitted).
 */
export function repairIdentifier(value: string, scheme?: SchemeId): RepairResult {
  const resolved: SchemeId | undefined = scheme ?? detectScheme(value)
  if (resolved === undefined) return emptyResult('unknown', `unrecognized identifier format: ${value}`)

  const spec = SCHEMES[resolved]
  const normalized = normalize(resolved, value)
  const base = spec.validate(normalized)
  if (base.valid) {
    return {
      valid: true,
      scheme: resolved,
      checkDigit: base.checkDigit,
      expected: base.checkDigit,
      total: 0,
      truncated: false,
      repairs: [],
      detail: `${spec.meta.name}: the value already satisfies the check digit — nothing to repair`,
    }
  }
  // An empty `expected` means the value did not even have the right shape
  // (length/alphabet), so there is no repair space to search.
  if (base.expected === '') return emptyResult(resolved, base.detail)

  const span = checkSpan(resolved, normalized.length)
  const found: RepairCandidate[] = []
  const seen = new Set<string>()
  const push = (candidate: RepairCandidate): void => {
    if (seen.has(candidate.value)) return
    seen.add(candidate.value)
    found.push(candidate)
  }
  const accepts = (candidate: string): boolean => spec.validate(candidate).valid

  // 1. Check character(s) only — for IBAN those are the two digits at
  //    positions 3–4, for every other scheme it is the trailing character.
  const checkRepair = resolved === 'iban'
    ? normalized.slice(0, span.start) + base.expected + normalized.slice(span.start + span.size)
    : normalized.slice(0, -1) + base.expected
  if (accepts(checkRepair)) {
    push({
      type: 'check-digit',
      position: span.start + 1,
      from: normalized.slice(span.start, span.start + span.size),
      to: base.expected,
      value: checkRepair,
    })
  }

  // 2. Adjacent transpositions (positions are payload-only: swapping the check
  //    character with its neighbour still shows up as a substitution below).
  for (let i = 0; i + 1 < normalized.length; i++) {
    if (normalized[i] === normalized[i + 1]) continue
    const swapped = normalized.slice(0, i) + normalized[i + 1] + normalized[i] + normalized.slice(i + 2)
    if (accepts(swapped)) {
      push({
        type: 'transpose',
        position: i + 1,
        from: `${normalized[i]}${normalized[i + 1]}`,
        to: `${normalized[i + 1]}${normalized[i]}`,
        value: swapped,
      })
    }
  }

  // 3. Single-character substitutions over the payload. The check position is
  //    skipped: for every scheme here exactly one character validates there,
  //    and step 1 already produced it.
  const alphabet = ALPHANUMERIC.includes(resolved) ? '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '0123456789'
  for (let i = 0; i < normalized.length; i++) {
    if (i >= span.start && i < span.start + span.size) continue
    const chars = X_SCHEMES.includes(resolved) && i === normalized.length - 1 ? `${alphabet}X` : alphabet
    for (const char of chars) {
      if (char === normalized[i]) continue
      const repaired = replaceAt(normalized, i, char)
      if (accepts(repaired)) {
        push({ type: 'substitute', position: i + 1, from: normalized[i]!, to: char, value: repaired })
      }
    }
  }

  const truncated = found.length > REPAIR_LIMIT
  return {
    valid: false,
    scheme: resolved,
    checkDigit: base.checkDigit,
    expected: base.expected,
    total: found.length,
    truncated,
    repairs: found.slice(0, REPAIR_LIMIT),
    detail: found.length === 0
      ? `${spec.meta.name}: ${base.detail} — no single-character edit (check digit, transposition or substitution) makes the value valid`
      : `${spec.meta.name}: ${base.detail} — ${found.length} single-edit repair(s) make the value valid`,
  }
}
