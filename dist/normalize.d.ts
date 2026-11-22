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
import { type SchemeId } from './core.ts';
/** One edit the normaliser made, in the order it was applied. */
export interface NormalizeChange {
    /** `case` | `separators` | `grouping` */
    kind: 'case' | 'separators' | 'grouping';
    /** Human-readable description, e.g. "removed 3 separators". */
    detail: string;
}
export interface NormalizeResult {
    /** True when the canonical form carries a correct check digit. */
    valid: boolean;
    /** Scheme used (named by the caller, otherwise detected); 'unknown' when none matched. */
    scheme: string;
    /** The canonical form (absent only when no scheme could be determined). */
    normalized?: string;
    /** True when `normalized` differs from the input as submitted. */
    changed?: boolean;
    /** The edits made, most structural last; empty when the input was already canonical. */
    changes?: NormalizeChange[];
    /** Check digit found in the canonical form. */
    checkDigit?: string;
    /** Check digit the payload requires. */
    expected?: string;
    /** Layout applied, e.g. "4-4-4-4"; absent when the identifier is printed unbroken. */
    grouping?: string;
    /** Present when a layout exists in the standard but needs data this plugin does not ship. */
    note?: string;
    /** Present when no scheme could be determined. */
    error?: string;
}
/**
 * Normalise one identifier.
 *
 * @param value    The identifier as typed (case and separators are irrelevant).
 * @param scheme   Optional scheme id; omitted → auto-detect.
 */
export declare function normalizeIdentifier(value: string, scheme?: SchemeId): NormalizeResult;
//# sourceMappingURL=normalize.d.ts.map