/**
 * IBAN (ISO 13616) support for dsh-checkdigit.
 *
 * IBAN = 2-letter country code + 2 check digits + BBAN. The check uses
 * mod-97 arithmetic on the digit-expanded string: move the first four
 * characters to the end, expand letters (A=10 … Z=35), and the result must be
 * 1 (mod 97) for a valid IBAN.
 *
 * A compact registry of BBAN lengths for common countries powers validation
 * and generation; countries outside the registry still get the mod-97 check
 * with a length sanity bound.
 *
 * @module dsh-checkdigit/iban
 */
import type { CheckResult } from './core.ts';
export interface IbanDetail {
    country: string;
    checkDigits: string;
    bban: string;
    formatted: string;
}
/** Compute the two check digits for a country + BBAN pair. */
export declare function ibanCheckDigits(country: string, bban: string): string;
/** Total length expected for a country, or undefined when unknown. */
export declare function ibanLength(country: string): number | undefined;
export declare function formatIban(iban: string): string;
/** Validate a full IBAN. */
export declare function validateIban(value: string): CheckResult;
/** Build the IbanDetail block for a structurally valid IBAN. */
export declare function ibanDetail(value: string): IbanDetail | undefined;
/**
 * Generate the two check digits for an IBAN payload (country code + BBAN).
 * Throws on malformed payloads — the scheme-level generate contract.
 */
export declare function generateIbanCheck(payload: string): string;
//# sourceMappingURL=iban.d.ts.map