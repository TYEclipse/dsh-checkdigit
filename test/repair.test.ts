/**
 * Repair-search tests for dsh-checkdigit.
 *
 * ORACLE: test/oracle/anchors.py
 *
 * Every count, position and repaired value asserted below is printed by that
 * script — an independent implementation of the published specifications plus a
 * separate repair enumerator, committed with this repo. Run it to regenerate:
 * `python3 test/oracle/anchors.py`.
 */

import { describe, expect, it } from 'vitest'
import { repairIdentifier, REPAIR_LIMIT } from '../src/repair.ts'
import { buildCheckdigitTools } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'



describe('repairIdentifier', () => {
  it('reports nothing to repair for a valid identifier', () => {
    const result = repairIdentifier('79927398713')
    expect(result.valid).toBe(true)
    expect(result.total).toBe(0)
    expect(result.repairs).toHaveLength(0)
    expect(result.detail).toContain('already satisfies')
  })

  it('repairs a mistyped check digit first (luhn)', () => {
    const result = repairIdentifier('79927398714')
    expect(result.valid).toBe(false)
    expect(result.scheme).toBe('luhn')
    expect(result.checkDigit).toBe('4')
    expect(result.expected).toBe('3')
    expect(result.total).toBe(12)
    expect(result.truncated).toBe(false)
    expect(result.repairs[0]).toEqual({
      type: 'check-digit',
      position: 11,
      from: '4',
      to: '3',
      value: '79927398713',
    })
  })

  it('finds a swapped adjacent pair (luhn)', () => {
    const result = repairIdentifier('79927398173')
    expect(result.total).toBe(12)
    expect(result.repairs[1]).toEqual({
      type: 'transpose',
      position: 9,
      from: '17',
      to: '71',
      value: '79927398713',
    })
  })

  it('surfaces an X check character (isbn10)', () => {
    const result = repairIdentifier('0975229801')
    expect(result.scheme).toBe('isbn10')
    expect(result.total).toBe(11)
    expect(result.repairs[0]).toEqual({
      type: 'check-digit',
      position: 10,
      from: '1',
      to: 'X',
      value: '097522980X',
    })
  })

  it('repairs an ISSN by its mod-11 character', () => {
    // An all-digit ISSN is shape-identical to EAN-8, so the scheme is named.
    const result = repairIdentifier('20493633', 'issn')
    expect(result.scheme).toBe('issn')
    expect(result.total).toBe(9)
    expect(result.repairs[0]).toEqual({
      type: 'check-digit',
      position: 8,
      from: '3',
      to: '0',
      value: '20493630',
    })
  })

  it('repairs a GTIN-14 case code', () => {
    // 14 digits stay luhn on auto-detection, so the scheme is named.
    const result = repairIdentifier('09780306406151', 'gtin14')
    expect(result.scheme).toBe('gtin14')
    expect(result.total).toBe(17)
    expect(result.repairs[0]).toEqual({
      type: 'check-digit',
      position: 14,
      from: '1',
      to: '7',
      value: '09780306406157',
    })
  })

  it('offers both IBAN repairs for a corrupted BBAN digit', () => {
    const result = repairIdentifier('GB82WEST12345698765431')
    expect(result.scheme).toBe('iban')
    expect(result.total).toBe(7)
    // Repair A: keep the account, recompute the mod-97 check digits.
    expect(result.repairs[0]).toEqual({
      type: 'check-digit',
      position: 3,
      from: '82',
      to: '12',
      value: 'GB12WEST12345698765431',
    })
    // Repair B: keep the check digits, fix the mistyped BBAN digit — this is
    // the real-world IBAN GB82WEST12345698765432.
    expect(result.repairs[6]).toEqual({
      type: 'substitute',
      position: 22,
      from: '1',
      to: '2',
      value: 'GB82WEST12345698765432',
    })
  })

  it('caps the repair list and reports the full count', () => {
    const result = repairIdentifier('123456789012345678901234567890', 'damm')
    expect(result.total).toBe(37)
    expect(result.truncated).toBe(true)
    expect(result.repairs).toHaveLength(REPAIR_LIMIT)
    expect(result.repairs[0]).toMatchObject({ type: 'check-digit', position: 30, to: '2' })
  })

  it('returns no repairs when the shape itself is wrong', () => {
    const result = repairIdentifier('123', 'isbn10')
    expect(result.valid).toBe(false)
    expect(result.total).toBe(0)
    expect(result.repairs).toHaveLength(0)
    expect(result.expected).toBe('')
    expect(result.detail).toContain('must be')
  })

  it('reports an unrecognized format instead of guessing', () => {
    const result = repairIdentifier('not-an-identifier')
    expect(result.scheme).toBe('unknown')
    expect(result.total).toBe(0)
    expect(result.detail).toContain('unrecognized identifier format')
  })

  it('ignores separators, so a hyphenated typo still repairs', () => {
    const result = repairIdentifier('7992-7398-714')
    expect(result.scheme).toBe('luhn')
    expect(result.repairs[0]).toMatchObject({ type: 'check-digit', value: '79927398713' })
  })
})

describe('checkdigit_repair tool', () => {
  const tools = buildCheckdigitTools()

  it('returns a lossless repair result', async () => {
    const result = await tools.checkdigit_repair.execute({ value: '79927398714' })
    expect(result.scheme).toBe('luhn')
    expect(result.total).toBe(12)
    assertLossless(result, 'repair')
  })

  it('renders the most likely repair', () => {
    const rendered = tools.checkdigit_repair.output.render({ value: '79927398714' }, {
      valid: false,
      scheme: 'luhn',
      checkDigit: '4',
      expected: '3',
      total: 12,
      truncated: false,
      repairs: [{ type: 'check-digit', position: 11, from: '4', to: '3', value: '79927398713' }],
      detail: 'luhn: check digit should be 3, but the value ends in 4',
    })
    const text = rendered.map((part: { text: string }) => part.text).join('\n')
    expect(text).toContain('fix check character')
    expect(text).toContain('79927398713')
    expect(text).toContain('+11 more')
  })

  it('rejects unknown schemes at the schema layer (ToolArgsError)', async () => {
    await expect(tools.checkdigit_repair.execute({ value: '79927398714', scheme: 'foo' as never })).rejects.toThrow()
  })
})
