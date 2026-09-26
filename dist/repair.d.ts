/**
 * Single-edit repair search for dsh-checkdigit.
 *
 * When a value fails its check digit the useful question is not "is it wrong"
 * but "what was it most likely meant to be". Every scheme here has a small,
 * enumerable repair space, so this module searches it exhaustively and returns
 * the edits that make the value valid:
 *
 *   1. `check-digit` — the check character itself was mistyped (by far the most
 *      common error: a single wrong final digit).
 *   2. `transpose`   — two adjacent characters were swapped.
 *   3. `substitute`  — one payload character was mistyped as another.
 *
 * The search is bounded (alphabet + length decide the work, the result list is
 * capped) and every candidate is confirmed by the scheme's own validator, so a
 * repair is never reported unless the repaired value really validates.
 *
 * @module dsh-checkdigit/repair
 */
import { type SchemeId } from './core.ts';
/** Maximum number of repairs returned (the count is always reported in full). */
export declare const REPAIR_LIMIT = 20;
export type RepairKind = 'check-digit' | 'transpose' | 'substitute';
export interface RepairCandidate {
    /** How the value has to be edited. */
    type: RepairKind;
    /** 1-based position of the edit in the normalised value. */
    position: number;
    /** Character(s) currently at that position. */
    from: string;
    /** Character(s) the repair puts there. */
    to: string;
    /** The repaired identifier. */
    value: string;
}
export interface RepairResult {
    /** True when the input already satisfies its check digit. */
    valid: boolean;
    /** The scheme used (or 'unknown' when nothing matched). */
    scheme: string;
    /** The check character(s) found in the input. */
    checkDigit: string;
    /** The check character(s) the payload requires. */
    expected: string;
    /** How many repairs exist (may exceed the returned list). */
    total: number;
    /** True when the returned list was cut off at REPAIR_LIMIT. */
    truncated: boolean;
    /** The repairs, most likely first. */
    repairs: RepairCandidate[];
    /** Human-readable explanation. */
    detail: string;
}
/**
 * Enumerate the single-edit repairs for `value` under `scheme` (auto-detected
 * when omitted).
 */
export declare function repairIdentifier(value: string, scheme?: SchemeId): RepairResult;
//# sourceMappingURL=repair.d.ts.map