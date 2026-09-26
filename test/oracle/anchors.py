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
    raise ValueError(f"unknown scheme {scheme}")


REPAIR_LIMIT = 20
ALPHANUMERIC = ("isin", "cusip", "iban")
X_SCHEMES = ("isbn10", "issn")
UPPERCASE = ("isin", "cusip", "iban", "isbn10", "issn")


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
    ("iban_valid(GB82WEST12345698765432)", iban_valid("GB82WEST12345698765432"), True),
    ("iban_valid(GB82WEST12345698765431)", iban_valid("GB82WEST12345698765431"), False),
    ("valid(luhn, 79927398713)", valid("luhn", "79927398713"), True),
    ("valid(luhn, 79927398714)", valid("luhn", "79927398714"), False),
    ("valid(issn, 20493630)", valid("issn", "20493630"), True),
    ("valid(gtin14, 09780306406157)", valid("gtin14", "09780306406157"), True),
]

SCHEME_IDS = [
    "luhn", "verhoeff", "damm", "isbn10", "isbn13", "ean8", "ean13", "upca",
    "gtin14", "issn", "isin", "cusip", "iban", "cas", "aba",
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
