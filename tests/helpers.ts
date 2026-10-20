import { applyInput } from "@/game/engine";
import { createInitialState, type MatchSetup } from "@/game/initial-state";
import type { ActionProposal, EngineInput, MatchState, PersonalityId, PlayerId } from "@/game/types";

export const PERSONAS: PersonalityId[] = ["chessmaster", "snake", "politician", "chaos_gremlin", "quant"];
export const IDS = ["p1", "p2", "p3", "p4", "p5"] as const;

export function setup(overrides: Partial<MatchSetup> = {}): MatchSetup {
  return {
    id: "m_test",
    seed: 12345,
    rulesetId: "standard-v1",
    mode: "spectator",
    at: 0,
    players: IDS.map((id, i) => ({ id, name: `Agent${i + 1}`, kind: "ai" as const, personalityId: PERSONAS[i]! })),
    ...overrides,
  };
}

export function newMatch(overrides: Partial<MatchSetup> = {}): MatchState {
  return createInitialState(setup(overrides)).state;
}

export function apply(state: MatchState, input: EngineInput): MatchState {
  const r = applyInput(state, input);
  if (!r.ok) throw new Error(`Input failed: ${r.error}`);
  return r.state;
}

/** Skip negotiation for everyone and move to commitment. */
export function toCommitment(state: MatchState): MatchState {
  return apply(state, { kind: "advance", at: 1, force: true });
}

/** Commit the given actions (others RECOVER) and resolve the round into reveal. */
export function playRound(state: MatchState, actions: Partial<Record<PlayerId, ActionProposal>>): MatchState {
  let s = state.phase === "negotiation" ? toCommitment(state) : state;
  for (const p of s.players.filter((x) => x.alive)) {
    const proposal = actions[p.id] ?? { action: "recover" };
    s = apply(s, { kind: "commit", playerId: p.id, proposal, source: "heuristic", decisionSummary: null, at: 2 });
  }
  return apply(s, { kind: "advance", at: 3 });
}

export function player(state: MatchState, id: PlayerId) {
  return state.players.find((p) => p.id === id)!;
}

/** Mutate resources directly for test setup (returns a clone). */
export function withPlayer(state: MatchState, id: PlayerId, patch: Partial<MatchState["players"][number]>): MatchState {
  const s = structuredClone(state);
  Object.assign(s.players.find((p) => p.id === id)!, patch);
  return s;
}

export function eventsOf(state: MatchState, type: string) {
  return state.events.filter((e) => e.type === type);
}
