export type RequestOutcome =
  | "success"
  | "invalid_output"
  | "timeout"
  | "rate_limited"
  | "api_error"
  | "cancelled"
  | "budget_blocked"
  | "refusal"
  | "max_tokens";

/** One API request attempt, recorded from SDK-reported usage fields. */
export interface UsageRecord {
  id: string;
  matchId: string | null;
  tournamentId: string | null;
  playerId: string | null;
  purpose: "negotiate" | "commit" | "vote";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  durationMs: number;
  estimatedCostUsd: number;
  priceKnown: boolean;
  outcome: RequestOutcome;
  attempt: number;
  escalated: boolean;
  error: string | null;
  at: number;
}

export interface UsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  byModel: Record<string, { calls: number; costUsd: number }>;
  failures: number;
}

export function summarizeUsage(records: UsageRecord[]): UsageSummary {
  const s: UsageSummary = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    byModel: {},
    failures: 0,
  };
  for (const r of records) {
    if (r.outcome === "budget_blocked") continue;
    s.calls += 1;
    s.inputTokens += r.inputTokens;
    s.outputTokens += r.outputTokens;
    s.cacheReadTokens += r.cacheReadTokens;
    s.cacheCreationTokens += r.cacheCreationTokens;
    s.costUsd += r.estimatedCostUsd;
    if (r.outcome !== "success") s.failures += 1;
    const m = (s.byModel[r.model] ??= { calls: 0, costUsd: 0 });
    m.calls += 1;
    m.costUsd += r.estimatedCostUsd;
  }
  return s;
}
