import type { PersonalityId, PlayerStats, TerminalState } from "@/game/types";

export type TournamentMatchStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface MatchResultPlayer {
  playerId: string;
  personalityId: PersonalityId;
  seat: number;
  alive: boolean;
  place: number;
  points: number;
  credits: number;
  health: number;
  objectiveCompleted: boolean;
  roundsAlive: number;
  pactsFormed: number;
  pactsHonored: number;
  stats: PlayerStats;
}

export interface MatchResultSummary {
  matchId: string;
  seed: number;
  status: TournamentMatchStatus;
  attempts: number;
  terminal: TerminalState | null;
  players: MatchResultPlayer[];
  usage: { calls: number; costUsd: number };
  error: string | null;
}

export interface TournamentConfig {
  name: string;
  matchCount: number;
  seedStart: number;
  rulesetId: string;
  agentMode: "live" | "demo";
  personalities: PersonalityId[];
  rotateSeats: boolean;
  concurrency: number;
}

export interface TournamentRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "running" | "completed" | "cancelled" | "failed";
  config: TournamentConfig;
  metadata: {
    modelCheap: string | null;
    modelStrategic: string | null;
    escalationThreshold: number | null;
    agentIds: Record<string, string>;
    rulesetId: string;
    failurePolicy: string;
  };
  matches: MatchResultSummary[];
  estimatedCostUsd: number;
  error: string | null;
}

export interface PersonalityAggregate {
  personalityId: PersonalityId;
  n: number;
  wins: number;
  winRate: number;
  winRateCI: [number, number];
  avgPlacement: number;
  placementSE: number;
  avgPoints: number;
  survivalRate: number;
  avgCredits: number;
  objectiveRate: number;
  avgDamageDealt: number;
  avgDamageReceived: number;
  attackFrequency: number;
  betrayalsPerMatch: number;
  allianceSuccessRate: number | null;
  invalidActionRate: number;
}

export interface TournamentAggregate {
  completed: number;
  failed: number;
  cancelled: number;
  running: number;
  pending: number;
  totalCostUsd: number;
  avgCostPerMatchUsd: number;
  avgCallsPerMatch: number;
  byPersonality: PersonalityAggregate[];
}
