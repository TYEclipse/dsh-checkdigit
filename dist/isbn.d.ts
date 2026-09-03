/**
 * ISBN-10 <-> ISBN-13 conversion for the isbn_convert tool.
 *
 * ISBN-10 -> ISBN-13: validate the mod-11 check digit, prepend the 978
 * Bookland prefix and recompute the EAN-13 check digit.
 * ISBN-13 -> ISBN-10: validate the EAN-13 check digit, drop the prefix and
 * recompute the mod-11 check. Only the 978 prefix maps back to ISBN-10;
 * 979-prefixed ISBNs (and everything else) have no ISBN-10 equivalent.
 *
 * Hyphens and spaces are ignored on input; when the input is hyphenated the
 * formatted output keeps the same grouping (978 prepended / dropped).
 *
 * @module dsh-checkdigit/isbn
 */
export type IsbnDirection = 'to13' | 'to10';
export interface IsbnConvertResult {
    valid: boolean;
    /** Conversion direction (present only on success — lossless JSON). */
    direction?: IsbnDirection;
    /** Normalised source ISBN (10 or 13 characters). */
    source?: string;
    /** Normalised converted ISBN. */
    converted?: string;
    /** Human-readable hyphenated form (same grouping as the input). */
    formatted?: string;
    /** Failure reason (present only when valid is false). */
    error?: string;
}
export declare function convertIsbn(input: string): IsbnConvertResult;
//# sourceMappingURL=isbn.d.ts.map