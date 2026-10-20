/**
 * Configurable pricing table (USD per million tokens).
 *
 * Defaults reflect Anthropic's published first-party rates as of 2026-09
 * (https://platform.claude.com/docs/en/about-claude/pricing). Prices change:
 * override with ANTHROPIC_PRICING_JSON, e.g.
 *   {"claude-haiku-4-5":{"input":1,"output":5,"cacheWrite":1.25,"cacheRead":0.1}}
 * All costs computed here are ESTIMATES derived from SDK-reported token usage.
 */

export interface ModelPrice {
  input: number;
  output: number;
  /** 5-minute cache write rate. */
  cacheWrite: number;
  cacheRead: number;
}

const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};

let cache: Record<string, ModelPrice> | null = null;

export function getPricingTable(): Record<string, ModelPrice> {
  if (cache) return cache;
  let overrides: Record<string, ModelPrice> = {};
  const raw = process.env.ANTHROPIC_PRICING_JSON;
  if (raw) {
    try {
      overrides = JSON.parse(raw) as Record<string, ModelPrice>;
    } catch {
      console.warn("[pricing] ANTHROPIC_PRICING_JSON is not valid JSON; using defaults");
    }
  }
  cache = { ...DEFAULT_PRICES, ...overrides };
  return cache;
}

/** Most expensive known price, used conservatively for unknown models. */
function conservativePrice(table: Record<string, ModelPrice>): ModelPrice {
  return Object.values(table).reduce((a, b) => (b.output > a.output ? b : a));
}

export function priceFor(model: string): { price: ModelPrice; known: boolean } {
  const table = getPricingTable();
  const exact = table[model];
  if (exact) return { price: exact, known: true };
  const prefix = Object.keys(table).find((k) => model.startsWith(k));
  if (prefix) return { price: table[prefix]!, known: true };
  return { price: conservativePrice(table), known: false };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export function estimateCostUsd(model: string, u: TokenUsage): number {
  const { price } = priceFor(model);
  return (
    (u.inputTokens * price.input +
      u.outputTokens * price.output +
      u.cacheReadTokens * price.cacheRead +
      u.cacheCreationTokens * price.cacheWrite) /
    1_000_000
  );
}

/** Upper-bound pre-flight estimate used for budget checks before sending. */
export function preflightCostUsd(model: string, approxInputTokens: number, maxOutputTokens: number): number {
  return estimateCostUsd(model, {
    inputTokens: approxInputTokens,
    outputTokens: maxOutputTokens,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  });
}
