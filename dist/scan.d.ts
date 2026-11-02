/**
 * Free-text identifier scan for dsh-checkdigit.
 *
 * `checkdigit_batch` needs one value per line; real pastes are prose — a
 * receipt, an email, a spreadsheet export with labels around the numbers. This
 * module walks the text and reports the identifiers whose check digit actually
 * holds, with the offsets needed to slice them back out.
 *
 * Two deliberate rules keep the output honest:
 *
 *   1. **A match is a claim the check digit can back.** Nothing is reported
 *      unless a scheme recognises the shape; validity is decided by the same
 *      validators the other tools use.
 *   2. **Groups are merged only when the merged value validates.** IBANs are
 *      printed in blocks of four and ISBNs in five groups, so adjacent tokens
 *      are tried as one value (up to five groups, 34 characters). A failed
 *      merge proves nothing and is dropped — which is also why prose does not
 *      get glued into identifiers.
 *
 * @module dsh-checkdigit/scan
 */
import { type SchemeId } from './core.ts';
/** Longest text accepted by one scan call. */
export declare const SCAN_TEXT_LIMIT = 20000;
/** Most matches returned by one call (the total is always reported in full). */
export declare const SCAN_LIMIT = 50;
/** How many whitespace-separated groups may be merged into one value. */
export declare const SCAN_MERGE_GROUPS = 8;
/** Longest single group that may take part in a merge. */
export declare const SCAN_GROUP_MAX = 12;
/** Longest merged value that is still worth checking. */
export declare const SCAN_MERGED_MAX = 34;
/** Auto-detection only claims Luhn for identifier-length runs, not for any number. */
export declare const LUHN_SCAN_MIN = 12;
export declare const LUHN_SCAN_MAX = 19;
export interface ScanMatch {
    /** The text exactly as it appears (separators included). */
    value: string;
    /** Which scheme claimed it. */
    scheme: string;
    /** True when the check digit holds. */
    valid: boolean;
    /** Offset of the first character in the scanned text. */
    start: number;
    /** Offset one past the last character. */
    end: number;
    /** The check character(s) found. */
    checkDigit: string;
    /** The check character(s) the payload requires. */
    expected: string;
}
export interface ScanResult {
    /** Tokens examined (whitespace-separated, punctuation trimmed, length ≥ 3). */
    scanned: number;
    /** Matches found, before the result cap. */
    total: number;
    validCount: number;
    invalidCount: number;
    /** True when the returned list was cut off at the requested limit. */
    truncated: boolean;
    matches: ScanMatch[];
    /** Set only when the request itself was rejected. */
    error?: string;
}
/**
 * Scan free text for identifiers.
 *
 * @param text     the text to read
 * @param options  `schemes` restricts the search, `includeInvalid` also reports
 *                 single tokens whose check digit fails, `limit` caps the list
 */
export declare function scanText(text: string, options?: {
    schemes?: readonly SchemeId[];
    includeInvalid?: boolean;
    limit?: number;
}): ScanResult;
//# sourceMappingURL=scan.d.ts.map