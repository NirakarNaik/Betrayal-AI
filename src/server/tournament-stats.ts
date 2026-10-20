/**
 * Pure tournament statistics. Only COMPLETED matches count toward results;
 * failed, cancelled, pending and running matches are reported separately.
 *
 * Definitions:
 *  - attackFrequency: resolved strikes per round alive.
 *  - betrayalsPerMatch: pacts this agent broke (strike/sabotage/vote against an
 *    active pact partner — an observable PACT_BROKEN event) per match.
 *  - allianceSuccessRate: of pacts this agent joined, the fraction that were
 *    never broken by either side (null when no pacts were formed).
 *  - invalidActionRate: (rejected + fallback actions) / rounds alive.
 *  - winRateCI: 95% Wilson score interval.
 */
import type { PersonalityId, MatchState } from "@/game/types";
import type { UsageRecord } from "@/llm/usage";
import type {
  MatchResultSummary,
  PersonalityAggregate,
  TournamentAggregate,
  TournamentMatchStatus,
} from "./tournament-types";

export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function summarizeMatch(
  state: MatchState,
  usage: UsageRecord[],
  status: TournamentMatchStatus,
  attempts: number,
  error: string | null,
): MatchResultSummary {
  const t = state.terminal;
  const lastRound = t?.round ?? state.round;
  return {
    matchId: state.id,
    seed: state.seed,
    status,
    attempts,
    terminal: t,
    players: state.players.map((p) => {
      const placement = t?.placements.find((x) => x.playerId === p.id);
      const pacts = state.pacts.filter((x) => x.aId === p.id || x.bId === p.id);
      return {
        playerId: p.id,
        personalityId: p.personalityId!,
        seat: p.seat,
        alive: p.alive,
        place: placement?.place ?? 0,
        points: placement?.points ?? 0,
        credits: p.credits,
        health: p.health,
        objectiveCompleted: placement?.objectiveCompleted ?? false,
        roundsAlive: p.eliminatedRound ?? lastRound,
        pactsFormed: pacts.length,
        pactsHonored: pacts.filter((x) => x.brokenBy === null).length,
        stats: p.stats,
      };
    }),
    usage: {
      calls: usage.filter((u) => u.outcome !== "budget_blocked").length,
      costUsd: usage.reduce((s, u) => s + u.estimatedCostUsd, 0),
    },
    error,
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const se = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) / xs.length);
};

export function aggregateTournament(matches: MatchResultSummary[], personalities: PersonalityId[]): TournamentAggregate {
  const count = (s: TournamentMatchStatus) => matches.filter((m) => m.status === s).length;
  const completed = matches.filter((m) => m.status === "completed" && m.terminal);
  const totalCost = matches.reduce((s, m) => s + m.usage.costUsd, 0);
  const byPersonality: PersonalityAggregate[] = personalities.map((pid) => {
    const rows = completed.flatMap((m) => m.players.filter((p) => p.personalityId === pid));
    const n = rows.length;
    const wins = rows.filter((r) => r.place === 1).length;
    const pactsFormed = rows.reduce((s, r) => s + r.pactsFormed, 0);
    const pactsHonored = rows.reduce((s, r) => s + r.pactsHonored, 0);
    const roundsAlive = rows.reduce((s, r) => s + r.roundsAlive, 0);
    return {
      personalityId: pid,
      n,
      wins,
      winRate: n ? wins / n : 0,
      winRateCI: wilson(wins, n),
      avgPlacement: mean(rows.map((r) => r.place)),
      placementSE: se(rows.map((r) => r.place)),
      avgPoints: mean(rows.map((r) => r.points)),
      survivalRate: n ? rows.filter((r) => r.alive).length / n : 0,
      avgCredits: mean(rows.map((r) => r.credits)),
      objectiveRate: n ? rows.filter((r) => r.objectiveCompleted).length / n : 0,
      avgDamageDealt: mean(rows.map((r) => r.stats.damageDealt)),
      avgDamageReceived: mean(rows.map((r) => r.stats.damageReceived)),
      attackFrequency: roundsAlive ? rows.reduce((s, r) => s + r.stats.strikesUsed, 0) / roundsAlive : 0,
      betrayalsPerMatch: mean(rows.map((r) => r.stats.betrayals)),
      allianceSuccessRate: pactsFormed ? pactsHonored / pactsFormed : null,
      invalidActionRate: roundsAlive ? rows.reduce((s, r) => s + r.stats.invalidActions + r.stats.fallbackActions, 0) / roundsAlive : 0,
    };
  });
  return {
    completed: completed.length,
    failed: count("failed"),
    cancelled: count("cancelled"),
    running: count("running"),
    pending: count("pending"),
    totalCostUsd: totalCost,
    avgCostPerMatchUsd: completed.length ? completed.reduce((s, m) => s + m.usage.costUsd, 0) / completed.length : 0,
    avgCallsPerMatch: completed.length ? mean(completed.map((m) => m.usage.calls)) : 0,
    byPersonality,
  };
}

/** Seat rotation: match i shifts the personality order by i so every agent plays every seat. */
export function rotatedLineup(personalities: PersonalityId[], matchIndex: number, rotate: boolean): PersonalityId[] {
  if (!rotate) return [...personalities];
  const k = matchIndex % personalities.length;
  return [...personalities.slice(k), ...personalities.slice(0, k)];
}
