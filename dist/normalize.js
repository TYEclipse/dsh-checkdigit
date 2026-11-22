/**
 * Identifier normalisation for dsh-checkdigit.
 *
 * The validator answers "is this number right?". This module answers the other
 * question people actually ask while pasting identifiers around: "what is this
 * number *supposed* to look like?" — upper case, no stray separators, and the
 * separator layout the identifier's own standard prints.
 *
 * Only layouts that are fully determined by the standard are applied:
 *
 *   iban   groups of four, single space   (ISO 13616 printed form)
 *   orcid  4-4-4-4, hyphens               (ORCID iD as ORCID displays it)
 *   issn   4-4, hyphen                    (ISO 3297)
 *   cas    <digits>-<2>-<1>, hyphens       (CAS Registry Number)
 *
 * Everything else is returned as one unbroken run. Two families get an explicit
 * `note` instead of a guessed layout: ISBN hyphenation needs the annual
 * registration-group range tables, which this plugin does not ship, and card /
 * IMEI printing varies by issuer and device. A fabricated grouping would look
 * canonical while being wrong, so the field stays absent and the note says why.
 *
 * Normalisation never changes the verdict: the check digit is recomputed on the
 * canonical form and the result is reported from there.
 *
 * @module dsh-checkdigit/normalize
 */
import { SCHEMES, detectScheme } from "./core.js";
/** Schemes whose printed form is fixed by their standard. */
const GROUPINGS = {
    iban: '4-4-4-…-4',
    orcid: '4-4-4-4',
    issn: '4-4',
    cas: 'n-2-1',
};
const GROUPING_KINDS = {
    iban: 'space',
    orcid: 'hyphen',
    issn: 'hyphen',
    cas: 'hyphen',
};
/** Separators people type inside identifiers; every scheme ignores them. */
const SEPARATOR_RE = /[\s.-]/g;
/**
 * Lay out a compact identifier the way its standard prints it.
 * Returns undefined when the scheme has no fixed layout.
 */
function layout(scheme, compact) {
    switch (scheme) {
        case 'iban':
            return compact.match(/.{1,4}/g)?.join(' ') ?? compact;
        case 'orcid':
            return [0, 4, 8, 12].map((start) => compact.slice(start, start + 4)).join('-');
        case 'issn':
            return `${compact.slice(0, 4)}-${compact.slice(4)}`;
        case 'cas':
            // The first group is variable length (2–7 digits); the last two groups
            // are always two digits and the single check digit.
            return `${compact.slice(0, -3)}-${compact.slice(-3, -1)}-${compact.slice(-1)}`;
        default:
            return undefined;
    }
}
/** Character count of every edit class, computed on the raw input. */
function countSeparators(raw) {
    return raw.match(SEPARATOR_RE)?.length ?? 0;
}
function hadUppercaseLoss(raw) {
    return /[a-z]/.test(raw) && raw !== raw.toUpperCase();
}
/** Grouping of the input as typed, e.g. "4-4-4-4" for 0000-0002-1825-0097. */
function layoutOf(raw) {
    const parts = raw.trim().split(/[\s.-]+/).filter((part) => part.length > 0);
    if (parts.length < 2)
        return undefined;
    return parts.map((part) => String(part.length)).join('-');
}
/** The separator characters themselves, with runs collapsed — layout-free comparison. */
function separatorSignature(raw) {
    return raw.trim().replace(/[^\s.-]+/g, '').replace(/\s+/g, ' ');
}
/**
 * Normalise one identifier.
 *
 * @param value    The identifier as typed (case and separators are irrelevant).
 * @param scheme   Optional scheme id; omitted → auto-detect.
 */
export function normalizeIdentifier(value, scheme) {
    const detected = scheme ?? detectScheme(value);
    if (detected === undefined) {
        return {
            valid: false,
            scheme: 'unknown',
            error: 'no supported scheme matches this value; name the scheme to normalise it anyway',
        };
    }
    const compact = value.replace(SEPARATOR_RE, '').toUpperCase();
    const check = SCHEMES[detected].validate(compact);
    // A shape failure leaves both checkDigit and expected empty in every scheme
    // that has a fixed layout, so a layout is only applied to a shape-valid value.
    const shapeOk = check.checkDigit !== '';
    const grouped = shapeOk ? layout(detected, compact) : undefined;
    const normalized = grouped ?? compact;
    const changes = [];
    const uppercaseLoss = hadUppercaseLoss(value);
    if (uppercaseLoss)
        changes.push({ kind: 'case', detail: 'uppercased the identifier' });
    const separatorsTyped = countSeparators(value);
    const separatorLayoutChanged = grouped !== undefined && layoutOf(value) !== layoutOf(grouped);
    if (separatorLayoutChanged) {
        const layoutLabel = GROUPINGS[detected] ?? 'standard';
        const sep = GROUPING_KINDS[detected] === 'space' ? 'spaces' : 'hyphens';
        changes.push({
            kind: 'grouping',
            detail: separatorsTyped === 0
                ? `inserted ${sep} every ${layoutLabel} group`
                : `re-grouped with ${sep} as ${layoutLabel}`,
        });
    }
    else if (separatorsTyped > 0 && grouped === undefined) {
        changes.push({ kind: 'separators', detail: `removed ${separatorsTyped} separator${separatorsTyped === 1 ? '' : 's'}` });
    }
    else if (separatorsTyped > 0 && grouped !== undefined && separatorSignature(value) !== separatorSignature(grouped)) {
        // Same grouping as typed but a different separator character or run length
        // (dots, tabs, doubled spaces) — the edited bytes are worth reporting even
        // though the layout the reader sees is unchanged.
        const layoutLabel = GROUPINGS[detected] ?? 'standard';
        changes.push({ kind: 'separators', detail: `replaced ${separatorsTyped} separator${separatorsTyped === 1 ? '' : 's'} with the ${layoutLabel} layout` });
    }
    const result = {
        valid: check.valid,
        scheme: detected,
        normalized,
        changed: normalized !== value,
        changes,
        checkDigit: check.checkDigit,
        expected: check.expected,
    };
    const grouping = GROUPINGS[detected];
    if (grouping !== undefined && shapeOk)
        result.grouping = grouping;
    const note = layoutNote(detected);
    if (note !== undefined)
        result.note = note;
    return result;
}
/** Why an identifier that people *do* print grouped is returned unbroken here. */
function layoutNote(scheme) {
    if (scheme === 'isbn10' || scheme === 'isbn13') {
        return 'ISBN hyphenation needs the registration-group range tables published annually by the ISBN agency; '
            + 'this plugin does not ship them, so the unbroken digit form is returned instead of a guessed grouping';
    }
    if (scheme === 'luhn') {
        return 'card and IMEI printing varies by issuer, network and device, so no single separator layout is claimed';
    }
    return undefined;
}
//# sourceMappingURL=normalize.js.map