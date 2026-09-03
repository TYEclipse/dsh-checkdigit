/**
 * Tool-surface tests for dsh-checkdigit: schema discipline (R9), result
 * shapes and renderers.
 */

import { describe, expect, it } from 'vitest'
import { buildCheckdigitTools } from '../src/tools.ts'

const tools = buildCheckdigitTools()

describe('checkdigit_generate', () => {
  it('computes the check digit and the complete identifier', async () => {
    expect(await tools.checkdigit_generate.execute({ scheme: 'luhn', payload: '7992739871' })).toEqual({
      valid: true,
      scheme: 'luhn',
      checkDigit: '3',
      complete: '79927398713',
    })
    expect(await tools.checkdigit_generate.execute({ scheme: 'isbn10', payload: '030640615' })).toEqual({
      valid: true,
      scheme: 'isbn10',
      checkDigit: '2',
      complete: '0306406152',
    })
    expect(await tools.checkdigit_generate.execute({ scheme: 'isin', payload: 'us037833100' })).toEqual({
      valid: true,
      scheme: 'isin',
      checkDigit: '5',
      complete: 'US0378331005',
    })
    expect(await tools.checkdigit_generate.execute({ scheme: 'cas', payload: '773218' })).toEqual({
      valid: true,
      scheme: 'cas',
      checkDigit: '5',
      complete: '7732185',
    })
    expect(await tools.checkdigit_generate.execute({ scheme: 'aba', payload: '02100002' })).toEqual({
      valid: true,
      scheme: 'aba',
      checkDigit: '1',
      complete: '021000021',
    })
  })

  it('returns valid:false with an error for malformed payloads', async () => {
    const result = await tools.checkdigit_generate.execute({ scheme: 'isbn10', payload: '123' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('9 digits')
  })

  it('rejects unknown schemes at the schema layer (ToolArgsError)', async () => {
    await expect(tools.checkdigit_generate.execute({ scheme: 'foo' as never, payload: '123' })).rejects.toThrow()
  })
})

describe('checkdigit_validate', () => {
  it('validates with auto-detection', async () => {
    expect(await tools.checkdigit_validate.execute({ value: '9780306406157' })).toMatchObject({
      valid: true,
      scheme: 'ean13',
      checkDigit: '7',
    })
  })

  it('reports the expected digit when wrong', async () => {
    const result = await tools.checkdigit_validate.execute({ value: '79927398714' })
    expect(result.valid).toBe(false)
    expect(result.scheme).toBe('luhn')
    expect(result.expected).toBe('3')
  })

  it('honors an explicit scheme hint over detection', async () => {
    // 13 digits auto-detect as ean13; forcing isbn13 gives the same math.
    const result = await tools.checkdigit_validate.execute({ value: '9780306406157', scheme: 'isbn13' })
    expect(result.scheme).toBe('isbn13')
    expect(result.valid).toBe(true)
  })

  it('auto-detects CAS and ABA schemes', async () => {
    expect(await tools.checkdigit_validate.execute({ value: '7732-18-5' })).toMatchObject({
      valid: true,
      scheme: 'cas',
      checkDigit: '5',
    })
    expect(await tools.checkdigit_validate.execute({ value: '021000021' })).toMatchObject({
      valid: true,
      scheme: 'aba',
      checkDigit: '1',
    })
    const badAba = await tools.checkdigit_validate.execute({ value: '021000022' })
    expect(badAba.valid).toBe(false)
    expect(badAba.expected).toBe('1')
  })

  it('rejects unrecognizable values gracefully', async () => {
    const result = await tools.checkdigit_validate.execute({ value: 'not-an-identifier' })
    expect(result.valid).toBe(false)
    expect(result.scheme).toBe('unknown')
  })
})

describe('checkdigit_info', () => {
  it('lists all schemes', async () => {
    const result = await tools.checkdigit_info.execute({})
    expect(result.schemes.length).toBe(13)
    expect(result.schemes.map((s) => s.id)).toContain('iban')
    expect(result.schemes.map((s) => s.id)).toContain('cas')
    expect(result.schemes.map((s) => s.id)).toContain('aba')
  })

  it('filters to one scheme', async () => {
    const result = await tools.checkdigit_info.execute({ scheme: 'iban' })
    expect(result.schemes).toHaveLength(1)
    expect(result.schemes[0]?.name).toContain('IBAN')
  })
})

// ---------------------------------------------------------------------------
// isbn_convert
// ---------------------------------------------------------------------------

/** Recursive guard: no key may hold undefined (lossless-JSON gate, R7/R18). */
function assertNoUndefined(value: unknown, path: string): void {
  if (value === null) return
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      expect(child, `${path}.${key}`).not.toBeUndefined()
      assertNoUndefined(child, `${path}.${key}`)
    }
  }
}

describe('isbn_convert', () => {
  it('converts ISBN-10 to ISBN-13 (978 prefix, recomputed check)', async () => {
    expect(await tools.isbn_convert.execute({ isbn: '0306406152' })).toEqual({
      valid: true,
      direction: 'to13',
      source: '0306406152',
      converted: '9780306406157',
      formatted: '9780306406157',
    })
  })

  it('preserves hyphen grouping in the formatted output', async () => {
    const result = await tools.isbn_convert.execute({ isbn: '0-306-40615-2' })
    expect(result).toEqual({
      valid: true,
      direction: 'to13',
      source: '0306406152',
      converted: '9780306406157',
      formatted: '978-0-306-40615-7',
    })
    assertNoUndefined(result, 'isbn_convert')
  })

  it('converts ISBN-13 back to ISBN-10 (978 prefix only)', async () => {
    const result = await tools.isbn_convert.execute({ isbn: '978-0-306-40615-7' })
    expect(result).toEqual({
      valid: true,
      direction: 'to10',
      source: '9780306406157',
      converted: '0306406152',
      formatted: '0-306-40615-2',
    })
    assertNoUndefined(result, 'isbn_convert')
  })

  it('handles X check digits (080442957X -> 9780804429573)', async () => {
    const result = await tools.isbn_convert.execute({ isbn: '0-8044-2957-X' })
    expect(result.valid).toBe(true)
    expect(result.converted).toBe('9780804429573')
    expect(result.formatted).toBe('978-0-8044-2957-3')
    assertNoUndefined(result, 'isbn_convert')
  })

  it('reports 979-prefixed ISBN-13 as having no ISBN-10 equivalent', async () => {
    const result = await tools.isbn_convert.execute({ isbn: '9791090636071' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('979')
    assertNoUndefined(result, 'isbn_convert')
  })

  it('verifies the source check digit before converting', async () => {
    const result = await tools.isbn_convert.execute({ isbn: '0306406153' })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('should be 2')
    assertNoUndefined(result, 'isbn_convert')
  })

  it('rejects non-ISBN input gracefully', async () => {
    const result = await tools.isbn_convert.execute({ isbn: 'not-an-isbn' })
    expect(result.valid).toBe(false)
    assertNoUndefined(result, 'isbn_convert')
  })
})

describe('renderers', () => {
  const render = (tool: keyof typeof tools, args: Record<string, unknown>, value: unknown): string => {
    const output = tools[tool].output.render(args, value as never)
    if (!Array.isArray(output)) throw new Error('render must return an array')
    const block = output.find((b) => b.type === 'text')
    if (block === undefined) throw new Error('no text block')
    return block.text
  }

  it('renders generate results compactly', () => {
    const text = render('checkdigit_generate', { scheme: 'luhn' }, {
      valid: true, scheme: 'luhn', checkDigit: '3', complete: '79927398713',
    })
    expect(text).toBe('luhn: check digit 3 → 79927398713')
  })

  it('renders validate results compactly', () => {
    const text = render('checkdigit_validate', { value: '79927398714' }, {
      valid: false, scheme: 'luhn', checkDigit: '4', expected: '3',
      detail: 'Luhn: check digit should be 3, but the value ends in 4',
    })
    expect(text).toContain('invalid luhn')
    expect(text).toContain('3')
  })
})
