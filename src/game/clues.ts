/**
 * Deterministic investigation clues.
 *
 * Tiers escalate per (investigator, target) pair:
 *  1st investigation -> objective CATEGORY (economic/combat/social/survival/intel)
 *  2nd investigation -> exact objective title (and rival, if any)
 *  3rd+              -> current objective progress status
 * Clues reveal only the target's own hidden state, never anyone else's.
 */
import type { RulesetConfig } from "./config";
import { evaluateObjective } from "./objectives";
import type { Clue, MatchState, PlayerState } from "./types";

export function buildClue(state: MatchState, rules: RulesetConfig, target: PlayerState, priorCount: number): Clue {
  const o = target.objective;
  if (priorCount === 0) {
    return {
      round: state.round,
      targetId: target.id,
      tier: "category",
      text: `${target.name}'s secret objective is ${o.category.toUpperCase()}-type.`,
    };
  }
  if (priorCount === 1) {
    const rival = o.rivalId ? state.players.find((p) => p.id === o.rivalId)?.name : null;
    return {
      round: state.round,
      targetId: target.id,
      tier: "objective",
      text: `${target.name}'s objective is "${o.title}"${rival ? ` targeting ${rival}` : ""}.`,
    };
  }
  const progress = evaluateObjective(state, target, rules, false);
  return {
    round: state.round,
    targetId: target.id,
    tier: "progress",
    text: `${target.name}'s objective "${o.title}" is currently ${progress.status.replace("_", " ")}.`,
  };
}
