/**
 * Tool definitions for dsh-checkdigit: four tools exposed to every agent via
 * defineTool with strict JSON-schema parameter surfaces and compact text
 * renderers.
 *
 *   checkdigit_generate — compute the check digit(s) for a payload
 *   checkdigit_validate — verify a full identifier (auto-detect the scheme)
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
/** Build all three tool definitions. */
export declare function buildCheckdigitTools(): ToolSet;
/** Re-export for consumers that need the formatter directly. */
export { formatIban };
//# sourceMappingURL=tools.d.ts.map