import type { RulesetConfig } from "@/game/config";
import type { ActionProposal, MessageInput, PlayerId } from "@/game/types";
import type { MatchView } from "@/game/visibility";
import type { AgentMemory } from "./memory";
import type { PersonalityProfile } from "./personalities";
import type { UsageRecord } from "@/llm/usage";

/** Everything an agent is allowed to know when deciding. Built from a filtered player view. */
export interface AgentObservation {
  matchId: string;
  seed: number;
  playerId: PlayerId;
  view: MatchView;
  memory: AgentMemory;
  profile: PersonalityProfile;
  rules: RulesetConfig;
}

export interface BeliefUpdate {
  playerId: PlayerId;
  trustDelta: number;
  note: string | null;
}

export interface NegotiationDecision {
  messages: MessageInput[];
  summary: string | null;
  beliefs: BeliefUpdate[];
}

export interface CommitDecision {
  offerResponses: { messageId: string; accept: boolean }[];
  proposal: ActionProposal;
  summary: string | null;
  beliefs: BeliefUpdate[];
}

export interface VoteDecision {
  targetId: PlayerId | null;
  summary: string | null;
}

export type DecisionSource = "model" | "heuristic" | "fallback";

export interface DecisionMeta {
  source: DecisionSource;
  model: string | null;
  attempts: number;
  /** Validation or transport errors encountered (compact). */
  errors: string[];
  usage: UsageRecord[];
  escalated: boolean;
}

export interface Decided<T> {
  decision: T;
  meta: DecisionMeta;
}

export interface AgentBrain {
  readonly kind: "claude" | "heuristic";
  negotiate(obs: AgentObservation, signal?: AbortSignal): Promise<Decided<NegotiationDecision>>;
  commit(obs: AgentObservation, signal?: AbortSignal): Promise<Decided<CommitDecision>>;
  vote(obs: AgentObservation, signal?: AbortSignal): Promise<Decided<VoteDecision>>;
}
