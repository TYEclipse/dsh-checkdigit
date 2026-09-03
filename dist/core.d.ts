/**
 * Check-digit mathematics for dsh-checkdigit.
 *
 * Every scheme is implemented from its published specification with pure
 * integer arithmetic (no float math, no external services, no runtime
 * dependencies). Each scheme exposes `generate(payload)` and
 * `validate(value)`, plus metadata for the info tool.
 *
 * @module dsh-checkdigit/core
 */
/** Identifiers of every supported check-digit scheme. */
export declare const SCHEME_IDS: readonly ["luhn", "verhoeff", "damm", "isbn10", "isbn13", "ean8", "ean13", "upca", "isin", "cusip", "iban", "cas", "aba"];
export type SchemeId = (typeof SCHEME_IDS)[number];
export interface SchemeMeta {
    id: SchemeId;
    name: string;
    description: string;
    /** Full identifier length, or a human-readable range. */
    length: string;
    /** What the payload (input to generate) must look like. */
    payload: string;
    /** Where the check digit sits. */
    check: string;
    example: string;
}
export interface CheckResult {
    /** True when the check digit is correct for the payload. */
    valid: boolean;
    /** The check digit as found in the value ('' when absent). */
    checkDigit: string;
    /** The check digit the payload requires. */
    expected: string;
    /** Human-readable explanation of the arithmetic. */
    detail: string;
}
declare function isbn10Check(payload: string): string;
declare function weightedMod10Check(payload: string, weights: readonly number[]): string;
declare const EAN13_WEIGHTS: number[];
export { isbn10Check, weightedMod10Check, EAN13_WEIGHTS as ISBN13_WEIGHTS };
export interface SchemeSpec {
    meta: SchemeMeta;
    generate: (payload: string) => string;
    validate: (value: string) => CheckResult;
}
export declare const SCHEMES: Record<SchemeId, SchemeSpec>;
/**
 * Detect the most likely scheme for a value. Ordering matters: stricter
 * formats (ISIN, CUSIP, ISBN-10) are tested before the loose digit fallbacks.
 */
export declare function detectScheme(value: string): SchemeId | undefined;
/** Metadata for every scheme, for the info tool. */
export declare function schemeMetaList(): SchemeMeta[];
//# sourceMappingURL=core.d.ts.map