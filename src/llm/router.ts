/**
 * Centralized model router. Routine decisions use the cheap model; decisions
 * with high criticality escalate to the strategic model. No second model is
 * ever asked to review ordinary actions.
 *
 * Criticality points:
 *  +2 elimination vote (a player may be eliminated)
 *  +2 this agent is at 1 health (its own elimination is possible)
 *  +1 an opponent is at 1 health during commitment (lethal opportunity)
 *  +1 a pending pact offer (alliance decision with lasting consequences)
 *  +1 two or more pending offers (multiple plausible negotiation outcomes)
 *  +1 final round
 * Escalate when points >= ANTHROPIC_ESCALATION_THRESHOLD (default 3), unless the
 * match has already used 70% of its budget, in which case the cheap model is used.
 */
import type { AgentObservation } from "@/agents/types";
import type { LlmConfig } from "./env";

export interface RouteDecision {
  model: string;
  escalated: boolean;
  criticality: number;
  reasons: string[];
  maxTokens: number;
  effort: "low" | "medium" | "high" | null;
}

export function criticality(obs: AgentObservation, purpose: "negotiate" | "commit" | "vote"): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  const me = obs.view.players.find((p) => p.id === obs.playerId);
  const opponents = obs.view.players.filter((p) => p.alive && p.id !== obs.playerId);
  if (purpose === "vote") {
    points += 2;
    reasons.push("elimination vote");
  }
  if (me && me.health <= 1) {
    points += 2;
    reasons.push("own elimination possible");
  }
  if (purpose === "commit" && opponents.some((p) => p.health <= 1)) {
    points += 1;
    reasons.push("lethal opportunity");
  }
  const offers = obs.view.self?.pendingOffers ?? [];
  if (purpose === "commit" && offers.some((o) => o.proposePact)) {
    points += 1;
    reasons.push("alliance decision");
  }
  if (purpose === "commit" && offers.length >= 2) {
    points += 1;
    reasons.push("multiple competing offers");
  }
  if (obs.view.round >= obs.view.maxRounds) {
    points += 1;
    reasons.push("final round");
  }
  return { points, reasons };
}

export function routeModel(
  obs: AgentObservation,
  purpose: "negotiate" | "commit" | "vote",
  cfg: LlmConfig,
  matchBudgetUsedFraction: number,
): RouteDecision {
  const threshold = Number(process.env.ANTHROPIC_ESCALATION_THRESHOLD ?? 3) || 3;
  const { points, reasons } = criticality(obs, purpose);
  const budgetTight = matchBudgetUsedFraction >= 0.7;
  const escalate = points >= threshold && !budgetTight && cfg.modelStrategic !== cfg.modelCheap;
  if (escalate) {
    return {
      model: cfg.modelStrategic,
      escalated: true,
      criticality: points,
      reasons,
      maxTokens: cfg.maxOutputTokensStrategic,
      effort: cfg.strategicEffort,
    };
  }
  return {
    model: cfg.modelCheap,
    escalated: false,
    criticality: points,
    reasons: budgetTight && points >= threshold ? [...reasons, "budget tight: escalation suppressed"] : reasons,
    maxTokens: cfg.maxOutputTokens,
    effort: null,
  };
}
