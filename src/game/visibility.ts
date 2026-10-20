/**
 * Server-side information filtering. The browser only ever receives the output
 * of `buildView`, never raw MatchState.
 *
 * Policy:
 * - Resources, health and alive status are public.
 * - Secret objectives and clues: visible to their owner; revealed to everyone at
 *   match completion.
 * - Private messages / offers / pacts: visible to the two parties only.
 * - Committed actions: hidden until resolution; only "has committed" is public.
 * - Votes: sealed until the vote resolves.
 * - Omniscient spectators (allowed only for all-AI spectator matches, where no
 *   human can exploit the information) see private state and agent statements.
 */
import { getRuleset } from "./config";
import { canSee } from "./events";
import { getLegalActions } from "./legal-actions";
import { evaluateObjective, type ObjectiveProgress } from "./objectives";
import { pendingPlayers } from "./engine";
import type {
  ActionProposal,
  Clue,
  GameEvent,
  LegalActionOption,
  MatchState,
  Message,
  Pact,
  PersonalityId,
  PlayerId,
  SecretObjective,
  TerminalState,
} from "./types";

export type Viewer = { kind: "player"; playerId: PlayerId } | { kind: "spectator" };

export interface PlayerView {
  id: PlayerId;
  name: string;
  kind: "ai" | "human";
  personalityId: PersonalityId | null;
  seat: number;
  health: number;
  credits: number;
  escrow: number;
  intel: number;
  influence: number;
  alive: boolean;
  eliminatedRound: number | null;
  eliminationCause: "damage" | "vote" | null;
  hasCommitted: boolean;
  hasVoted: boolean;
  doneNegotiating: boolean;
  objective: SecretObjective | null;
  objectiveProgress: ObjectiveProgress | null;
  clues: Clue[] | null;
}

export interface SelfView {
  playerId: PlayerId;
  legalActions: LegalActionOption[];
  pendingOffers: Message[];
  committed: { proposal: ActionProposal } | null;
  vote: PlayerId | null | undefined;
  messagesRemaining: number;
}

export interface MatchView {
  id: string;
  seed: number;
  rulesetId: string;
  mode: "spectator" | "human";
  round: number;
  phase: MatchState["phase"];
  maxRounds: number;
  votingRounds: number[];
  omniscient: boolean;
  viewer: Viewer;
  players: PlayerView[];
  messages: Message[];
  pacts: Pact[];
  events: GameEvent[];
  pendingPlayerIds: PlayerId[];
  terminal: TerminalState | null;
  self: SelfView | null;
  /** Revealed per-round action history (only resolved rounds). */
  actionHistory: { round: number; playerId: PlayerId; proposal: ActionProposal; source: string; decisionSummary: string | null }[];
}

export function buildView(state: MatchState, viewer: Viewer, omniscientAllowed: boolean): MatchView {
  const rules = getRuleset(state.rulesetId);
  const complete = state.phase === "complete";
  const viewerId = viewer.kind === "player" ? viewer.playerId : null;
  // Omniscience is never granted to a participant, and only in all-AI matches.
  const omniscient = omniscientAllowed && viewer.kind === "spectator" && state.mode === "spectator";
  const seesPrivate = (ids: (PlayerId | null)[]) => omniscient || (viewerId !== null && ids.includes(viewerId));

  const players: PlayerView[] = state.players.map((p) => {
    const seeSecrets = complete || omniscient || p.id === viewerId;
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      personalityId: p.personalityId,
      seat: p.seat,
      health: p.health,
      credits: p.credits,
      escrow: p.escrow,
      intel: p.intel,
      influence: p.influence,
      alive: p.alive,
      eliminatedRound: p.eliminatedRound,
      eliminationCause: p.eliminationCause,
      hasCommitted: Boolean(state.commitments[p.id]),
      hasVoted: p.id in state.votes,
      doneNegotiating: state.negotiationDone.includes(p.id),
      objective: seeSecrets ? p.objective : null,
      objectiveProgress: seeSecrets ? evaluateObjective(state, p, rules, complete) : null,
      clues: seeSecrets ? p.clues : null,
    };
  });

  const messages = state.messages.filter((m) => complete || m.toId === null || seesPrivate([m.fromId, m.toId]));
  const pacts = state.pacts.filter((p) => complete || seesPrivate([p.aId, p.bId]));
  const events = state.events.filter((e) => canSee(e, viewerId, omniscient) || (complete && e.visibility.scope === "private"));

  let self: SelfView | null = null;
  if (viewerId) {
    const me = state.players.find((p) => p.id === viewerId);
    if (me) {
      const sent = state.messages.filter((m) => m.round === state.round && m.fromId === me.id).length;
      const c = state.commitments[me.id];
      self = {
        playerId: me.id,
        legalActions: state.phase === "commitment" ? getLegalActions(state, me.id, rules) : [],
        pendingOffers: state.messages.filter((m) => m.toId === me.id && m.offerStatus === "pending"),
        committed: c ? { proposal: c.proposal } : null,
        vote: me.id in state.votes ? state.votes[me.id] : undefined,
        messagesRemaining: Math.max(0, rules.negotiation.maxMessagesPerRound - sent),
      };
    }
  }

  const showSummaries = omniscient || complete;
  return {
    id: state.id,
    seed: state.seed,
    rulesetId: state.rulesetId,
    mode: state.mode,
    round: state.round,
    phase: state.phase,
    maxRounds: rules.maxRounds,
    votingRounds: rules.voting.afterRounds,
    omniscient,
    viewer,
    players,
    messages,
    pacts,
    events,
    pendingPlayerIds: pendingPlayers(state),
    terminal: state.terminal,
    self,
    actionHistory: state.actionHistory.map((a) => ({
      round: a.round,
      playerId: a.playerId,
      proposal: a.proposal,
      source: a.source,
      decisionSummary: showSummaries || a.playerId === viewerId ? a.decisionSummary : null,
    })),
  };
}
