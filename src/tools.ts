/**
 * Tool definitions for dsh-checkdigit: six tools exposed to every agent via
 * defineTool with strict JSON-schema parameter surfaces and compact text
 * renderers.
 *
 *   checkdigit_generate — compute the check digit(s) for a payload
 *   checkdigit_validate — verify a full identifier (auto-detect the scheme)
 *   checkdigit_repair   — find the single-character edits that make it valid
 *   checkdigit_batch    — validate a whole column of identifiers at once
 *   checkdigit_info     — describe the supported schemes
 *   isbn_convert        — convert ISBN-10 <-> ISBN-13 (978 prefix only)
 *
 * @module dsh-checkdigit/tools
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { SCHEMES, SCHEME_IDS, detectScheme, schemeMetaList, type SchemeId } from './core.ts'
import { repairIdentifier, type RepairResult } from './repair.ts'
import { convertIsbn, type IsbnConvertResult } from './isbn.ts'
import { formatIban, ibanDetail, type IbanDetail } from './iban.ts'

export interface ToolSet {
  checkdigit_generate: ToolDefinition
  checkdigit_validate: ToolDefinition
  checkdigit_repair: ToolDefinition
  checkdigit_batch: ToolDefinition
  checkdigit_info: ToolDefinition
  isbn_convert: ToolDefinition
}

/** Successful generate result (keys assigned only when present — lossless JSON). */
export interface GenerateOk {
  valid: true
  scheme: string
  checkDigit: string
  complete: string
}

export interface GenerateFail {
  valid: false
  scheme: string
  error: string
}

export interface ValidateResult {
  valid: boolean
  scheme: string
  checkDigit: string
  expected: string
  detail: string
  iban?: IbanDetail
}

export interface SchemeInfo {
  id: string
  name: string
  description: string
  length: string
  payload: string
  check: string
  example: string
}

export interface InfoResult {
  schemes: SchemeInfo[]
}

/** One row of the batch report. */
export interface BatchItem {
  /** 1-based position of the value in the request. */
  index: number
  /** The value exactly as submitted. */
  value: string
  /** Scheme used (explicitly requested or auto-detected); 'unknown' when none matched. */
  scheme: string
  valid: boolean
  checkDigit: string
  expected: string
  detail: string
}

export interface BatchResult {
  /** How many values were checked. */
  total: number
  /** Values whose check digit is correct. */
  validCount: number
  /** Values with a scheme but a failing check digit. */
  invalidCount: number
  /** Values whose format matched no known scheme. */
  unknownCount: number
  /** Per-scheme counts, most frequent first (ties by scheme id). */
  byScheme: { scheme: string; count: number }[]
  /** One entry per submitted value, in request order. */
  results: BatchItem[]
  /** Set only when the request itself was rejected (empty or oversized list). */
  error?: string
}

/** Maximum number of identifiers accepted by one batch call. */
export const BATCH_LIMIT = 50

/** Assemble the full identifier for a generated check digit. */
function assembleComplete(scheme: SchemeId, payload: string, checkDigit: string): string {
  const normalized = scheme === 'isin' || scheme === 'cusip' || scheme === 'iban'
    ? payload.toUpperCase().replace(/[\s-]/g, '')
    : payload
  if (scheme === 'iban') {
    return `${normalized.slice(0, 2)}${checkDigit}${normalized.slice(2)}`
  }
  return normalized + checkDigit
}

function renderGenerate(_args: { scheme: string; payload: string }, value: unknown): string {
  const result = value as { valid: boolean; scheme: string; checkDigit?: string; complete?: string; error?: string }
  if (!result.valid) return `${result.scheme}: ${result.error}`
  return `${result.scheme}: check digit ${result.checkDigit} → ${result.complete}`
}

function renderValidate(_args: { value: string }, value: unknown): string {
  const result = value as ValidateResult
  if (result.valid) {
    const suffix = result.iban === undefined
      ? ''
      : ` [${result.iban.country} · ${result.iban.formatted}]`
    return `valid ${result.scheme} (check digit ${result.checkDigit})${suffix}`
  }
  if (result.expected !== '') return `invalid ${result.scheme}: ${result.detail}`
  return `${result.detail}`
}

function renderRepair(_args: { value: string; scheme?: string }, value: unknown): string {
  const result = value as RepairResult
  if (result.valid) return `valid ${result.scheme} — nothing to repair`
  if (result.repairs.length === 0) return `no single-edit repair for ${result.scheme}: ${result.detail}`
  const shown = result.repairs.slice(0, 3).map((repair) => {
    if (repair.type === 'check-digit') return `fix check character → ${repair.value}`
    if (repair.type === 'transpose') return `swap ${repair.from} at ${repair.position} → ${repair.value}`
    return `position ${repair.position}: ${repair.from}→${repair.to} → ${repair.value}`
  })
  const more = result.total > shown.length ? ` (+${result.total - shown.length} more)` : ''
  return `${result.scheme}: ${result.total} repair(s) — ${shown.join('; ')}${more}`
}

function renderBatch(_args: { values: string[]; scheme?: string }, value: unknown): string {
  const result = value as BatchResult
  if (result.error !== undefined) return `checkdigit_batch: ${result.error}`
  const breakdown = result.byScheme.map((entry) => `${entry.scheme}×${entry.count}`).join(', ')
  const unknown = result.unknownCount === 0 ? '' : `, ${result.unknownCount} unrecognized`
  const head = `${result.validCount}/${result.total} valid${unknown}${breakdown === '' ? '' : ` — ${breakdown}`}`
  const problems = result.results
    .filter((item) => !item.valid)
    .slice(0, 5)
    .map((item) => `  #${item.index} ${item.value}: ${item.detail}`)
  return problems.length === 0 ? head : `${head}\n${problems.join('\n')}`
}

function renderInfo(_args: unknown, value: unknown): string {
  const result = value as InfoResult
  const lines = result.schemes.map((s) => `  ${s.id} — ${s.name}: ${s.description} (length ${s.length}, example ${s.example})`)
  return `supported check-digit schemes:\n${lines.join('\n')}`
}

function renderIsbnConvert(_args: { isbn: string }, value: unknown): string {
  const result = value as IsbnConvertResult
  if (!result.valid) return `isbn_convert: ${result.error}`
  return `isbn_convert: ${result.source} ${result.direction === 'to13' ? '→' : '←'} ${result.converted} (${result.formatted})`
}

/** Build all three tool definitions. */
export function buildCheckdigitTools(): ToolSet {
  const checkdigit_generate = defineTool({
    name: 'checkdigit_generate',
    description: 'Compute the check digit for a payload under a named scheme (luhn, verhoeff, damm, isbn10, isbn13, '
      + 'ean8, ean13, upca, gtin14, issn, isin, cusip, iban, cas, aba) and return the complete identifier. For iban the payload is the '
      + '2-letter country code followed by the BBAN, and the result is the two mod-97 check digits. Pure local '
      + 'arithmetic — use it to build test card numbers, ISBNs, barcodes or account numbers with correct check digits.',
    parameters: {
      scheme: {
        type: 'string',
        required: true,
        enum: [...SCHEME_IDS],
        description: 'Check-digit scheme to apply.',
      },
      payload: {
        type: 'string',
        required: true,
        description: 'The digits (or identifier body) to compute the check digit for, without the check digit itself. '
          + 'Examples: "7992739871" for luhn, "030640615" for isbn10, "US037833100" for isin, "GBWEST12345698765432" for iban.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          scheme: { type: 'string', required: true },
          checkDigit: { type: 'string' },
          complete: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args: { scheme: string; payload: string }, value: unknown) => [{ type: 'text', text: renderGenerate(_args, value) }],
    },
    async execute(args: { scheme: SchemeId; payload: string }): Promise<GenerateOk | GenerateFail> {
      const spec = SCHEMES[args.scheme]
      try {
        const checkDigit = spec.generate(args.payload)
        return { valid: true, scheme: args.scheme, checkDigit, complete: assembleComplete(args.scheme, args.payload, checkDigit) }
      } catch (error) {
        return { valid: false, scheme: args.scheme, error: error instanceof Error ? error.message : String(error) }
      }
    },
  })

  const checkdigit_validate = defineTool({
    name: 'checkdigit_validate',
    description: 'Verify the check digit of a full identifier. When scheme is omitted the scheme is auto-detected '
      + '(cas for hyphenated CAS Registry Numbers, isin, 9-digit ABA routing numbers, cusip, iban, ean13, upca, '
      + 'ean8, issn for X-terminated values, isbn10, then luhn). Reports validity, the check digit found, the expected digit when wrong, and a '
      + 'human-readable explanation. Pure local arithmetic.',
    parameters: {
      value: {
        type: 'string',
        required: true,
        description: 'The full identifier to verify, e.g. "79927398713", "9780306406157", "US0378331005", '
          + '"GB82WEST12345698765432". Spaces and dashes are ignored.',
      },
      scheme: {
        type: 'string',
        enum: [...SCHEME_IDS],
        description: 'Optional scheme hint; omit to auto-detect.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          scheme: { type: 'string', required: true },
          checkDigit: { type: 'string', required: true },
          expected: { type: 'string', required: true },
          detail: { type: 'string', required: true },
          iban: {
            type: 'object',
            additionalProperties: false,
            properties: {
              country: { type: 'string', required: true },
              checkDigits: { type: 'string', required: true },
              bban: { type: 'string', required: true },
              formatted: { type: 'string', required: true },
            },
          },
        },
      },
      render: (_args: { value: string }, value: unknown) => [{ type: 'text', text: renderValidate(_args, value) }],
    },
    async execute(args: { value: string; scheme?: SchemeId }): Promise<ValidateResult> {
      const scheme: SchemeId | undefined = args.scheme ?? detectScheme(args.value)
      if (scheme === undefined) {
        return {
          valid: false,
          scheme: 'unknown',
          checkDigit: '',
          expected: '',
          detail: `unrecognized identifier format: ${args.value}`,
        }
      }
      const result = SCHEMES[scheme].validate(args.value)
      const output: ValidateResult = {
        valid: result.valid,
        scheme,
        checkDigit: result.checkDigit,
        expected: result.expected,
        detail: result.detail,
      }
      if (scheme === 'iban') {
        const detail = ibanDetail(args.value)
        if (detail !== undefined) output.iban = detail
      }
      return output
    },
  })

  const checkdigit_repair = defineTool({
    name: 'checkdigit_repair',
    description: 'When an identifier fails its check digit, enumerate the single-character edits that make it valid: a '
      + 'corrected check character, a swapped adjacent pair, or one mistyped payload character. Every returned repair is '
      + 'confirmed by the scheme validator, ordered most-likely-first (check character, then transpositions, then '
      + 'substitutions), capped at 20 with the full count reported. Use it to answer "what was this number most likely '
      + 'meant to be?" for a mistyped card number, ISBN, ISSN, barcode, IBAN or CAS Registry Number. Pure local arithmetic.',
    parameters: {
      value: {
        type: 'string',
        required: true,
        description: 'The identifier that failed validation, e.g. "79927398714", "9780306406158", "7732-18-6". '
          + 'Spaces, dashes and dots are ignored.',
      },
      scheme: {
        type: 'string',
        enum: [...SCHEME_IDS],
        description: 'Optional scheme hint; omit to auto-detect.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          scheme: { type: 'string', required: true },
          checkDigit: { type: 'string', required: true },
          expected: { type: 'string', required: true },
          total: { type: 'number', required: true },
          truncated: { type: 'boolean', required: true },
          repairs: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: { type: 'string', required: true, enum: ['check-digit', 'transpose', 'substitute'] },
                position: { type: 'number', required: true },
                from: { type: 'string', required: true },
                to: { type: 'string', required: true },
                value: { type: 'string', required: true },
              },
            },
          },
          detail: { type: 'string', required: true },
        },
      },
      render: (_args: { value: string; scheme?: string }, value: unknown) => [{ type: 'text', text: renderRepair(_args, value) }],
    },
    async execute(args: { value: string; scheme?: SchemeId }): Promise<RepairResult> {
      return repairIdentifier(args.value, args.scheme)
    },
  })

  const checkdigit_batch = defineTool({
    name: 'checkdigit_batch',
    description: 'Validate a whole column of identifiers in one call (1–50 values, spreadsheet order preserved): '
      + 'each value is auto-detected unless a scheme is given, and the report carries one row per value plus the '
      + 'counts (valid / invalid / unrecognized) and a per-scheme breakdown. Use it instead of calling '
      + 'checkdigit_validate once per row when checking a pasted list of card numbers, ISBNs, ISSNs, IBANs, SEDOLs, '
      + 'NPIs or CAS numbers. Pure local arithmetic — the list never leaves the machine.',
    parameters: {
      values: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'The identifiers to check, in the order they were pasted (1–50). Spaces, dashes and dots are '
          + 'ignored per value, exactly as in checkdigit_validate.',
      },
      scheme: {
        type: 'string',
        enum: [...SCHEME_IDS],
        description: 'Optional scheme applied to every value (e.g. "npi" or "gtin14", which are not auto-detected); '
          + 'omit to detect each value on its own.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'number', required: true },
          validCount: { type: 'number', required: true },
          invalidCount: { type: 'number', required: true },
          unknownCount: { type: 'number', required: true },
          byScheme: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                scheme: { type: 'string', required: true },
                count: { type: 'number', required: true },
              },
            },
          },
          results: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                index: { type: 'number', required: true },
                value: { type: 'string', required: true },
                scheme: { type: 'string', required: true },
                valid: { type: 'boolean', required: true },
                checkDigit: { type: 'string', required: true },
                expected: { type: 'string', required: true },
                detail: { type: 'string', required: true },
              },
            },
          },
          error: { type: 'string' },
        },
      },
      render: (_args: { values: string[]; scheme?: string }, value: unknown) => [{ type: 'text', text: renderBatch(_args, value) }],
    },
    async execute(args: { values: string[]; scheme?: SchemeId }): Promise<BatchResult> {
      const values = args.values
      const empty: BatchResult = { total: 0, validCount: 0, invalidCount: 0, unknownCount: 0, byScheme: [], results: [] }
      if (values.length === 0) return { ...empty, error: 'give at least one value to check' }
      if (values.length > BATCH_LIMIT) {
        return { ...empty, error: `too many values: ${values.length} (limit ${BATCH_LIMIT} per call)` }
      }
      const results: BatchItem[] = []
      const counts = new Map<string, number>()
      let validCount = 0
      let unknownCount = 0
      for (let i = 0; i < values.length; i++) {
        const value = values[i]!
        const scheme: SchemeId | undefined = args.scheme ?? detectScheme(value)
        if (scheme === undefined) {
          unknownCount++
          counts.set('unknown', (counts.get('unknown') ?? 0) + 1)
          results.push({
            index: i + 1,
            value,
            scheme: 'unknown',
            valid: false,
            checkDigit: '',
            expected: '',
            detail: `unrecognized identifier format: ${value}`,
          })
          continue
        }
        const checked = SCHEMES[scheme].validate(value)
        if (checked.valid) validCount++
        counts.set(scheme, (counts.get(scheme) ?? 0) + 1)
        results.push({
          index: i + 1,
          value,
          scheme,
          valid: checked.valid,
          checkDigit: checked.checkDigit,
          expected: checked.expected,
          detail: checked.detail,
        })
      }
      const byScheme = [...counts.entries()]
        .map(([scheme, count]) => ({ scheme, count }))
        .sort((a, b) => b.count - a.count || (a.scheme < b.scheme ? -1 : 1))
      return {
        total: values.length,
        validCount,
        invalidCount: values.length - validCount - unknownCount,
        unknownCount,
        byScheme,
        results,
      }
    },
  })

  const checkdigit_info = defineTool({
    name: 'checkdigit_info',
    description: 'Describe the supported check-digit schemes: identifier lengths, payload formats, check-digit '
      + 'positions and worked examples. Call with a scheme id for one scheme, or without arguments for all.',
    parameters: {
      scheme: {
        type: 'string',
        enum: [...SCHEME_IDS],
        description: 'Optional scheme id (e.g. "iban" or "isbn10"); omit to list every scheme.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          schemes: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                name: { type: 'string', required: true },
                description: { type: 'string', required: true },
                length: { type: 'string', required: true },
                payload: { type: 'string', required: true },
                check: { type: 'string', required: true },
                example: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args: { scheme?: string }, value: unknown) => [{ type: 'text', text: renderInfo(_args, value) }],
    },
    async execute(args: { scheme?: SchemeId }): Promise<InfoResult> {
      const all = schemeMetaList()
      const filtered = args.scheme === undefined ? all : all.filter((s) => s.id === args.scheme)
      return { schemes: filtered }
    },
  })

  const isbn_convert = defineTool({
    name: 'isbn_convert',
    description: 'Convert an ISBN-10 to ISBN-13 (prepend the 978 Bookland prefix, recompute the EAN-13 check digit) '
      + 'or an ISBN-13 back to ISBN-10 (only the 978 prefix; 979-prefixed ISBN-13s have no ISBN-10 equivalent). The '
      + 'input check digit is verified first; hyphens and spaces are ignored and the input grouping is preserved in '
      + 'the formatted output. Pure local arithmetic.',
    parameters: {
      isbn: {
        type: 'string',
        required: true,
        description: 'An ISBN-10 (9 digits + digit/X) or ISBN-13 (13 digits), with or without hyphens/spaces, '
          + 'e.g. "0-306-40615-2" or "9780306406157". Case-insensitive X.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          valid: { type: 'boolean', required: true },
          direction: { type: 'string', enum: ['to13', 'to10'] },
          source: { type: 'string' },
          converted: { type: 'string' },
          formatted: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args: { isbn: string }, value: unknown) => [{ type: 'text', text: renderIsbnConvert(_args, value) }],
    },
    async execute(args: { isbn: string }): Promise<IsbnConvertResult> {
      return convertIsbn(args.isbn)
    },
  })

  return { checkdigit_generate, checkdigit_validate, checkdigit_repair, checkdigit_batch, checkdigit_info, isbn_convert }
}

/** Re-export for consumers that need the formatter directly. */
export { formatIban }
