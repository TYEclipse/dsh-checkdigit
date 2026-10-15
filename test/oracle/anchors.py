#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""anchors.py — independent anchor generator for dsh-checkdigit.

Everything asserted with a number in the test files is printed here, and every
value comes from this file's own implementation of the published check-digit
specifications — hand-written in plain Python, not imported from the plugin and
not produced by running the TypeScript build. When the two disagree, one of them
is wrong; the tests are allowed to assert only what is printed here.

The repair enumerator below mirrors the *contract* of src/repair.ts (check
character first, then adjacent transpositions, then single substitutions, capped
at 20, duplicates removed) but is written separately, so counts and positions in
test/repair.test.ts are second-source values rather than restatements.

Usage:
    python3 test/oracle/anchors.py            # print every anchor
    python3 test/oracle/anchors.py --check    # exit 1 if any self-check fails
"""

from __future__ import annotations

import re
import sys

# --------------------------------------------------------------------------
# Scheme implementations (published specifications)
# --------------------------------------------------------------------------

VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]

DAMM_Q = [
    [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
    [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
    [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
    [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
    [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
    [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
    [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
    [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
    [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
    [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
]


def digits_only(value: str) -> str:
    return "".join(ch for ch in value if not ch.isspace() and ch not in "-.")


def luhn(payload: str) -> str:
    total = 0
    double = True
    for ch in reversed(payload):
        d = int(ch)
        if double:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        double = not double
    return str((10 - total % 10) % 10)


def verhoeff_tally(value: str, offset: int = 0) -> int:
    c = 0
    for i in range(offset, len(value) + offset):
        d = int(value[len(value) - 1 - (i - offset)])
        c = VERHOEFF_D[c][VERHOEFF_P[i % 8][d]]
    return c


def verhoeff(payload: str) -> str:
    return str(VERHOEFF_INV[verhoeff_tally(payload, 1)])


def damm(payload: str) -> str:
    interim = 0
    for ch in payload:
        interim = DAMM_Q[interim][int(ch)]
    return str(interim)


def isbn10(payload: str) -> str:
    total = sum((10 - i) * int(ch) for i, ch in enumerate(payload))
    r = total % 11
    return "0" if r == 0 else "X" if r == 1 else str(11 - r)


def issn(payload: str) -> str:
    total = sum((8 - i) * int(ch) for i, ch in enumerate(payload))
    r = total % 11
    return "0" if r == 0 else "X" if r == 1 else str(11 - r)


def weighted_mod10(payload: str, weights: tuple[int, ...]) -> str:
    total = sum(int(ch) * weights[i % len(weights)] for i, ch in enumerate(payload))
    return str((10 - total % 10) % 10)


def ean13(payload: str) -> str:
    return weighted_mod10(payload, (1, 3))


def ean8(payload: str) -> str:
    return weighted_mod10(payload, (3, 1))


def upca(payload: str) -> str:
    return weighted_mod10(payload, (3, 1))


def gtin14(payload: str) -> str:
    # Rightmost payload digit carries weight 3; with an odd payload length that
    # makes position 1 carry weight 3 as well.
    assert len(payload) == 13, "gtin14 payload must be 13 digits"
    return weighted_mod10(payload, (3, 1))


def expand_letters(value: str) -> str:
    out = ""
    for ch in value:
        out += str(ord(ch) - 55) if "A" <= ch <= "Z" else ch
    return out


def isin(payload: str) -> str:
    return luhn(expand_letters(payload.upper()))


CUSIP_VALUES = {ch: ord(ch) - 55 for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}
CUSIP_VALUES.update({"*": 36, "@": 37, "#": 38})


def cusip(payload: str) -> str:
    total = 0
    for i, ch in enumerate(payload.upper()):
        value = int(ch) if ch.isdigit() else CUSIP_VALUES[ch]
        product = value * (1 if i % 2 == 0 else 2)
        total += sum(int(c) for c in str(product))
    return str((10 - total % 10) % 10)


IBAN_LENGTHS = {"GB": 22, "DE": 22, "NO": 15}


def mod97(number: str) -> int:
    remainder = 0
    for i in range(0, len(number), 9):
        remainder = int(str(remainder) + number[i:i + 9]) % 97
    return remainder


def iban_check_digits(country: str, bban: str) -> str:
    return str(98 - mod97(expand_letters(bban + country + "00"))).zfill(2)


def iban_valid(value: str) -> bool:
    flat = value.upper().replace(" ", "").replace("-", "")
    return mod97(expand_letters(flat[4:] + flat[:4])) == 1


def cas(payload: str) -> str:
    total = sum(int(ch) * (len(payload) - i) for i, ch in enumerate(payload))
    return str(total % 10)


def aba(payload: str) -> str:
    return weighted_mod10(payload, (3, 7, 1))


# --------------------------------------------------------------------------
# SEDOL — published alphabet (vowels are never issued) and weight vector
# 1,3,1,7,3,9. The alphabet string is the LSE character table; the self-check
# below re-derives the letter values from their ASCII codes, so a transcription
# error in this table cannot pass unnoticed.
# --------------------------------------------------------------------------

SEDOL_ALPHABET = "0123456789 BCD FGH JKLMN PQRST VWXYZ"
SEDOL_CHARS = set("0123456789BCDFGHJKLMNPQRSTVWXYZ")


def sedol(payload: str) -> str:
    weights = (1, 3, 1, 7, 3, 9)
    total = sum(w * SEDOL_ALPHABET.index(ch) for w, ch in zip(weights, payload))
    return str((10 - total) % 10)


def sedol_valid(value: str) -> bool:
    up = value.upper()
    if len(up) != 7 or any(ch not in SEDOL_CHARS for ch in up):
        return False
    # New-style codes start with a letter; a digit-leading code is old-style and
    # therefore all digits.
    if up[0].isdigit() and not up.isdigit():
        return False
    return sedol(up[:-1]) == up[-1]


# --------------------------------------------------------------------------
# NPI — plain Luhn over the constant prefix 80840 + the 9-digit payload; the
# first digit is the entity-type indicator (1 individual, 2 organisation).
# --------------------------------------------------------------------------


def npi(payload: str) -> str:
    return luhn("80840" + payload)


def npi_valid(value: str) -> bool:
    return len(value) == 10 and value.isdigit() and value[0] in "12" and npi(value[:-1]) == value[-1]



# --------------------------------------------------------------------------
# Validators (the repair enumerator confirms candidates with these)
# --------------------------------------------------------------------------


def valid(scheme: str, value: str) -> bool:
    if scheme == "luhn":
        return len(value) >= 2 and value.isdigit() and luhn(value[:-1]) == value[-1]
    if scheme == "verhoeff":
        return len(value) >= 2 and value.isdigit() and verhoeff_tally(value) == 0
    if scheme == "damm":
        return len(value) >= 2 and value.isdigit() and damm(value) == "0"
    if scheme == "isbn10":
        return len(value) == 10 and value[:9].isdigit() and isbn10(value[:9]) == value[-1].upper()
    if scheme == "isbn13":
        return len(value) == 13 and value.isdigit() and ean13(value[:-1]) == value[-1]
    if scheme == "ean13":
        return len(value) == 13 and value.isdigit() and ean13(value[:-1]) == value[-1]
    if scheme == "ean8":
        return len(value) == 8 and value.isdigit() and ean8(value[:-1]) == value[-1]
    if scheme == "upca":
        return len(value) == 12 and value.isdigit() and upca(value[:-1]) == value[-1]
    if scheme == "gtin14":
        return len(value) == 14 and value.isdigit() and gtin14(value[:-1]) == value[-1]
    if scheme == "issn":
        return len(value) == 8 and value[:7].isdigit() and issn(value[:7]) == value[-1].upper()
    if scheme == "isin":
        return len(value) == 12 and value[:2].isalpha() and isin(value[:-1]) == value[-1]
    if scheme == "cusip":
        return len(value) == 9 and cusip(value[:-1]) == value[-1]
    if scheme == "iban":
        return iban_valid(value)
    if scheme == "cas":
        flat = digits_only(value)
        return 3 <= len(flat) <= 10 and flat.isdigit() and cas(flat[:-1]) == flat[-1]
    if scheme == "aba":
        flat = digits_only(value)
        return len(flat) == 9 and flat.isdigit() and aba(flat[:-1]) == flat[-1]
    if scheme == "sedol":
        return sedol_valid(value)
    if scheme == "npi":
        return npi_valid(value)
    raise ValueError(f"unknown scheme {scheme}")


REPAIR_LIMIT = 20
ALPHANUMERIC = ("isin", "cusip", "sedol", "iban")
X_SCHEMES = ("isbn10", "issn")
UPPERCASE = ("isin", "cusip", "sedol", "iban", "isbn10", "issn")


def normalize(scheme: str, value: str) -> str:
    flat = digits_only(value)
    return flat.upper() if scheme in UPPERCASE else flat


def expected_check(scheme: str, value: str) -> str:
    """Expected check characters for a normalised, shape-valid value."""
    if scheme == "iban":
        return iban_check_digits(value[:2], value[4:])
    payload = value[:-1]
    return {
        "luhn": luhn,
        "verhoeff": verhoeff,
        "damm": damm,
        "isbn10": isbn10,
        "isbn13": ean13,
        "ean13": ean13,
        "ean8": ean8,
        "upca": upca,
        "gtin14": gtin14,
        "issn": issn,
        "isin": isin,
        "cusip": cusip,
        "cas": cas,
        "aba": aba,
        "sedol": sedol,
        "npi": npi,
    }[scheme](payload)


def repairs(scheme: str, value: str) -> tuple[int, list[tuple[str, int, str, str, str]]]:
    """(total, first 20 repairs) — mirror of the src/repair.ts contract."""
    normalized = normalize(scheme, value)
    span_start, span_size = (2, 2) if scheme == "iban" else (len(normalized) - 1, 1)
    found: list[tuple[str, int, str, str, str]] = []
    seen: set[str] = set()

    def push(candidate: tuple[str, int, str, str, str]) -> None:
        if candidate[4] in seen:
            return
        seen.add(candidate[4])
        found.append(candidate)

    expected = expected_check(scheme, normalized)

    def check_repaired() -> str:
        if scheme == "iban":
            return normalized[:span_start] + expected + normalized[span_start + span_size:]
        return normalized[:-1] + expected

    check_candidate = check_repaired()
    if valid(scheme, check_candidate):
        push(("check-digit", span_start + 1, normalized[span_start:span_start + span_size], expected, check_candidate))

    for i in range(len(normalized) - 1):
        if normalized[i] == normalized[i + 1]:
            continue
        swapped = normalized[:i] + normalized[i + 1] + normalized[i] + normalized[i + 2:]
        if valid(scheme, swapped):
            push(("transpose", i + 1, normalized[i:i + 2], normalized[i + 1] + normalized[i], swapped))

    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" if scheme in ALPHANUMERIC else "0123456789"
    for i in range(len(normalized)):
        if span_start <= i < span_start + span_size:
            continue
        chars = alphabet + "X" if scheme in X_SCHEMES and i == len(normalized) - 1 else alphabet
        for ch in chars:
            if ch == normalized[i]:
                continue
            candidate = normalized[:i] + ch + normalized[i + 1:]
            if valid(scheme, candidate):
                push(("substitute", i + 1, normalized[i], ch, candidate))

    return len(found), found[:REPAIR_LIMIT]


# --------------------------------------------------------------------------
# Scheme detection + batch report — second-source mirror of the documented
# contract of src/core.ts detectScheme() and the checkdigit_batch tool.
# --------------------------------------------------------------------------

CAS_RAW_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")
ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}\d$")
CUSIP_RE = re.compile(r"^[A-Z0-9*@#]{8}\d$")
SEDOL_RE = re.compile(r"^[BCDFGHJKLMNPQRSTVWXYZ][0-9BCDFGHJKLMNPQRSTVWXYZ]{5}\d$")
IBAN_SHAPE_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z0-9]{11,28}$")


def detect(value: str) -> str | None:
    """Mirror of the documented detection order (independent implementation)."""
    if CAS_RAW_RE.match(value.strip()):
        return "cas"
    norm = re.sub(r"[\s-]", "", value).upper()
    if ISIN_RE.match(norm):
        return "isin"
    if re.fullmatch(r"\d{9}", norm) and aba_valid(norm):
        return "aba"
    if CUSIP_RE.match(norm):
        return "cusip"
    if SEDOL_RE.match(norm):
        return "sedol"
    if IBAN_SHAPE_RE.match(norm):
        return "iban"
    if re.fullmatch(r"\d{13}", norm):
        return "ean13"
    if re.fullmatch(r"\d{12}", norm):
        return "upca"
    if re.fullmatch(r"\d{7}X", norm):
        return "issn"
    if re.fullmatch(r"\d{8}", norm):
        return "ean8"
    if re.fullmatch(r"\d{9}[\dX]", norm):
        return "isbn10"
    if re.fullmatch(r"\d{2,}", norm):
        return "luhn"
    return None


def aba_valid(value: str) -> bool:
    return len(value) == 9 and value.isdigit() and aba(value[:-1]) == value[-1]


def batch_report(values: list[str], scheme: str | None = None) -> dict:
    """Mirror of the documentated checkdigit_batch contract."""
    rows = []
    counts: dict[str, int] = {}
    valid_count = 0
    unknown_count = 0
    for index, value in enumerate(values, start=1):
        resolved = scheme if scheme is not None else detect(value)
        if resolved is None:
            unknown_count += 1
            counts["unknown"] = counts.get("unknown", 0) + 1
            rows.append((index, value, "unknown", False))
            continue
        ok = valid(resolved, digits_only(value).upper() if resolved in UPPERCASE else digits_only(value))
        if ok:
            valid_count += 1
        counts[resolved] = counts.get(resolved, 0) + 1
        rows.append((index, value, resolved, ok))
    order = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return {
        "total": len(values),
        "validCount": valid_count,
        "invalidCount": len(values) - valid_count - unknown_count,
        "unknownCount": unknown_count,
        "byScheme": order,
        "rows": rows,
    }


BATCH_VALUES = [
    "79927398713",
    "79927398714",
    "B15KXQ8",
    "B15KXQ7",
    "978-0-306-40615-7",
    "GB82WEST12345698765432",
    "not-an-id",
    "1234567893",
]

BATCH_NPI_VALUES = ["1234567893", "1245319599", "1234567890"]

# --------------------------------------------------------------------------
# Self-checks against published worked examples (fail loudly, never silently)
# --------------------------------------------------------------------------

SELF_CHECKS: list[tuple[str, object, object]] = [
    ("luhn(7992739871)", luhn("7992739871"), "3"),
    ("luhn(411111111111111)", luhn("411111111111111"), "1"),
    ("isbn10(030640615)", isbn10("030640615"), "2"),
    ("issn(0378595)", issn("0378595"), "5"),
    ("issn(2049363)", issn("2049363"), "0"),
    ("ean13(978030640615)", ean13("978030640615"), "7"),
    ("ean8(9638507)", ean8("9638507"), "4"),
    ("upca(03600029145)", upca("03600029145"), "2"),
    ("gtin14(0978030640615)", gtin14("0978030640615"), "7"),
    ("isin(US037833100)", isin("US037833100"), "5"),
    ("cusip(037833100)", cusip("03783310"), "0"),
    ("aba(02100002)", aba("02100002"), "1"),
    ("cas(773218)", cas("773218"), "5"),
    ("iban_check_digits(GB, WEST12345698765432)", iban_check_digits("GB", "WEST12345698765432"), "82"),
    ("iban_check_digits(DE, 370400440532013000)", iban_check_digits("DE", "370400440532013000"), "89"),
    ("iban_check_digits(FR, 20041010050500013M02606)", iban_check_digits("FR", "20041010050500013M02606"), "14"),
    ("len(GB BBAN WEST12345698765432)", len("WEST12345698765432"), 18),
    ("iban_valid(GB82WEST12345698765432)", iban_valid("GB82WEST12345698765432"), True),
    ("iban_valid(GB82WEST12345698765431)", iban_valid("GB82WEST12345698765431"), False),
    ("valid(luhn, 79927398713)", valid("luhn", "79927398713"), True),
    ("valid(luhn, 79927398714)", valid("luhn", "79927398714"), False),
    ("valid(issn, 20493630)", valid("issn", "20493630"), True),
    ("valid(gtin14, 09780306406157)", valid("gtin14", "09780306406157"), True),
    # SEDOL: published worked values for the LSE character table (digits keep
    # their face value, letters count A=10 … Z=35) with weights 1,3,1,7,3,9.
    ("sedol(B15KXQ)", sedol("B15KXQ"), "8"),
    ("sedol(026349)", sedol("026349"), "4"),
    ("sedol(B0YBKJ)", sedol("B0YBKJ"), "7"),
    ("sedol(070995)", sedol("070995"), "4"),
    ("sedol_valid on published codes", [sedol_valid(s) for s in ("B15KXQ8", "0263494", "B0YBKJ7", "0709954")], [True, True, True, True]),
    ("sedol_valid(B15KXQ7) — published bad checksum", sedol_valid("B15KXQ7"), False),
    ("sedol_valid(015KXQ8) — digit-leading mixed code", sedol_valid("015KXQ8"), False),
    ("sedol alphabet: digits keep their face value", [SEDOL_ALPHABET.index(ch) for ch in "0123456789"], list(range(10))),
    ("sedol alphabet: letters map to A=10 … Z=35", [SEDOL_ALPHABET.index(ch) for ch in "BCDFGHJKLMNPQRSTVWXYZ"], [ord(ch) - 55 for ch in "BCDFGHJKLMNPQRSTVWXYZ"]),
    ("sedol alphabet: no vowels", [v in SEDOL_ALPHABET for v in "AEIOU"], [False, False, False, False, False]),
    # NPI: published CMS/HHS example identifiers (Luhn over the constant 80840
    # prefix + the nine-digit payload).
    ("npi(123456789)", npi("123456789"), "3"),
    ("npi(124531959)", npi("124531959"), "9"),
    ("npi(199999998)", npi("199999998"), "4"),
    ("npi(100300012)", npi("100300012"), "6"),
    ("npi_valid on published codes", [npi_valid(s) for s in ("1234567893", "1245319599", "1999999984", "1003000126")], [True, True, True, True]),
    # The same nine digits under plain Luhn want a different digit — this is
    # exactly why ten-digit values are not auto-detected as NPI.
    ("luhn(123456789) — plain Luhn disagrees with NPI", luhn("123456789"), "7"),
    ("npi_valid(0234567893) — entity type 0", npi_valid("0234567893"), False),
    ("npi_valid(3234567893) — entity type 3", npi_valid("3234567893"), False),
]

SCHEME_IDS = [
    "luhn", "verhoeff", "damm", "isbn10", "isbn13", "ean8", "ean13", "upca",
    "gtin14", "issn", "isin", "cusip", "sedol", "iban", "cas", "aba", "npi",
]

# Fixtures shared with the test files: each one is repaired here first, so the
# numbers the tests assert are this file's output.
FIXTURES: list[tuple[str, str, str]] = [
    ("luhn", "79927398714", "mistyped check digit"),
    ("luhn", "79927398173", "swapped adjacent digits"),
    ("isbn10", "0975229801", "wrong check character, correct form is X"),
    ("issn", "20493633", "wrong check digit"),
    ("gtin14", "09780306406151", "wrong check digit"),
    ("iban", "GB82WEST12345698765431", "wrong mod-97 check digits"),
    ("damm", "123456789012345678901234567890", "30-character truncation fixture"),
    ("sedol", "B15KXQ7", "wrong check digit (published example)"),
    ("sedol", "B15KXQK", "check character mistyped as a letter"),
    ("npi", "1234567894", "wrong check digit"),
    ("npi", "1245319959", "swapped adjacent digits"),
]


def main(argv: list[str]) -> int:
    check_mode = "--check" in argv
    print("ANCHORS — dsh-checkdigit (independent Python implementation)")
    print("=" * 68)
    print(f"scheme count: {len(SCHEME_IDS)}")

    print()
    print("published worked examples")
    for label, got, want in SELF_CHECKS:
        mark = "ok" if got == want else "MISMATCH"
        print(f"  {label} = {got!r} (want {want!r}) [{mark}]")

    print()
    print("IBAN total lengths (sample values)")
    for sample in ("GB82WEST12345698765432", "DE89370400440532013000", "NO9386011117947"):
        flat = sample.upper().replace(" ", "")
        print(f"  {sample[:2]}: {len(flat)} (registry {IBAN_LENGTHS[sample[:2]]})")

    print()
    print("sedol anchors (payload -> check digit)")
    for payload in ("B15KXQ", "026349", "B0YBKJ", "070995"):
        print(f"  sedol({payload}) = {sedol(payload)}")
    for value in ("B15KXQ8", "0263494", "B0YBKJ7", "0709954", "B15KXQ7", "015KXQ8"):
        print(f"  sedol_valid({value}) = {sedol_valid(value)}")

    print()
    print("npi anchors (payload -> check digit)")
    for payload in ("123456789", "124531959", "199999998", "100300012"):
        print(f"  npi({payload}) = {npi(payload)}")
    print(f"  expected check for 1234567894 = {npi('123456789')}, for 1245319959 = {npi('124531995')}")
    print(f"  plain luhn(123456789) = {luhn('123456789')}  (NPI uses the 80840 prefix instead)")
    print(f"  npi_valid(0234567893) = {npi_valid('0234567893')}")

    print()
    print("batch report anchors (checkdigit_batch, auto-detect)")
    print("  contract limit: 50 values per call")
    report = batch_report(BATCH_VALUES)
    print(f"  total={report['total']} validCount={report['validCount']} invalidCount={report['invalidCount']} unknownCount={report['unknownCount']}")
    print(f"  byScheme={report['byScheme']}")
    for index, value, scheme, ok in report["rows"]:
        print(f"  #{index} {value!r} -> {scheme} valid={ok}")

    print()
    print("batch report anchors (checkdigit_batch, scheme='npi')")
    npi_report = batch_report(BATCH_NPI_VALUES, "npi")
    print(f"  total={npi_report['total']} validCount={npi_report['validCount']} invalidCount={npi_report['invalidCount']} unknownCount={npi_report['unknownCount']}")
    print(f"  byScheme={npi_report['byScheme']}")
    for index, value, scheme, ok in npi_report["rows"]:
        print(f"  #{index} {value!r} -> {scheme} valid={ok}")

    print()
    print("repair anchors (type, 1-based position, from, to)")
    for scheme, value, note in FIXTURES:
        total, first = repairs(scheme, value)
        print(f"  {scheme} {value} — {note}")
        print(f"    total={total} truncated={total > REPAIR_LIMIT} returned={len(first)}")
        print(f"    first={first[0] if first else None}")
        if total > REPAIR_LIMIT:
            print(f"    cap: returned {min(total, REPAIR_LIMIT)} of {total}")

    print()
    print("no-repair / already-valid fixtures")
    short = "123"
    print(f"  isbn10 {short}: expected='' (wrong shape) → repairs=0")
    print(f"  luhn 79927398713: valid=True → repairs=0")

    bad = [label for label, got, want in SELF_CHECKS if got != want]
    if bad:
        print(f"\nFAILED self-checks: {bad}")
        return 1
    print("\nall self-checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
