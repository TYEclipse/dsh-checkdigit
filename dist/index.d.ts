/**
 * dsh-checkdigit — check-digit mathematics toolbox for DeepSeek Harness.
 *
 * Generate, validate, repair and detect check digits for seventeen schemes —
 * Luhn, Verhoeff, Damm, ISBN-10, ISBN-13, EAN-8, EAN-13, UPC-A, GTIN-14, ISSN,
 * ISIN, CUSIP, SEDOL, IBAN, CAS Registry Number, ABA routing number and NPI —
 * plus ISBN-10 <-> ISBN-13 conversion, a single-edit repair search and a batch
 * validator for whole columns of identifiers, with pure integer arithmetic and
 * zero runtime dependencies.
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