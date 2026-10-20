/**
 * Final ranking and placement points.
 *
 * Ranking keys, in order:
 *  1. Survival status: survivors first; eliminated players ranked by elimination
 *     round (later is better). Players eliminated in the same round tie here.
 *  2. Protocol Score = objective bonus + influence + health + floor(credits / 3).
 *  3. Credits.
 *  4. Health.
 *  5. Deterministic final tie-break: FNV-1a hash of `${seed}:${playerId}` (lower wins).
 */
import type { RulesetConfig } from "./config";
import { evaluateObjective } from "./objectives";
import { hashString } from "./random";
import type { MatchState, Placement, PlayerState } from "./types";

export function protocolScore(state: MatchState, p: PlayerState, rules: RulesetConfig, final: boolean): number {
  const objectiveDone = evaluateObjective(state, p, rules, final).status === "completed";
  return (
    (objectiveDone ? rules.scoring.objectiveBonus : 0) +
    p.influence * rules.scoring.influenceWeight +
    p.health * rules.scoring.healthWeight +
    Math.floor(p.credits / rules.scoring.creditsPerPoint)
  );
}

function survivalTier(p: PlayerState): number {
  return p.alive ? Number.MAX_SAFE_INTEGER : (p.eliminatedRound ?? 0);
}

export function rankPlayers(state: MatchState, rules: RulesetConfig, final: boolean): Placement[] {
  const rows = state.players.map((p) => ({
    p,
    score: protocolScore(state, p, rules, final),
    objectiveCompleted: evaluateObjective(state, p, rules, final).status === "completed",
    tie: hashString(`${state.seed}:${p.id}`),
  }));
  rows.sort(
    (a, b) =>
      survivalTier(b.p) - survivalTier(a.p) ||
      b.score - a.score ||
      b.p.credits - a.p.credits ||
      b.p.health - a.p.health ||
      a.tie - b.tie,
  );
  return rows.map((r, i) => ({
    playerId: r.p.id,
    place: i + 1,
    points: rules.scoring.placementPoints[i] ?? 0,
    protocolScore: r.score,
    objectiveCompleted: r.objectiveCompleted,
  }));
}
