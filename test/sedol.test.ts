/**
 * SEDOL tests for dsh-checkdigit.
 *
 * ORACLE: test/oracle/anchors.py
 *
 * The check digits, the published valid codes, the published bad checksum and
 * the alphabet invariants below are all printed by that independently written
 * Python script (run it with `python3 test/oracle/anchors.py`); it implements
 * the LSE character table and the weight vector 1,3,1,7,3,9 from the published
 * specification rather than calling this build.
 */

import { describe, expect, it } from 'vitest'
import { SCHEMES, detectScheme } from '../src/core.ts'
import { repairIdentifier } from '../src/repair.ts'
import { buildCheckdigitTools } from '../src/tools.ts'

const tools = buildCheckdigitTools()

describe('sedol scheme spec', () => {
  it('computes the published check digits', () => {
    expect(SCHEMES.sedol.generate('B15KXQ')).toBe('8')
    expect(SCHEMES.sedol.generate('026349')).toBe('4')
    expect(SCHEMES.sedol.generate('B0YBKJ')).toBe('7')
    expect(SCHEMES.sedol.generate('070995')).toBe('4')
  })

  it('accepts the published codes and flags the published bad checksum', () => {
    for (const code of ['B15KXQ8', '0263494', 'B0YBKJ7', '0709954']) {
      expect(SCHEMES.sedol.validate(code).valid).toBe(true)
    }
    const bad = SCHEMES.sedol.validate('B15KXQ7')
    expect(bad.valid).toBe(false)
    expect(bad.expected).toBe('8')
  })

  it('ignores separators and folds case', () => {
    expect(SCHEMES.sedol.validate('b15kxq8').valid).toBe(true)
    expect(SCHEMES.sedol.validate('B15-KXQ-8').valid).toBe(true)
    expect(SCHEMES.sedol.validate('b15 kxq 8').valid).toBe(true)
  })

  it('rejects vowels and digit-leading mixed codes without guessing a digit', () => {
    const vowel = SCHEMES.sedol.validate('A15KXQ8')
    expect(vowel.valid).toBe(false)
    expect(vowel.expected).toBe('')
    const mixed = SCHEMES.sedol.validate('015KXQ8')
    expect(mixed.valid).toBe(false)
    expect(mixed.expected).toBe('')
    expect(mixed.detail).toContain('all digits')
  })

  it('throws on malformed payloads instead of inventing a check digit', () => {
    expect(() => SCHEMES.sedol.generate('B15KX')).toThrow(/6 characters/)
    expect(() => SCHEMES.sedol.generate('B15KXA')).toThrow(/6 characters/)
    expect(() => SCHEMES.sedol.generate('015KXQ')).toThrow(/all digits/)
    expect(() => SCHEMES.sedol.generate('B15KXQ')).not.toThrow()
  })
})

describe('sedol detection', () => {
  it('claims letter-leading seven-character codes', () => {
    expect(detectScheme('B15KXQ8')).toBe('sedol')
    expect(detectScheme('B15KXQ7')).toBe('sedol')
    expect(detectScheme('b15-kxq-8')).toBe('sedol')
  })

  it('leaves digit-only seven-character values to luhn', () => {
    expect(detectScheme('1234567')).toBe('luhn')
  })
})

describe('sedol repair', () => {
  it('repairs a mistyped check digit', () => {
    const result = repairIdentifier('B15KXQ7')
    expect(result.scheme).toBe('sedol')
    expect(result.total).toBe(19)
    expect(result.repairs[0]).toEqual({ type: 'check-digit', position: 7, from: '7', to: '8', value: 'B15KXQ8' })
  })

  it('repairs a check character typed as a letter (one candidate, explicit scheme)', () => {
    // Detection needs the trailing digit to call it a SEDOL, so a letter there
    // has to be named explicitly — the repair space is still searched.
    expect(detectScheme('B15KXQK')).toBeUndefined()
    const result = repairIdentifier('B15KXQK', 'sedol')
    expect(result.scheme).toBe('sedol')
    expect(result.total).toBe(1)
    expect(result.repairs[0]).toEqual({ type: 'check-digit', position: 7, from: 'K', to: '8', value: 'B15KXQ8' })
  })
})

describe('sedol through the tool surface', () => {
  it('generates and validates through checkdigit_generate / checkdigit_validate', async () => {
    expect(await tools.checkdigit_generate.execute({ scheme: 'sedol', payload: 'B15KXQ' })).toEqual({
      valid: true,
      scheme: 'sedol',
      checkDigit: '8',
      complete: 'B15KXQ8',
    })
    const checked = await tools.checkdigit_validate.execute({ value: 'B15KXQ7' })
    expect(checked.scheme).toBe('sedol')
    expect(checked.valid).toBe(false)
    expect(checked.expected).toBe('8')
    const ok = await tools.checkdigit_validate.execute({ value: 'B15KXQ8' })
    expect(ok.valid).toBe(true)
    expect(ok.detail).toContain('1,3,1,7,3,9')
  })
})
