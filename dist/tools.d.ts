/**
 * Tool definitions for dsh-checkdigit: six tools exposed to every agent via
 * defineTool with strict JSON-schema parameter surfaces and compact text
 * renderers.
 *
 *   checkdigit_generate — compute the check digit(s) for a payload
 *   checkdigit_validate — verify a full identifier (auto-detect the scheme)
 *   checkdigit_repair   — find the single-character edits that make it valid
 *   checkdigit_batch    — validate a whole column of identifiers at once
 *   checkdigit_info     — describe the supported schemes
 *   isbn_convert        — convert ISBN-10 <-> ISBN-13 (978 prefix only)
 *
 * @module dsh-checkdigit/tools
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { formatIban, type IbanDetail } from './iban.ts';
export interface ToolSet {
    checkdigit_generate: ToolDefinition;
    checkdigit_validate: ToolDefinition;
    checkdigit_repair: ToolDefinition;
    checkdigit_batch: ToolDefinition;
    checkdigit_info: ToolDefinition;
    isbn_convert: ToolDefinition;
}
/** Successful generate result (keys assigned only when present — lossless JSON). */
export interface GenerateOk {
    valid: true;
    scheme: string;
    checkDigit: string;
    complete: string;
}
export interface GenerateFail {
    valid: false;
    scheme: string;
    error: string;
}
export interface ValidateResult {
    valid: boolean;
    scheme: string;
    checkDigit: string;
    expected: string;
    detail: string;
    iban?: IbanDetail;
}
export interface SchemeInfo {
    id: string;
    name: string;
    description: string;
    length: string;
    payload: string;
    check: string;
    example: string;
}
export interface InfoResult {
    schemes: SchemeInfo[];
}
/** One row of the batch report. */
export interface BatchItem {
    /** 1-based position of the value in the request. */
    index: number;
    /** The value exactly as submitted. */
    value: string;
    /** Scheme used (explicitly requested or auto-detected); 'unknown' when none matched. */
    scheme: string;
    valid: boolean;
    checkDigit: string;
    expected: string;
    detail: string;
}
export interface BatchResult {
    /** How many values were checked. */
    total: number;
    /** Values whose check digit is correct. */
    validCount: number;
    /** Values with a scheme but a failing check digit. */
    invalidCount: number;
    /** Values whose format matched no known scheme. */
    unknownCount: number;
    /** Per-scheme counts, most frequent first (ties by scheme id). */
    byScheme: {
        scheme: string;
        count: number;
    }[];
    /** One entry per submitted value, in request order. */
    results: BatchItem[];
    /** Set only when the request itself was rejected (empty or oversized list). */
    error?: string;
}
/** Maximum number of identifiers accepted by one batch call. */
export declare const BATCH_LIMIT = 50;
/** Build all three tool definitions. */
export declare function buildCheckdigitTools(): ToolSet;
/** Re-export for consumers that need the formatter directly. */
export { formatIban };
//# sourceMappingURL=tools.d.ts.map