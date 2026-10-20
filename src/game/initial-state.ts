import { getRuleset, PLAYER_COUNT } from "./config";
import { emit, PUBLIC, privateTo } from "./events";
import { assignObjectives } from "./objectives";
import { normalizeSeed, type Rng } from "./random";
import type { GameEvent, MatchMode, MatchState, PersonalityId, PlayerKind, PlayerState } from "./types";

export interface PlayerSetup {
  id: string;
  name: string;
  kind: PlayerKind;
  personalityId: PersonalityId | null;
}

export interface MatchSetup {
  id: string;
  seed: number;
  rulesetId: string;
  mode: MatchMode;
  /** Players in seat order. */
  players: PlayerSetup[];
  at: number;
}

export function emptyStats(): PlayerState["stats"] {
  return {
    damageDealt: 0,
    damageReceived: 0,
    strikesUsed: 0,
    tradesCompleted: 0,
    betrayals: 0,
    investigationsByTarget: {},
    votesCast: [],
    invalidActions: 0,
    fallbackActions: 0,
    mediationsSucceeded: 0,
  };
}

export function createInitialState(setup: MatchSetup): { state: MatchState; events: GameEvent[] } {
  const rules = getRuleset(setup.rulesetId);
  if (setup.players.length !== PLAYER_COUNT) {
    throw new Error(`Betrayal Protocol requires exactly ${PLAYER_COUNT} players`);
  }
  const ids = new Set(setup.players.map((p) => p.id));
  if (ids.size !== setup.players.length) throw new Error("Duplicate player ids");
  const humans = setup.players.filter((p) => p.kind === "human").length;
  if (setup.mode === "spectator" && humans !== 0) throw new Error("Spectator matches have no humans");
  if (setup.mode === "human" && humans !== 1) throw new Error("Human matches have exactly one human");

  const rng: Rng = { state: normalizeSeed(setup.seed) };
  const objectives = assignObjectives(rng, setup.players);

  const players: PlayerState[] = setup.players.map((p, seat) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    personalityId: p.personalityId,
    seat,
    health: rules.start.health,
    credits: rules.start.credits,
    intel: rules.start.intel,
    influence: rules.start.influence,
    alive: true,
    eliminatedRound: null,
    eliminationCause: null,
    objective: objectives[p.id]!,
    clues: [],
    escrow: 0,
    stats: emptyStats(),
  }));

  const state: MatchState = {
    id: setup.id,
    seed: normalizeSeed(setup.seed),
    rulesetId: rules.id,
    mode: setup.mode,
    round: 1,
    phase: "negotiation",
    players,
    messages: [],
    pacts: [],
    commitments: {},
    votes: {},
    negotiationDone: [],
    actionHistory: [],
    events: [],
    rngState: rng.state,
    nextId: 1,
    terminal: null,
  };

  const events: GameEvent[] = [];
  emit(state, events, "MATCH_STARTED", setup.at, PUBLIC, `Betrayal Protocol begins: ${rules.name}.`, {
    seed: state.seed,
    rulesetId: rules.id,
    mode: setup.mode,
    players: players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, kind: p.kind })),
  });
  for (const p of players) {
    emit(
      state,
      events,
      "OBJECTIVE_ASSIGNED",
      setup.at,
      privateTo(p.id),
      `Secret objective assigned: ${p.objective.title}.`,
      { playerId: p.id, objective: p.objective.kind },
    );
  }
  emit(state, events, "ROUND_STARTED", setup.at, PUBLIC, "Round 1 begins. Negotiation is open.", {});
  return { state, events };
}
