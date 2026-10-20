/**
 * Pre-match ESTIMATES of model decisions and cost. These are planning numbers,
 * not measurements: actual usage is recorded per request from SDK usage fields.
 */
import { getRuleset } from "@/game/config";
import type { LlmConfig } from "./env";
import { estimateCostUsd } from "./pricing";

export interface MatchEstimate {
  aiPlayers: number;
  decisions: { negotiate: number; commit: number; vote: number; total: number };
  escalatedShare: number;
  approxCostUsd: { low: number; high: number };
  assumptions: string;
}

const APPROX_INPUT_TOKENS = 1900;
const APPROX_OUTPUT_CHEAP = 160;
const APPROX_OUTPUT_STRATEGIC = 700; // includes adaptive-thinking tokens

export function estimateMatch(rulesetId: string, aiPlayers: number, cfg: LlmConfig): MatchEstimate {
  const rules = getRuleset(rulesetId);
  const rounds = rules.maxRounds;
  const negotiate = aiPlayers * rounds;
  const commit = aiPlayers * rounds;
  const vote = aiPlayers * rules.voting.afterRounds.length;
  const total = negotiate + commit + vote;
  // Votes always escalate (+2) only when combined with another factor; assume
  // roughly all votes plus ~10% of commitments escalate.
  const escalated = vote + Math.round(commit * 0.1);
  const cheapCalls = total - escalated;
  const cheap = estimateCostUsd(cfg.modelCheap, { inputTokens: APPROX_INPUT_TOKENS, outputTokens: APPROX_OUTPUT_CHEAP, cacheReadTokens: 0, cacheCreationTokens: 0 });
  const strat = estimateCostUsd(cfg.modelStrategic, { inputTokens: APPROX_INPUT_TOKENS, outputTokens: APPROX_OUTPUT_STRATEGIC, cacheReadTokens: 0, cacheCreationTokens: 0 });
  const high = cheapCalls * cheap + escalated * strat;
  // Eliminations and early termination reduce calls; retries increase them.
  return {
    aiPlayers,
    decisions: { negotiate, commit, vote, total },
    escalatedShare: total ? escalated / total : 0,
    approxCostUsd: { low: high * 0.55, high: high * 1.15 },
    assumptions: `~${APPROX_INPUT_TOKENS} input tokens per decision; ${cfg.modelCheap} for routine decisions, ${cfg.modelStrategic} for escalations. Upper bound assumes no eliminations.`,
  };
}
