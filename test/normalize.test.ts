/**
 * checkdigit_normalize — canonical form of an identifier plus the edits made.
 *
 * ORACLE: test/oracle/anchors.py
 * (every canonical string, edit description and check digit below is printed by
 * that script's "normalisation anchors" section, which re-implements the
 * documented contract independently and self-checks the structural invariants —
 * idempotence, verdict preservation, and the standard layout per scheme)
 */

import { describe, expect, it } from 'vitest'
import { buildCheckdigitTools } from '../src/tools.ts'
import { normalizeIdentifier } from '../src/normalize.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const tools = buildCheckdigitTools()

describe('checkdigit_normalize', () => {
  it('leaves an identifier that is already in its printed form untouched', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: 'GB82 WEST 1234 5698 7654 32' })
    expect(result.scheme).toBe('iban')
    expect(result.valid).toBe(true)
    expect(result.normalized).toBe('GB82 WEST 1234 5698 7654 32')
    expect(result.changed).toBe(false)
    expect(result.changes).toEqual([])
    expect(result.grouping).toBe('4-4-4-…-4')
    expect(result.checkDigit).toBe('82')
    assertLossless(result)
  })

  it('uppercases and groups an unbroken IBAN', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: 'gb82west12345698765432' })
    expect(result.normalized).toBe('GB82 WEST 1234 5698 7654 32')
    expect(result.changed).toBe(true)
    expect(result.changes).toEqual([
      { kind: 'case', detail: 'uppercased the identifier' },
      { kind: 'grouping', detail: 'inserted spaces every 4-4-4-…-4 group' },
    ])
    assertLossless(result)
  })

  it('replaces non-standard separators with the printed layout', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: 'GB82-WEST-1234-5698-7654-32' })
    expect(result.normalized).toBe('GB82 WEST 1234 5698 7654 32')
    expect(result.changes).toEqual([
      { kind: 'separators', detail: 'replaced 5 separators with the 4-4-4-…-4 layout' },
    ])
  })

  it('groups an ORCID iD as ORCID prints it', async () => {
    const broken = await tools.checkdigit_normalize.execute({ value: '0000000210286941' })
    expect(broken.scheme).toBe('orcid')
    expect(broken.normalized).toBe('0000-0002-1028-6941')
    expect(broken.grouping).toBe('4-4-4-4')
    expect(broken.changes).toEqual([{ kind: 'grouping', detail: 'inserted hyphens every 4-4-4-4 group' }])

    const canonical = await tools.checkdigit_normalize.execute({ value: '0000-0002-1028-6941' })
    expect(canonical.normalized).toBe('0000-0002-1028-6941')
    expect(canonical.changed).toBe(false)
    expect(canonical.changes).toEqual([])
  })

  it('uppercases the X check character of an ORCID iD', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: '000012345678908x' })
    expect(result.normalized).toBe('0000-1234-5678-908X')
    expect(result.valid).toBe(true)
    expect(result.changes.map((change) => change.kind)).toEqual(['case', 'grouping'])
  })

  it('applies the ISSN layout only when the scheme is named', async () => {
    const named = await tools.checkdigit_normalize.execute({ value: '03785955', scheme: 'issn' })
    expect(named.scheme).toBe('issn')
    expect(named.normalized).toBe('0378-5955')
    expect(named.grouping).toBe('4-4')
    expect(named.changes).toEqual([{ kind: 'grouping', detail: 'inserted hyphens every 4-4 group' }])

    // The same eight digits auto-detect as an EAN-8 barcode, which is printed
    // unbroken — the ambiguity is reported, not silently resolved.
    const detected = await tools.checkdigit_normalize.execute({ value: '03785955' })
    expect(detected.scheme).toBe('ean8')
    expect(detected.normalized).toBe('03785955')
    expect(detected.grouping).toBeUndefined()
  })

  it('lays out a CAS Registry Number as <digits>-<2>-<1>', async () => {
    const named = await tools.checkdigit_normalize.execute({ value: '7732185', scheme: 'cas' })
    expect(named.normalized).toBe('7732-18-5')
    expect(named.grouping).toBe('n-2-1')
    expect(named.valid).toBe(true)
    expect(named.changes).toEqual([{ kind: 'grouping', detail: 'inserted hyphens every n-2-1 group' }])

    const canonical = await tools.checkdigit_normalize.execute({ value: '7732-18-5' })
    expect(canonical.normalized).toBe('7732-18-5')
    expect(canonical.changes).toEqual([])
  })

  it('uppercases a LEI without inventing a separator layout', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: '529900t8bm49aursdo55' })
    expect(result.scheme).toBe('lei')
    expect(result.normalized).toBe('529900T8BM49AURSDO55')
    expect(result.changes).toEqual([{ kind: 'case', detail: 'uppercased the identifier' }])
    expect(result.grouping).toBeUndefined()
    expect(result.note).toBeUndefined()
  })

  it('refuses to guess ISBN hyphenation and says what would be needed', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: '978 0 306 40615 7', scheme: 'isbn13' })
    expect(result.scheme).toBe('isbn13')
    expect(result.normalized).toBe('9780306406157')
    expect(result.changes).toEqual([{ kind: 'separators', detail: 'removed 4 separators' }])
    expect(result.grouping).toBeUndefined()
    expect(result.note).toContain('registration-group range tables')
    expect(result.valid).toBe(true)
  })

  it('leaves card numbers unbroken and explains why no layout is claimed', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: '4111 1111 1111 1111' })
    expect(result.scheme).toBe('luhn')
    expect(result.normalized).toBe('4111111111111111')
    expect(result.note).toContain('varies by issuer')
    expect(result.grouping).toBeUndefined()
  })

  it('normalises an invalid identifier but never reports it as valid', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: '4111 1111 1111 1112' })
    expect(result.valid).toBe(false)
    expect(result.normalized).toBe('4111111111111112')
    expect(result.checkDigit).toBe('2')
    expect(result.expected).toBe('1')
  })

  it('reports an unknown scheme instead of guessing a form', async () => {
    const result = await tools.checkdigit_normalize.execute({ value: 'not an identifier' })
    expect(result.scheme).toBe('unknown')
    expect(result.valid).toBe(false)
    expect(result.normalized).toBeUndefined()
    expect(result.error).toContain('no supported scheme matches')
  })

  it('is idempotent and preserves the verdict', async () => {
    const fixtures: Array<[string, Parameters<typeof normalizeIdentifier>[1]]> = [
      ['gb82west12345698765432', undefined],
      ['GB82-WEST-1234-5698-7654-32', undefined],
      ['0000000210286941', undefined],
      ['03785955', 'issn'],
      ['7732185', 'cas'],
      ['529900t8bm49aursdo55', undefined],
      ['978 0 306 40615 7', 'isbn13'],
      ['4111 1111 1111 1112', undefined],
    ]
    for (const [value, scheme] of fixtures) {
      const first = normalizeIdentifier(value, scheme)
      const second = normalizeIdentifier(first.normalized!, first.scheme as Parameters<typeof normalizeIdentifier>[1])
      expect(second.normalized).toBe(first.normalized)
      expect(second.changes).toEqual([])
      expect(second.valid).toBe(first.valid)
      assertLossless(first)
    }
  })

  it('renders the canonical form, the edits and the note', async () => {
    const canonical = tools.checkdigit_normalize.output.render(
      { value: 'gb82west12345698765432' },
      normalizeIdentifier('gb82west12345698765432'),
    )
    const text = canonical[0].text as string
    expect(text).toContain('checkdigit_normalize — iban, valid: GB82 WEST 1234 5698 7654 32')
    expect(text).toContain('edits: uppercased the identifier; inserted spaces every 4-4-4-…-4 group')

    const unchanged = tools.checkdigit_normalize.output.render(
      { value: '7732-18-5' },
      normalizeIdentifier('7732-18-5'),
    )
    expect(unchanged[0].text).toContain('already canonical')

    const isbn = tools.checkdigit_normalize.output.render(
      { value: '978 0 306 40615 7' },
      normalizeIdentifier('978 0 306 40615 7', 'isbn13'),
    )
    expect(isbn[0].text).toContain('note: ISBN hyphenation needs the registration-group range tables')

    const unknown = tools.checkdigit_normalize.output.render(
      { value: 'not an identifier' },
      normalizeIdentifier('not an identifier'),
    )
    expect(unknown[0].text).toBe('checkdigit_normalize: no supported scheme matches this value; name the scheme to normalise it anyway')
  })
})
