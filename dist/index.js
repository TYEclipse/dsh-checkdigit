/**
 * dsh-checkdigit — check-digit mathematics toolbox for DeepSeek Harness.
 *
 * Generate, validate and detect check digits for eleven schemes — Luhn,
 * Verhoeff, Damm, ISBN-10, ISBN-13, EAN-8, EAN-13, UPC-A, ISIN, CUSIP and
 * IBAN — with pure integer arithmetic and zero runtime dependencies.
 *
 * Everything is deterministic and offline: no network, no shell, no external
 * services. Ideal for the places where a model's mental arithmetic fails:
 * card numbers, book ISBNs, barcodes, securities identifiers and IBANs.
 *
 * @module dsh-checkdigit
 */
import z from '@deepseek-ai/schemastery';
import { buildCheckdigitTools } from "./tools.js";
/** Stable Cordis plugin name (also the config key under `plugins:`). */
export const name = 'dsh-checkdigit';
/** Services required before tool registration can start. */
export const inject = ['agents', 'tools'];
export const Config = z.object({});
/** Register every check-digit tool on one agent; returns the disposer. */
function decorate(agent, tools) {
    const disposers = Object.values(tools).map((definition) => agent.ctx.tools.register(definition));
    return () => {
        for (const dispose of disposers) {
            try {
                dispose();
            }
            catch {
                // already disposed
            }
        }
    };
}
/** Mount the check-digit tools on every live agent and every future one. */
export function apply(ctx, _config) {
    const tools = buildCheckdigitTools();
    const disposers = new Set();
    const decorateAgent = (agent) => {
        try {
            disposers.add(decorate(agent, tools));
        }
        catch (error) {
            ctx.logger('checkdigit').warn(`tool registration for agent ${agent.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    for (const agent of ctx.agents.list())
        decorateAgent(agent);
    const off = ctx.on('agent/created', ({ agent }) => decorateAgent(agent));
    ctx.effect(() => () => {
        off();
        for (const dispose of disposers) {
            try {
                dispose();
            }
            catch {
                // already disposed
            }
        }
        disposers.clear();
    });
}
//# sourceMappingURL=index.js.map