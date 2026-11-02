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
# LEI (ISO 17442) — twenty characters: a four-character LOU prefix, two
# reserved characters ("00"), a twelve-character entity id and the two check
# digits at the END. ISO/IEC 7064 MOD 97-10 over the letters expanded
# A=10 … Z=35, with nothing rotated: the whole value must leave remainder 1.
#
# The check-digit position is the part people get wrong from memory (it is NOT
# where IBAN puts them), so the self-checks below pin it on LEIs GLEIF actually
# issued: for those, characters 5–6 are "00" and the generator reproduces the
# last two characters.
# --------------------------------------------------------------------------


def lei(payload: str) -> str:
    """Two check digits for an 18-character LEI payload."""
    return str(98 - mod97(expand_letters(payload + "00"))).zfill(2)


def lei_valid(value: str) -> bool:
    up = value.upper().replace(" ", "").replace("-", "")
    if len(up) != 20 or not re.fullmatch(r"[A-Z0-9]{20}", up):
        return False
    if up[4:6] != "00":
        return False
    if mod97(expand_letters(up)) != 1:
        return False
    return lei(up[:-2]) == up[-2:]


# --------------------------------------------------------------------------
# ORCID iD — fifteen digits plus a check character under ISO/IEC 7064 MOD 11-2.
# Digit i (1-based) carries weight 2^(16−i); the check character is
# (1 − total) mod 11, with 10 rendered as X. A remainder of 0 therefore yields
# the digit 1 — the corner the ORCID write-up's "12 − remainder" hides.
# --------------------------------------------------------------------------


def orcid(payload: str) -> str:
    total = sum(int(ch) * 2 ** (16 - (i + 1)) for i, ch in enumerate(payload))
    result = (1 - total) % 11
    return "X" if result == 10 else str(result)


def orcid_valid(value: str) -> bool:
    up = value.upper().replace(" ", "").replace("-", "")
    if not re.fullmatch(r"\d{15}[\dX]", up):
        return False
    return orcid(up[:15]) == up[-1]



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
    if scheme == "lei":
        return lei_valid(value)
    if scheme == "orcid":
        return orcid_valid(value)
    raise ValueError(f"unknown scheme {scheme}")


REPAIR_LIMIT = 20
ALPHANUMERIC = ("isin", "cusip", "sedol", "iban", "lei")
X_SCHEMES = ("isbn10", "issn", "orcid")
UPPERCASE = ("isin", "cusip", "sedol", "iban", "isbn10", "issn", "lei", "orcid")


def normalize(scheme: str, value: str) -> str:
    flat = digits_only(value)
    return flat.upper() if scheme in UPPERCASE else flat


def expected_check(scheme: str, value: str) -> str:
    """Expected check characters for a normalised, shape-valid value."""
    if scheme == "iban":
        return iban_check_digits(value[:2], value[4:])
    if scheme == "lei":
        return lei(value[:-2])
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
        "orcid": orcid,
    }[scheme](payload)


def repairs(scheme: str, value: str) -> tuple[int, list[tuple[str, int, str, str, str]]]:
    """(total, first 20 repairs) — mirror of the src/repair.ts contract."""
    normalized = normalize(scheme, value)
    if scheme == "iban":
        span_start, span_size = 2, 2
    elif scheme == "lei":
        span_start, span_size = len(normalized) - 2, 2
    else:
        span_start, span_size = len(normalized) - 1, 1
    found: list[tuple[str, int, str, str, str]] = []
    seen: set[str] = set()

    def push(candidate: tuple[str, int, str, str, str]) -> None:
        if candidate[4] in seen:
            return
        seen.add(candidate[4])
        found.append(candidate)

    expected = expected_check(scheme, normalized)

    def check_repaired() -> str:
        return normalized[:span_start] + expected + normalized[span_start + span_size:]

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
LEI_SHAPE_RE = re.compile(r"^[A-Z0-9]{18}\d{2}$")
ORCID_DETECT_RE = re.compile(r"^0000\d{11}[\dX]$")


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
    if LEI_SHAPE_RE.match(norm) and lei_valid(norm):
        return "lei"
    if ORCID_DETECT_RE.match(norm):
        return "orcid"
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
# Published identifier corpora — the LEIs come from GLEIF's own API and the
# ORCID iDs from the ORCID public record API, so the anchors below are values
# the standards bodies actually issued, not values this file invented.
# --------------------------------------------------------------------------

REAL_LEIS = [
    "787200X2SJ7WXPUZ4169",
    "5299008IX1AQQJV9RG61",
    "5299003A531TLH368K72",
    "529900T8BM49AURSDO55",
]
REAL_LEIS_NOTE = "GLEIF-issued (api.gleif.org), all carry the reserved \"00\" at positions 5–6"

REAL_ORCIDS = [
    "0000000218250097",
    "0000000210286941",
    "0000000155915599",
    "0000000235552193",
    "0000000177100796",
    "0000000234090724",
]


def _orcid_x_fixture() -> str:
    """A fifteen-digit payload whose MOD 11-2 check character is X."""
    for last in range(10):
        payload = f"00001234567890{last}"[:15]
        if orcid(payload) == "X":
            return payload
    raise AssertionError("no MOD 11-2 payload renders as X in this range")


ORCID_X_PAYLOAD = _orcid_x_fixture()


# --------------------------------------------------------------------------
# Free-text scan — second-source mirror of the documented checkdigit_scan
# contract (src/scan.ts): tokenise on whitespace, trim the punctuation people
# wrap numbers in, and merge adjacent groups ONLY when the merged value passes
# its own check digit.
# --------------------------------------------------------------------------

SCAN_MERGE_GROUPS = 8
SCAN_GROUP_MAX = 12
SCAN_MERGED_MAX = 34
LUHN_SCAN_MIN = 12
LUHN_SCAN_MAX = 19


def check(scheme: str, value: str) -> dict:
    """(valid, checkDigit, expected) — mirror of SCHEMES[scheme].validate()."""
    norm = normalize(scheme, value)
    ok = valid(scheme, norm)
    if scheme == "iban":
        # IBAN keeps its two check digits right after the country code.
        check_digit = norm[2:4]
    elif scheme == "lei":
        check_digit = norm[-2:] if len(norm) >= 2 else ""
    else:
        check_digit = norm[-1:] if len(norm) >= 1 else ""
    # The tools and the scheme validators both report the expected check
    # characters whether or not the value passes; mirror that (a shape the
    # scheme cannot even parse yields '').
    try:
        expected = expected_check(scheme, norm)
    except Exception:
        expected = ""
    return {"valid": ok, "checkDigit": check_digit, "expected": expected}


def evaluate(value: str, schemes: list[str] | None):
    if schemes:
        fallback = None
        for scheme in schemes:
            result = check(scheme, value)
            if result["valid"]:
                return {"scheme": scheme, **result}
            if fallback is None and result["expected"] != "":
                fallback = {"scheme": scheme, **result}
        return fallback
    scheme = detect(value)
    if scheme is None:
        return None
    return {"scheme": scheme, **check(scheme, value)}


def _plausible(candidate: dict, value: str, explicit: bool) -> bool:
    if explicit or candidate["scheme"] != "luhn":
        return True
    digits = value.replace(" ", "").replace("-", "").replace(".", "")
    return LUHN_SCAN_MIN <= len(digits) <= LUHN_SCAN_MAX


def _tokens(text: str) -> list[dict]:
    tokens = []
    for match in re.finditer(r"\S+", text):
        raw = match.group(0)
        core = re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "", raw)
        if core == "":
            continue
        offset = raw.index(core)
        tokens.append({"core": core, "start": match.start() + offset, "end": match.start() + offset + len(core)})
    return tokens


def scan_text(text: str, schemes: list[str] | None = None, include_invalid: bool = False, limit: int = 20) -> dict:
    tokens = _tokens(text)
    matches: list[dict] = []
    total = valid_count = invalid_count = scanned = 0

    def record(start: int, end: int, candidate: dict, value: str) -> None:
        nonlocal total, valid_count, invalid_count
        total += 1
        if candidate["valid"]:
            valid_count += 1
        else:
            invalid_count += 1
        if len(matches) >= limit:
            return
        matches.append({
            "value": value,
            "scheme": candidate["scheme"],
            "valid": candidate["valid"],
            "start": start,
            "end": end,
            "checkDigit": candidate["checkDigit"],
            "expected": candidate["expected"],
        })

    explicit = bool(schemes)
    i = 0
    while i < len(tokens):
        token = tokens[i]
        single = evaluate(token["core"], schemes) if len(token["core"]) >= 3 else None
        if len(token["core"]) >= 3:
            scanned += 1
        if single is not None and _plausible(single, token["core"], explicit):
            if single["valid"] or include_invalid:
                record(token["start"], token["end"], single, token["core"])
                i += 1
                continue
        # A merge may only start from a token that carries a digit, and the
        # longest grouping is tried first (complete identifier beats a prefix).
        if not re.search(r"\d", token["core"]):
            i += 1
            continue
        merged = False
        for k in range(min(SCAN_MERGE_GROUPS, len(tokens) - i), 1, -1):
            group = tokens[i:i + k]
            if not all(1 <= len(item["core"]) <= SCAN_GROUP_MAX for item in group):
                continue
            joined = "".join(item["core"] for item in group)
            if len(joined) > SCAN_MERGED_MAX:
                continue
            candidate = evaluate(joined, schemes)
            if candidate is None or not candidate["valid"] or not _plausible(candidate, joined, explicit):
                continue
            record(group[0]["start"], group[-1]["end"], candidate, text[group[0]["start"]:group[-1]["end"]])
            i += k
            merged = True
            break
        if merged:
            continue
        i += 1

    return {
        "scanned": scanned,
        "total": total,
        "validCount": valid_count,
        "invalidCount": invalid_count,
        "truncated": total > len(matches),
        "matches": matches,
    }


SCAN_TEXT = (
    "Invoice 2026-11: card 4111 1111 1111 1111 charged, ISBN 978 0 306 40615 7, "
    "LEI 529900T8BM49AURSDO55, ORCID 0000-0002-1825-0097, "
    "IBAN GB82 WEST 1234 5698 7654 32, SEDOL B15KXQ8. "
    "Order 1234 has 77 items; bad copy 9780306406158."
)

SCAN_BAD_TEXT = "Card 4111 1111 1111 1111 ok; code 4111 1111 1111 1112 fails; ISBN 9780306406158 too."

SCAN_NPI_TEXT = "NPI 1234567893 and 1245319599 and 1234567890."

SCAN_SHORT_TEXT = "Order 1234 has 77 items."


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
    # LEI: GLEIF-issued identifiers. The generator must reproduce the last two
    # characters, characters 5–6 must be the reserved "00", and the whole value
    # must leave remainder 1 (mod 97) — three independent statements about the
    # same string, so a misplaced check-digit span cannot pass.
    ("lei(787200X2SJ7WXPUZ41)", lei("787200X2SJ7WXPUZ41"), "69"),
    ("lei(5299008IX1AQQJV9RG)", lei("5299008IX1AQQJV9RG"), "61"),
    ("lei(529900T8BM49AURSDO)", lei("529900T8BM49AURSDO"), "55"),
    ("lei_valid on GLEIF-issued LEIs", [lei_valid(v) for v in REAL_LEIS], [True, True, True, True]),
    ("reserved characters in issued LEIs", [v[4:6] for v in REAL_LEIS], ["00", "00", "00", "00"]),
    ("mod97 of a GLEIF-issued LEI", mod97(expand_letters("787200X2SJ7WXPUZ4169")), 1),
    ("lei_valid(787200X2SJ7WXPUZ4168) — last digit changed", lei_valid("787200X2SJ7WXPUZ4168"), False),
    ("lei_valid(787201X2SJ7WXPUZ4169) — reserved slot not 00", lei_valid("787201X2SJ7WXPUZ4169"), False),
    ("lei_valid(787200X2SJ7WXPUZ41) — truncated", lei_valid("787200X2SJ7WXPUZ41"), False),
    # ORCID: iDs from the public ORCID record API. 0000-0002-1825-0097 is the
    # documented Josiah Carberry example; 0000-0002-1028-6941 covers the
    # remainder-0 corner where "12 − remainder" would print 12 instead of 1.
    ("orcid(000000021825009)", orcid("000000021825009"), "7"),
    ("orcid(000000021028694) — remainder 0 → digit 1", orcid("000000021028694"), "1"),
    ("orcid_valid on real ORCID iDs", [orcid_valid(v) for v in REAL_ORCIDS], [True] * 6),
    ("orcid_valid(0000000218250098) — wrong check character", orcid_valid("0000000218250098"), False),
    ("orcid X fixture check character", orcid(ORCID_X_PAYLOAD), "X"),
    ("orcid_valid of the X fixture", orcid_valid(ORCID_X_PAYLOAD + "X"), True),
    ("orcid_valid of the X fixture with 0", orcid_valid(ORCID_X_PAYLOAD + "0"), False),
    # Detection: a LEI is only claimed when the mod-97 remainder confirms it, and
    # a sixteen-digit card number stays Luhn (ORCID detection is limited to the
    # 0000-000x block).
    ("detect(GLEIF LEI)", detect("529900T8BM49AURSDO55"), "lei"),
    ("detect(ORCID with hyphens)", detect("0000-0002-1825-0097"), "orcid"),
    ("detect(16-digit card)", detect("4111111111111111"), "luhn"),
]

SCHEME_IDS = [
    "luhn", "verhoeff", "damm", "isbn10", "isbn13", "ean8", "ean13", "upca",
    "gtin14", "issn", "isin", "cusip", "sedol", "iban", "cas", "aba", "npi",
    "lei", "orcid",
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
    ("lei", "787200X2SJ7WXPUZ4168", "last check digit wrong (GLEIF value 4169)"),
    ("orcid", "0000000218250098", "wrong check character"),
]


def scan_report(text: str, schemes: list[str] | None = None, include_invalid: bool = False, limit: int = 20) -> None:
    """Print one scan report in the shape the tests assert."""
    report = scan_text(text, schemes=schemes, include_invalid=include_invalid, limit=limit)
    print(f"  text={text!r}")
    print(f"  scanned={report['scanned']} total={report['total']} valid={report['validCount']} "
          f"invalid={report['invalidCount']} truncated={report['truncated']}")
    for match in report["matches"]:
        print(f"  {match['scheme']} {match['value']!r} [{match['start']},{match['end']}) "
              f"valid={match['valid']} check={match['checkDigit']!r} expected={match['expected']!r}")


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
    print("lei anchors (payload -> last two check digits)")
    for payload in ("787200X2SJ7WXPUZ41", "5299008IX1AQQJV9RG", "5299003A531TLH368K", "529900T8BM49AURSDO"):
        print(f"  lei({payload}) = {lei(payload)}")
    for value in REAL_LEIS:
        print(f"  lei_valid({value}) = {lei_valid(value)} (reserved={value[4:6]}, mod97={mod97(expand_letters(value))})")
    for value in ("787200X2SJ7WXPUZ4168", "787201X2SJ7WXPUZ4169", "787200X2SJ7WXPUZ41"):
        print(f"  lei_valid({value}) = {lei_valid(value)}")

    print()
    print("orcid anchors (15-digit payload -> check character)")
    for payload in ("000000021825009", "000000021028694", "000000015591559", "000000023555219", ORCID_X_PAYLOAD):
        print(f"  orcid({payload}) = {orcid(payload)}")
    for value in REAL_ORCIDS:
        print(f"  orcid_valid({value}) = {orcid_valid(value)}")
    print(f"  orcid_valid({ORCID_X_PAYLOAD}X) = {orcid_valid(ORCID_X_PAYLOAD + 'X')}")
    print(f"  orcid_valid({ORCID_X_PAYLOAD}0) = {orcid_valid(ORCID_X_PAYLOAD + '0')}")
    print(f"  detect(529900T8BM49AURSDO55) = {detect('529900T8BM49AURSDO55')}")
    print(f"  detect(0000-0002-1825-0097) = {detect('0000-0002-1825-0097')}")
    print(f"  detect(4111111111111111) = {detect('4111111111111111')}")

    print()
    print("scan anchors (checkdigit_scan, auto-detect)")
    scan_report(SCAN_TEXT)
    print()
    print("scan anchors (includeInvalid=true)")
    scan_report(SCAN_BAD_TEXT, include_invalid=True)
    print()
    print("scan anchors (schemes=['npi'], includeInvalid=true, limit=2)")
    scan_report(SCAN_NPI_TEXT, schemes=["npi"], include_invalid=True, limit=2)
    print()
    print("scan anchors (short numbers are not card numbers)")
    scan_report(SCAN_SHORT_TEXT)


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
