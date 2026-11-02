/**
 * checkdigit_scan — free-text identifier scan.
 *
 * ORACLE: test/oracle/anchors.py
 * (the fixtures, every offset, and the counts below are printed by that script,
 * which re-implements the documented scanning contract independently)
 */

import { describe, expect, it } from 'vitest'
import { buildCheckdigitTools } from '../src/tools.ts'
import { SCAN_LIMIT, SCAN_TEXT_LIMIT, scanText } from '../src/scan.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const tools = buildCheckdigitTools()

const SCAN_TEXT =
  'Invoice 2026-11: card 4111 1111 1111 1111 charged, '
  + 'ISBN 978 0 306 40615 7, '
  + 'LEI 529900T8BM49AURSDO55, '
  + 'ORCID 0000-0002-1825-0097, '
  + 'IBAN GB82 WEST 1234 5698 7654 32, '
  + 'SEDOL B15KXQ8. '
  + 'Order 1234 has 77 items; bad copy 9780306406158.'

const SCAN_BAD_TEXT = 'Card 4111 1111 1111 1111 ok; code 4111 1111 1111 1112 fails; ISBN 9780306406158 too.'

const SCAN_NPI_TEXT = 'NPI 1234567893 and 1245319599 and 1234567890.'

describe('checkdigit_scan', () => {
  it('finds every identifier in prose, merging the groups that belong together', async () => {
    const result = await tools.checkdigit_scan.execute({ text: SCAN_TEXT })
    expect(result.scanned).toBe(22)
    expect(result.total).toBe(6)
    expect(result.validCount).toBe(6)
    expect(result.invalidCount).toBe(0)
    expect(result.truncated).toBe(false)
    expect(result.matches.map((m) => [m.scheme, m.value, m.start, m.end])).toEqual([
      ['luhn', '4111 1111 1111 1111', 22, 41],
      ['ean13', '978 0 306 40615 7', 56, 73],
      ['lei', '529900T8BM49AURSDO55', 79, 99],
      ['orcid', '0000-0002-1825-0097', 107, 126],
      ['iban', 'GB82 WEST 1234 5698 7654 32', 133, 160],
      ['sedol', 'B15KXQ8', 168, 175],
    ])
    expect(result.matches[0]?.checkDigit).toBe('1')
    expect(result.matches[4]?.checkDigit).toBe('82')
    assertLossless(result, 'scan')
  })

  it('keeps failing copies out unless includeInvalid is set', async () => {
    const quiet = await tools.checkdigit_scan.execute({ text: SCAN_BAD_TEXT })
    expect(quiet.total).toBe(1)
    expect(quiet.invalidCount).toBe(0)

    const loud = await tools.checkdigit_scan.execute({ text: SCAN_BAD_TEXT, includeInvalid: true })
    expect(loud.scanned).toBe(11)
    expect(loud.total).toBe(2)
    expect(loud.validCount).toBe(1)
    expect(loud.invalidCount).toBe(1)
    expect(loud.matches.map((m) => [m.scheme, m.value, m.start, m.end, m.valid])).toEqual([
      ['luhn', '4111 1111 1111 1111', 5, 24, true],
      ['ean13', '9780306406158', 66, 79, false],
    ])
    expect(loud.matches[1]?.checkDigit).toBe('8')
    expect(loud.matches[1]?.expected).toBe('7')
    assertLossless(loud, 'scan invalid')
  })

  it('honours an explicit scheme list and the result cap', async () => {
    const result = await tools.checkdigit_scan.execute({ text: SCAN_NPI_TEXT, schemes: ['npi'], includeInvalid: true, limit: 2 })
    expect(result.scanned).toBe(6)
    expect(result.total).toBe(3)
    expect(result.validCount).toBe(2)
    expect(result.invalidCount).toBe(1)
    expect(result.truncated).toBe(true)
    expect(result.matches).toHaveLength(2)
    expect(result.matches.map((m) => m.value)).toEqual(['1234567893', '1245319599'])
    assertLossless(result, 'scan npi')
  })

  it('reads the identifiers back out of the text with their offsets', async () => {
    const result = await tools.checkdigit_scan.execute({ text: SCAN_TEXT })
    for (const match of result.matches) {
      expect(SCAN_TEXT.slice(match.start, match.end)).toBe(match.value)
    }
  })

  it('reports an empty text instead of an empty success', () => {
    expect(scanText('   ').error).toContain('some text')
  })

  it('refuses text over the limit and limits outside 1..50', () => {
    const big = 'a'.repeat(SCAN_TEXT_LIMIT + 1)
    expect(scanText(big).error).toContain(String(SCAN_TEXT_LIMIT))
    expect(scanText('123', { limit: 0 }).error).toContain('limit')
    expect(scanText('123', { limit: SCAN_LIMIT + 1 }).error).toContain('limit')
  })

  it('does not report short numbers as card numbers', () => {
    const result = scanText('Order 1234 has 77 items.')
    expect(result.total).toBe(0)
    expect(result.scanned).toBe(4)
  })

  it('renders a compact summary', () => {
    const value = scanText(SCAN_TEXT)
    const output = tools.checkdigit_scan.output.render({ text: SCAN_TEXT }, value as never)
    if (!Array.isArray(output)) throw new Error('render must return an array')
    const block = output.find((b) => b.type === 'text')
    if (block === undefined) throw new Error('no text block')
    expect(block.text).toContain('6 valid, 0 failing of 22 candidate string(s)')
    expect(block.text).toContain('529900T8BM49AURSDO55 (lei)')
    expect(block.text).toContain('+2 more')
  })
})
