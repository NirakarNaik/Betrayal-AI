/**
 * Core type definitions for the Betrayal Protocol game engine.
 *
 * The engine is pure: it never imports React, Supabase, or the Claude SDK.
 * All state transitions are functions of (state, input) -> (state, events).
 */

export type PlayerId = string;
export type MatchMode = "spectator" | "human";
export type PlayerKind = "ai" | "human";

export type Phase =
  | "negotiation"
  | "commitment"
  | "resolution"
  | "reveal"
  | "voting"
  | "complete";

export type PersonalityId =
  | "chessmaster"
  | "snake"
  | "politician"
  | "chaos_gremlin"
  | "quant";

export type ActionType =
  | "strike"
  | "guard"
  | "scout"
  | "investigate"
  | "sabotage"
  | "trade"
  | "mediate"
  | "recover";

/** A primary action as proposed by a player (AI or human) before validation. */
export type ActionProposal =
  | { action: "strike"; targetId: PlayerId }
  | { action: "guard" }
  | { action: "scout" }
  | { action: "investigate"; targetId: PlayerId }
  | { action: "sabotage"; targetId: PlayerId }
  | { action: "trade"; targetId: PlayerId; amount: number }
  | { action: "mediate"; targetId: PlayerId }
  | { action: "recover" };

export type ActionSource = "model" | "human" | "fallback" | "heuristic" | "replay";

export interface CommittedAction {
  playerId: PlayerId;
  round: number;
  proposal: ActionProposal;
  source: ActionSource;
  /** Short agent-provided summary. An agent statement, never proof of anything. */
  decisionSummary: string | null;
  committedAt: number;
}

export type ObjectiveKind =
  | "hoarder"
  | "pacifist"
  | "dealmaker"
  | "nemesis"
  | "survivor"
  | "iron_wall"
  | "clean_hands_voter"
  | "spymaster"
  | "influencer";

export type ObjectiveCategory = "economic" | "combat" | "social" | "survival" | "intel";

export interface SecretObjective {
  kind: ObjectiveKind;
  category: ObjectiveCategory;
  title: string;
  description: string;
  /** For targeted objectives (nemesis). */
  rivalId: PlayerId | null;
}

export type ClueTier = "category" | "objective" | "progress";

export interface Clue {
  round: number;
  targetId: PlayerId;
  tier: ClueTier;
  text: string;
}

export interface PlayerStats {
  damageDealt: number;
  damageReceived: number;
  strikesUsed: number;
  tradesCompleted: number;
  betrayals: number;
  investigationsByTarget: Record<PlayerId, number>;
  votesCast: { round: number; targetId: PlayerId | null }[];
  invalidActions: number;
  fallbackActions: number;
  mediationsSucceeded: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  kind: PlayerKind;
  personalityId: PersonalityId | null;
  seat: number;
  health: number;
  credits: number;
  intel: number;
  influence: number;
  alive: boolean;
  eliminatedRound: number | null;
  eliminationCause: "damage" | "vote" | null;
  /** Private: never sent to other players' views. */
  objective: SecretObjective;
  /** Private: clues this player has obtained. */
  clues: Clue[];
  /** Credits held in escrow for outstanding offers. */
  escrow: number;
  stats: PlayerStats;
}

export interface Message {
  id: string;
  round: number;
  fromId: PlayerId;
  /** null = public broadcast; otherwise private to a single recipient. */
  toId: PlayerId | null;
  text: string;
  /** Credits offered (escrowed on send). Only allowed on private messages. */
  offerCredits: number;
  /** Proposes a non-aggression pact. Only allowed on private messages. */
  proposePact: boolean;
  /** Offer lifecycle; "none" for plain messages. */
  offerStatus: "none" | "pending" | "accepted" | "declined" | "expired" | "failed";
  createdAt: number;
}

export interface Pact {
  id: string;
  aId: PlayerId;
  bId: PlayerId;
  formedRound: number;
  /** Pact is active through the end of this round (including its vote). */
  expiresAfterRound: number;
  brokenBy: PlayerId | null;
  brokenRound: number | null;
}

export type TerminalReason =
  | "last_player_standing"
  | "final_round_complete"
  | "mutual_destruction"
  | "cancelled"
  | "failed";

export interface Placement {
  playerId: PlayerId;
  place: number;
  points: number;
  protocolScore: number;
  objectiveCompleted: boolean;
}

export interface TerminalState {
  reason: TerminalReason;
  winnerId: PlayerId | null;
  placements: Placement[];
  round: number;
}

export interface MatchState {
  id: string;
  seed: number;
  rulesetId: string;
  mode: MatchMode;
  round: number;
  phase: Phase;
  players: PlayerState[];
  /** Messages (public and private). Filtered by visibility before leaving the server. */
  messages: Message[];
  pacts: Pact[];
  /** Commitments for the current round; hidden until resolution. */
  commitments: Record<PlayerId, CommittedAction>;
  /** Votes for the current voting phase; hidden until resolved. */
  votes: Record<PlayerId, PlayerId | null>;
  /** Players who have finished negotiating this round. */
  negotiationDone: PlayerId[];
  /** Full committed-action history across rounds (revealed after resolution). */
  actionHistory: CommittedAction[];
  events: GameEvent[];
  /** Seeded PRNG state; advanced deterministically. */
  rngState: number;
  /** Monotonic counter used to create deterministic IDs. */
  nextId: number;
  terminal: TerminalState | null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Visibility of an event.
 * - public: everyone sees it.
 * - private: only the listed players (and omniscient spectators of all-AI matches).
 * - server: never sent to a player; kept for audit (e.g. commitment contents).
 */
export type Visibility =
  | { scope: "public" }
  | { scope: "private"; playerIds: PlayerId[] }
  | { scope: "server" };

export type GameEventType =
  | "MATCH_STARTED"
  | "ROUND_STARTED"
  | "PHASE_CHANGED"
  | "MESSAGE_SENT"
  | "OFFER_SENT"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "OFFER_EXPIRED"
  | "OFFER_FAILED"
  | "PACT_FORMED"
  | "PACT_BROKEN"
  | "PACT_EXPIRED"
  | "ACTION_COMMITTED"
  | "ACTION_REJECTED"
  | "ACTION_FALLBACK"
  | "ACTION_REVEALED"
  | "ACTION_FIZZLED"
  | "ATTACK_RESOLVED"
  | "GUARD_TRIGGERED"
  | "SCOUT_RESOLVED"
  | "INVESTIGATION_RESOLVED"
  | "SABOTAGE_RESOLVED"
  | "RESOURCE_TRANSFERRED"
  | "RECOVER_RESOLVED"
  | "MEDIATION_RESOLVED"
  | "PLAYER_ELIMINATED"
  | "VOTE_CAST"
  | "VOTE_RESOLVED"
  | "OBJECTIVE_ASSIGNED"
  | "OBJECTIVE_COMPLETED"
  | "ROUND_COMPLETED"
  | "MATCH_COMPLETED";

export interface GameEvent {
  id: string;
  seq: number;
  type: GameEventType;
  round: number;
  phase: Phase;
  /** Logical timestamp supplied by the caller (ms since epoch); not used in logic. */
  at: number;
  visibility: Visibility;
  /** Human-readable summary generated by code (never by an LLM). */
  summary: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Engine inputs (recorded for replay)
// ---------------------------------------------------------------------------

export interface MessageInput {
  toId: PlayerId | null;
  text: string;
  offerCredits?: number;
  proposePact?: boolean;
}

export type EngineInput =
  | { kind: "message"; playerId: PlayerId; message: MessageInput; at: number }
  | { kind: "end_negotiation"; playerId: PlayerId; at: number }
  | { kind: "respond_offer"; playerId: PlayerId; messageId: string; accept: boolean; at: number }
  | {
      kind: "commit";
      playerId: PlayerId;
      proposal: ActionProposal;
      source: ActionSource;
      decisionSummary: string | null;
      at: number;
    }
  | { kind: "vote"; playerId: PlayerId; targetId: PlayerId | null; at: number }
  | { kind: "advance"; at: number; force?: boolean }
  | { kind: "cancel"; reason: "cancelled" | "failed"; at: number };

export interface EngineResult {
  ok: boolean;
  state: MatchState;
  events: GameEvent[];
  error?: string;
}

export interface LegalActionOption {
  action: ActionType;
  cost: { credits: number; intel: number; influence: number };
  requiresTarget: boolean;
  validTargets: PlayerId[];
  requiresAmount: boolean;
  maxAmount: number;
  affordable: boolean;
  reasonUnavailable: string | null;
}

export interface ValidationResult {
  ok: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Tournament types
// ---------------------------------------------------------------------------

export interface MatchResultSummary {
  matchId: string;
  seed: number;
  status: "completed" | "failed" | "cancelled" | "running" | "pending";
  terminal: TerminalState | null;
  players: {
    playerId: PlayerId;
    personalityId: PersonalityId | null;
    seat: number;
    alive: boolean;
    credits: number;
    health: number;
    objectiveCompleted: boolean;
    stats: PlayerStats;
  }[];
  pactsFormed: number;
  pactsBroken: number;
  usage: { calls: number; costUsd: number };
  error: string | null;
}
