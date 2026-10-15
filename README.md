# dsh-checkdigit

Check-digit mathematics toolbox for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh): generate, validate, repair and detect check digits for **17 schemes** — Luhn, Verhoeff, Damm, ISBN-10, ISBN-13, EAN-8, EAN-13, UPC-A, GTIN-14, ISSN, ISIN, CUSIP, **SEDOL**, IBAN, **CAS Registry Number**, **ABA routing number** and **NPI** — plus an **ISBN-10 ⇄ ISBN-13 converter**, a **single-edit repair search** ("what was this number most likely meant to be?") and a **batch validator** for whole columns of identifiers.

> 校验位数学工具箱：生成 / 验证 / 修复 / 识别 17 种校验位（Luhn、Verhoeff、Damm、ISBN、EAN、UPC、GTIN-14、ISSN、ISIN、CUSIP、SEDOL、IBAN、CAS 化学文摘号、ABA 美国银行路由号、NPI 美国医疗提供者号），另带 ISBN-10 与 ISBN-13 互转、「单字符修复」搜索工具、以及批量校验工具；零运行时依赖、纯本地算术。

## Why

Language models routinely botch check-digit arithmetic: wrong card-number checksums, ISBNs that fail validation, IBANs with impossible check digits. Every algorithm here is implemented from its published specification with **pure integer arithmetic** — deterministic, offline, zero runtime dependencies — and cross-checked against published worked examples (Apple's `US0378331005`, the classic `GB82 WEST 1234 5698 7654 32`, the Luhn textbook example `79927398713`, water's CAS number `7732-18-5`, and more).

## Install

```bash
dsh plugin --profile web add github:TYEclipse/dsh-checkdigit
```

Then add `dsh-checkdigit` to `dsh.profile.bundles` in your profile's `package.json` if it is not auto-activated, and restart dsh.

## Tools

### `checkdigit_generate`

Compute the check digit for a payload and return the complete identifier.

```text
checkdigit_generate(scheme="luhn", payload="7992739871")
→ checkDigit: "3", complete: "79927398713"
```

Supported `scheme` values and their payloads:

| scheme    | payload                             | check digit      | example complete |
|-----------|-------------------------------------|------------------|------------------|
| `luhn`    | digits (any length ≥ 1)             | last digit       | `79927398713` |
| `verhoeff`| digits (any length ≥ 1)             | last digit       | `2363` |
| `damm`    | digits (any length ≥ 1)             | last digit       | `5724` |
| `isbn10`  | 9 digits                            | 10th char (0-9 or X) | `0306406152` |
| `isbn13`  | 12 digits                           | 13th digit       | `9780306406157` |
| `ean8`    | 7 digits                            | 8th digit        | `96385074` |
| `ean13`   | 12 digits                           | 13th digit       | `4006381333931` |
| `upca`    | 11 digits                           | 12th digit       | `036000291452` |
| `gtin14`  | 13 digits                           | 14th digit       | `09780306406157` |
| `issn`    | 7 digits                            | 8th char (0-9 or X) | `03785955` |
| `isin`    | 2 letters + 9 alphanumerics         | 12th char (digit)| `US0378331005` |
| `cusip`   | 8 chars from `[A-Z0-9*@#]`          | 9th char (digit) | `037833100` |
| `sedol`   | 6 chars from `[0-9]` + consonants   | 7th char (digit) | `B15KXQ8` |
| `iban`    | 2-letter country + BBAN             | chars 3–4 (two digits) | `GB82WEST12345698765432` |
| `cas`     | 2–9 digits (hyphens ignored)        | last digit       | `7732-18-5` |
| `aba`     | 8 digits                            | 9th digit        | `021000021` |
| `npi`     | 9 digits                            | 10th digit       | `1234567893` |

Use it to build test card numbers, ISBNs, barcodes, securities identifiers, routing numbers or account numbers whose check digits actually verify.

### `checkdigit_validate`

Verify the check digit of a full identifier. The scheme is auto-detected when omitted (CAS hyphenated → ISIN → 9-digit ABA → CUSIP → SEDOL (letter-leading) → IBAN → EAN-13 → UPC-A → ISSN (X-terminated) → EAN-8 → ISBN-10 → Luhn); pass `scheme` to force one. SEDOLs that are all digits and every NPI share their length with Luhn/ISBN-10 values, so those two have to be named.

```text
checkdigit_validate(value="GB82WEST12345698765432")
→ valid: true, scheme: "iban", iban.country: "GB", iban.formatted: "GB82 WEST 1234 5698 7654 32"

checkdigit_validate(value="7732-18-5")
→ valid: true, scheme: "cas", checkDigit: "5"

checkdigit_validate(value="021000021")
→ valid: true, scheme: "aba", checkDigit: "1"

checkdigit_validate(value="79927398714")
→ valid: false, scheme: "luhn", checkDigit: "4", expected: "3",
  detail: "Luhn: check digit should be 3, but the value ends in 4"
```

Spaces, dashes and dots in the input are ignored (the spaced card form `4111 1111 1111 1111`, the hyphenated `978-0-306-40615-7` and the printed `0378-5955` all validate). When a value is invalid, the result carries the **expected** check digit so callers can fix it programmatically.

### `checkdigit_repair`

When a value fails, enumerate the **single-character edits that make it valid** — a corrected check character, a swapped adjacent pair, or one mistyped payload character. Every repair is confirmed by the scheme's own validator and ordered most-likely-first.

```text
checkdigit_repair(value="79927398714")
→ scheme: "luhn", total: 12, checkDigit: "4", expected: "3"
  repairs[0]: { type: "check-digit", position: 11, from: "4", to: "3", value: "79927398713" }

checkdigit_repair(value="GB82WEST12345698765431")
→ scheme: "iban", total: 7
  repairs[0]: { type: "check-digit", position: 3, to: "12", value: "GB12WEST12345698765431" }   # keep the account
  repairs[6]: { type: "substitute", position: 22, from: "1", to: "2", value: "GB82WEST12345698765432" }  # keep the check digits
```

Both IBAN answers are legitimate — the caller can see whether the account digits or the check digits were more likely mistyped. `total` always reports the full count; the returned list is capped at 20 (`truncated: true`).

### `checkdigit_batch`

Validate a whole column of identifiers in one call — 1 to 50 values, request order preserved. Each value is auto-detected unless a `scheme` is given for the whole list, and the report carries one row per value plus the counts and a per-scheme breakdown.

```text
checkdigit_batch(values=["79927398713","79927398714","B15KXQ8","B15KXQ7","978-0-306-40615-7",
                         "GB82WEST12345698765432","not-an-id","1234567893"])
→ total: 8, validCount: 4, invalidCount: 3, unknownCount: 1
  byScheme: [luhn×2, sedol×2, ean13×1, iban×1, isbn10×1, unknown×1]
  results[3]: { index: 4, value: "B15KXQ7", scheme: "sedol", valid: false, checkDigit: "7", expected: "8" }

checkdigit_batch(values=["1234567893","1245319599","1234567890"], scheme="npi")
→ total: 3, validCount: 2, invalidCount: 1, unknownCount: 0
```

Use it for pasted lists and spreadsheet columns instead of one validation call per row. An empty list or more than 50 values is rejected with an `error` and no rows — the list is never truncated silently.

### `checkdigit_info`

Describe the supported schemes: identifier lengths, payload formats, check-digit positions and worked examples. Call with a `scheme` for one scheme, or without arguments for all 17.

### `isbn_convert`

Convert between ISBN-10 and ISBN-13 in both directions. The source check digit is verified first; the 978 Bookland prefix is prepended (10→13) or dropped (13→10) and the target check digit recomputed. Hyphen grouping from the input is preserved in `formatted`.

```text
isbn_convert(isbn="0-306-40615-2")
→ valid: true, direction: "to13", converted: "9780306406157", formatted: "978-0-306-40615-7"

isbn_convert(isbn="978-0-306-40615-7")
→ valid: true, direction: "to10", converted: "0306406152", formatted: "0-306-40615-2"

isbn_convert(isbn="9791090636071")
→ valid: false, error: "ISBN-13 with the 979 prefix has no ISBN-10 equivalent; only the 978 Bookland prefix maps back to ISBN-10"
```

ISBN-10 check digits may be `X` (value 10): `0-8044-2957-X` → `978-0-8044-2957-3`.

## Supported schemes

| Scheme | Standard | Detail |
|--------|----------|--------|
| Luhn | ISO/IEC 7812 | Credit/debit cards, IMEI, loyalty cards |
| Verhoeff | — | Dihedral-group checksum; catches all single errors and adjacent transpositions |
| Damm | — | Quasigroup operation; full-value tally must be zero |
| ISBN-10 | ISO 2108 | Mod-11; check digit may be `X` (= 10) |
| ISBN-13 | ISO 2108 | EAN-13 arithmetic (Bookland) |
| EAN-8 / EAN-13 | GS1 GTIN-8 / GTIN-13 | Retail barcodes |
| GTIN-14 / SSCC-18 | GS1 GTIN-14 | Logistics case and pallet codes; same mod-10 weighting as EAN/UPC over a 13-digit payload |
| ISSN | ISO 3297 | Serial publications; mod-11 check character may be `X` |
| UPC-A | GS1 GTIN-12 | North American retail barcodes |
| ISIN | ISO 6166 | Securities; letters expand A=10…Z=35, then Luhn |
| CUSIP | ANSI X9.6 | North American securities; `* @ #` allowed; even positions doubled |
| SEDOL | London Stock Exchange | UK/Ireland securities; 7 chars, weights 1,3,1,7,3,9, letters A=10…Z=35, vowels never issued |
| IBAN | ISO 13616 | Mod-97 over letter-expanded rearranged string; BBAN length table for 75+ countries |
| CAS Registry Number | CAS | Chemical substances; digit × position-from-right sum mod 10 |
| ABA routing number | US Federal Reserve | Bank routing transit numbers; 3-7-1 weighted sum mod 10 |
| NPI | CMS / US HHS | US healthcare provider identifiers; plain Luhn over the constant `80840` prefix, first digit 1 or 2 |

## Development

```bash
pnpm install
pnpm build
pnpm test   # 119 tests
pnpm lint
python3 test/oracle/anchors.py   # independent anchors for every numeric assertion
```

Test expectations are not hand-computed: `test/oracle/anchors.py` re-implements each scheme from its published specification in Python and prints every anchor the suites assert, including the repair counts and positions. Run it (or `pnpm test` on a fresh checkout) to regenerate them.

## License

MIT
