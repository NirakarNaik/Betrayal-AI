/**
 * Server-only LLM configuration. Never import this from client components:
 * it reads the API key from process.env.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface LlmConfig {
  apiKeyPresent: boolean;
  modelCheap: string;
  modelStrategic: string;
  maxOutputTokens: number;
  maxOutputTokensStrategic: number;
  strategicEffort: "low" | "medium" | "high";
  matchBudgetUsd: number;
  globalBudgetUsd: number;
  requestTimeoutMs: number;
  maxRetries: number;
  globalConcurrency: number;
  perMatchConcurrency: number;
  requestsPerMinute: number;
  tournamentConcurrency: number;
  /** "auto" uses Claude when a key is present; "demo" forces the heuristic agents. */
  agentMode: "auto" | "demo";
}

export function getLlmConfig(): LlmConfig {
  const effort = process.env.ANTHROPIC_STRATEGIC_EFFORT;
  return {
    apiKeyPresent: Boolean(process.env.ANTHROPIC_API_KEY),
    modelCheap: process.env.ANTHROPIC_MODEL_CHEAP || "claude-haiku-4-5",
    modelStrategic: process.env.ANTHROPIC_MODEL_STRATEGIC || "claude-opus-5-5",
    maxOutputTokens: num("ANTHROPIC_MAX_OUTPUT_TOKENS", 700),
    maxOutputTokensStrategic: num("ANTHROPIC_MAX_OUTPUT_TOKENS_STRATEGIC", 4000),
    strategicEffort: effort === "medium" || effort === "high" ? effort : "low",
    matchBudgetUsd: num("ANTHROPIC_MATCH_BUDGET_USD", 0.75),
    globalBudgetUsd: num("ANTHROPIC_GLOBAL_BUDGET_USD", 20),
    requestTimeoutMs: num("ANTHROPIC_REQUEST_TIMEOUT_MS", 45_000),
    maxRetries: Math.min(4, Math.max(0, num("ANTHROPIC_MAX_RETRIES", 2))),
    globalConcurrency: Math.max(1, num("ANTHROPIC_GLOBAL_CONCURRENCY", 4)),
    perMatchConcurrency: Math.max(1, num("ANTHROPIC_MATCH_CONCURRENCY", 2)),
    requestsPerMinute: Math.max(1, num("ANTHROPIC_REQUESTS_PER_MINUTE", 40)),
    tournamentConcurrency: Math.max(1, num("TOURNAMENT_CONCURRENCY", 2)),
    agentMode: process.env.AGENT_MODE === "demo" ? "demo" : "auto",
  };
}

/** True when live Claude agents will be used. */
export function isLiveMode(cfg: LlmConfig = getLlmConfig()): boolean {
  return cfg.apiKeyPresent && cfg.agentMode === "auto";
}
