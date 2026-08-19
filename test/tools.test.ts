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

  it('rejects unrecognizable values gracefully', async () => {
    const result = await tools.checkdigit_validate.execute({ value: 'not-an-identifier' })
    expect(result.valid).toBe(false)
    expect(result.scheme).toBe('unknown')
  })
})

describe('checkdigit_info', () => {
  it('lists all schemes', async () => {
    const result = await tools.checkdigit_info.execute({})
    expect(result.schemes.length).toBe(11)
    expect(result.schemes.map((s) => s.id)).toContain('iban')
  })

  it('filters to one scheme', async () => {
    const result = await tools.checkdigit_info.execute({ scheme: 'iban' })
    expect(result.schemes).toHaveLength(1)
    expect(result.schemes[0]?.name).toContain('IBAN')
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
