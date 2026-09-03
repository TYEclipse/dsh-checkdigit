/**
 * dsh-checkdigit — check-digit mathematics toolbox for DeepSeek Harness.
 *
 * Generate, validate and detect check digits for thirteen schemes — Luhn,
 * Verhoeff, Damm, ISBN-10, ISBN-13, EAN-8, EAN-13, UPC-A, ISIN, CUSIP, IBAN,
 * CAS Registry Number and ABA routing number — plus ISBN-10 <-> ISBN-13
 * conversion, with pure integer arithmetic and zero runtime dependencies.
 *
 * Everything is deterministic and offline: no network, no shell, no external
 * services. Ideal for the places where a model's mental arithmetic fails:
 * card numbers, book ISBNs, barcodes, securities identifiers and IBANs.
 *
 * @module dsh-checkdigit
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name (also the config key under `plugins:`). */
export declare const name = "dsh-checkdigit";
/** Services required before tool registration can start. */
export declare const inject: string[];
/** Plugin configuration (none needed — every tool is stateless). */
export interface Config {
}
export declare const Config: z<Config>;
/** Mount the check-digit tools on every live agent and every future one. */
export declare function apply(ctx: Context, _config: Config): void;
//# sourceMappingURL=index.d.ts.map