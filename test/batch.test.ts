/**
 * Batch-validator tests for dsh-checkdigit (checkdigit_batch).
 *
 * ORACLE: test/oracle/anchors.py
 *
 * The counts, the per-scheme breakdown, the per-row scheme/validity and the
 * contract limit below are printed by that independently written Python script
 * (its `batch_report()` mirrors the documented contract of the tool with its
 * own detection and its own scheme implementations).
 */

import { describe, expect, it } from 'vitest'
import { BATCH_LIMIT, buildCheckdigitTools } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const tools = buildCheckdigitTools()

/** Same list the oracle prints its batch anchors for. */
const AUTO_VALUES = [
  '79927398713',
  '79927398714',
  'B15KXQ8',
  'B15KXQ7',
  '978-0-306-40615-7',
  'GB82WEST12345698765432',
  'not-an-id',
  '1234567893',
]

describe('checkdigit_batch (auto-detect)', () => {
  it('reports the counts, the breakdown and one row per value in request order', async () => {
    const result = await tools.checkdigit_batch.execute({ values: AUTO_VALUES })
    expect(result.total).toBe(8)
    expect(result.validCount).toBe(4)
    expect(result.invalidCount).toBe(3)
    expect(result.unknownCount).toBe(1)
    expect(result.byScheme).toEqual([
      { scheme: 'luhn', count: 2 },
      { scheme: 'sedol', count: 2 },
      { scheme: 'ean13', count: 1 },
      { scheme: 'iban', count: 1 },
      { scheme: 'isbn10', count: 1 },
      { scheme: 'unknown', count: 1 },
    ])
    expect(result.results.map((row) => [row.index, row.scheme, row.valid])).toEqual([
      [1, 'luhn', true],
      [2, 'luhn', false],
      [3, 'sedol', true],
      [4, 'sedol', false],
      [5, 'ean13', true],
      [6, 'iban', true],
      [7, 'unknown', false],
      [8, 'isbn10', false],
    ])
    assertLossless(result, 'checkdigit_batch')
  })

  it('keeps the value as submitted and the check-digit detail per row', async () => {
    const result = await tools.checkdigit_batch.execute({ values: ['B15KXQ7'] })
    expect(result.results[0]).toEqual({
      index: 1,
      value: 'B15KXQ7',
      scheme: 'sedol',
      valid: false,
      checkDigit: '7',
      expected: '8',
      detail: 'SEDOL: check digit should be 8, but the value ends in 7',
    })
  })

  it('explains an unrecognized value instead of dropping it', async () => {
    const result = await tools.checkdigit_batch.execute({ values: ['not-an-id'] })
    expect(result.unknownCount).toBe(1)
    expect(result.results[0]).toMatchObject({ scheme: 'unknown', valid: false, checkDigit: '', expected: '' })
    expect(result.results[0]!.detail).toContain('unrecognized')
  })

  it('applies an explicit scheme to every value (npi, which is not auto-detected)', async () => {
    const result = await tools.checkdigit_batch.execute({ values: ['1234567893', '1245319599', '1234567890'], scheme: 'npi' })
    expect(result.total).toBe(3)
    expect(result.validCount).toBe(2)
    expect(result.invalidCount).toBe(1)
    expect(result.unknownCount).toBe(0)
    expect(result.byScheme).toEqual([{ scheme: 'npi', count: 3 }])
    expect(result.results.map((row) => row.valid)).toEqual([true, true, false])
  })
})

describe('checkdigit_batch request guards', () => {
  it('rejects an empty list', async () => {
    const result = await tools.checkdigit_batch.execute({ values: [] })
    expect(result.error).toContain('at least one')
    expect(result.total).toBe(0)
    expect(result.results).toEqual([])
    expect(result.byScheme).toEqual([])
    assertLossless(result, 'checkdigit_batch-empty')
  })

  it('rejects a list over the limit instead of truncating it silently', async () => {
    const values = Array.from({ length: BATCH_LIMIT + 1 }, () => '79927398713')
    const result = await tools.checkdigit_batch.execute({ values })
    expect(result.error).toContain(String(BATCH_LIMIT + 1))
    expect(result.total).toBe(0)
    expect(result.results).toEqual([])
  })

  it('accepts exactly the limit', async () => {
    const values = Array.from({ length: BATCH_LIMIT }, () => '79927398713')
    const result = await tools.checkdigit_batch.execute({ values })
    expect(result.error).toBeUndefined()
    expect(result.total).toBe(BATCH_LIMIT)
    expect(result.validCount).toBe(BATCH_LIMIT)
  })
})

describe('checkdigit_batch renderer', () => {
  it('renders a one-line summary plus the first failures', async () => {
    const args = { values: AUTO_VALUES }
    const result = await tools.checkdigit_batch.execute(args)
    const rendered = tools.checkdigit_batch.output.render(args, result)[0]
    const text = rendered?.text ?? ''
    expect(text.split('\n')[0]).toBe('4/8 valid, 1 unrecognized — luhn×2, sedol×2, ean13×1, iban×1, isbn10×1, unknown×1')
    expect(text).toContain('#2 79927398714:')
    expect(text).toContain('#4 B15KXQ7:')
    expect(text).toContain('#7 not-an-id: unrecognized identifier format: not-an-id')
  })

  it('renders the request error on its own line', async () => {
    const args = { values: [] as string[] }
    const result = await tools.checkdigit_batch.execute(args)
    const rendered = tools.checkdigit_batch.output.render(args, result)[0]
    expect(rendered?.text).toBe('checkdigit_batch: give at least one value to check')
  })
})
