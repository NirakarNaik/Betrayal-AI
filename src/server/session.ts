/**
 * MatchSession: an authoritative match plus its recorded input log, agent
 * memories and decision log. `step()` performs one unit of orchestration work.
 *
 * The session is framework-agnostic (no Next.js, no database) so the same code
 * drives live matches, tournaments and integration tests.
 */
import { applyBeliefUpdates, createMemory, updateMemory, type AgentMemory } from "@/agents/memory";
import { getPersonality } from "@/agents/personalities";
import type { AgentBrain, AgentObservation, DecisionMeta } from "@/agents/types";
import { getRuleset } from "@/game/config";
import { applyInput, isPhaseReady, pendingPlayers } from "@/game/engine";
import { createInitialState, type MatchSetup } from "@/game/initial-state";
import { replayMatch } from "@/game/replay";
import type { EngineInput, EngineResult, GameEvent, MatchState, PlayerId } from "@/game/types";
import { buildView } from "@/game/visibility";
import type { UsageRecord } from "@/llm/usage";

export type SessionStatus = "running" | "paused" | "completed" | "failed" | "cancelled";
export type AgentMode = "live" | "demo";

export interface DecisionLogEntry {
  round: number;
  phase: "negotiation" | "commitment" | "voting";
  playerId: PlayerId;
  source: DecisionMeta["source"];
  model: string | null;
  escalated: boolean;
  attempts: number;
  errors: string[];
  /** Agent statement about its own reasoning. Unverified; never a game fact. */
  summary: string | null;
  costUsd: number;
  at: number;
}

export interface SessionSnapshot {
  id: string;
  setup: MatchSetup;
  inputs: EngineInput[];
  status: SessionStatus;
  agentMode: AgentMode;
  speed: "standard" | "accelerated";
  memories: Record<PlayerId, AgentMemory>;
  decisions: DecisionLogEntry[];
  usage: UsageRecord[];
  humanTokenHash: string | null;
  tournamentId: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  phaseStartedAt: number;
  version: number;
}

export type StepOutcome =
  | { kind: "progress"; detail: string }
  | { kind: "waiting_human"; playerId: PlayerId }
  | { kind: "complete" };

export class MatchSession {
  state: MatchState;
  snap: SessionSnapshot;

  private constructor(snap: SessionSnapshot, state: MatchState) {
    this.snap = snap;
    this.state = state;
  }

  static create(args: {
    setup: MatchSetup;
    agentMode: AgentMode;
    speed: "standard" | "accelerated";
    humanTokenHash: string | null;
    tournamentId: string | null;
    now: number;
  }): MatchSession {
    const { state } = createInitialState(args.setup);
    const memories: Record<PlayerId, AgentMemory> = {};
    for (const p of state.players) {
      if (p.kind === "ai") memories[p.id] = createMemory(p.id, state.players.filter((o) => o.id !== p.id).map((o) => o.id));
    }
    return new MatchSession(
      {
        id: args.setup.id,
        setup: args.setup,
        inputs: [],
        status: "running",
        agentMode: args.agentMode,
        speed: args.speed,
        memories,
        decisions: [],
        usage: [],
        humanTokenHash: args.humanTokenHash,
        tournamentId: args.tournamentId,
        error: null,
        createdAt: args.now,
        updatedAt: args.now,
        phaseStartedAt: args.now,
        version: 0,
      },
      state,
    );
  }

  /** Rebuild from a persisted snapshot by replaying the recorded inputs (no model calls). */
  static restore(snap: SessionSnapshot): MatchSession {
    return new MatchSession(snap, replayMatch({ setup: snap.setup, inputs: snap.inputs }));
  }

  get id(): string {
    return this.snap.id;
  }

  /** Apply an engine input; record it if it changed state (including logged rejections). */
  apply(input: EngineInput): EngineResult {
    const before = this.state;
    const res = applyInput(before, input);
    if (res.state !== before) {
      const phaseBefore = before.phase;
      this.state = res.state;
      this.snap.inputs.push(input);
      this.snap.updatedAt = input.at;
      if (res.state.phase !== phaseBefore) this.snap.phaseStartedAt = input.at;
      if (res.state.phase === "complete" && this.snap.status === "running") this.snap.status = "completed";
    }
    return res;
  }

  observation(playerId: PlayerId): AgentObservation {
    const p = this.state.players.find((x) => x.id === playerId)!;
    const profile = getPersonality(p.personalityId!);
    // Memory ingests only events visible to this agent (enforced in updateMemory).
    const mem = updateMemory(this.snap.memories[playerId]!, this.state.events, profile);
    this.snap.memories[playerId] = mem;
    return {
      matchId: this.state.id,
      seed: this.state.seed,
      playerId,
      view: buildView(this.state, { kind: "player", playerId }, false),
      memory: mem,
      profile,
      rules: getRuleset(this.state.rulesetId),
    };
  }

  private log(playerId: PlayerId, phase: DecisionLogEntry["phase"], meta: DecisionMeta, summary: string | null, at: number): void {
    this.snap.usage.push(...meta.usage);
    this.snap.decisions.push({
      round: this.state.round,
      phase,
      playerId,
      source: meta.source,
      model: meta.model,
      escalated: meta.escalated,
      attempts: meta.attempts,
      errors: meta.errors,
      summary,
      costUsd: meta.usage.reduce((s, u) => s + u.estimatedCostUsd, 0),
      at,
    });
  }

  private aiPending(): PlayerId[] {
    const pending = new Set(pendingPlayers(this.state));
    return this.state.players.filter((p) => p.kind === "ai" && pending.has(p.id)).map((p) => p.id);
  }

  private humanPending(): PlayerId | null {
    const pending = new Set(pendingPlayers(this.state));
    return this.state.players.find((p) => p.kind === "human" && pending.has(p.id))?.id ?? null;
  }

  /** Negotiation speaking order rotates each round so no seat always speaks first. */
  private negotiationOrder(ids: PlayerId[]): PlayerId[] {
    const seats = this.state.players.length;
    const shift = (this.state.round - 1) % seats;
    const seatOf = (id: PlayerId) => this.state.players.find((p) => p.id === id)!.seat;
    return [...ids].sort((a, b) => ((seatOf(a) - shift + seats) % seats) - ((seatOf(b) - shift + seats) % seats));
  }

  /**
   * One unit of work. `brains` maps AI player ids to their brain.
   * `forceHumanTimeout` advances past a human who has exceeded the turn timer.
   */
  async step(
    brains: Record<PlayerId, AgentBrain>,
    opts: { now: () => number; signal?: AbortSignal; forceHumanTimeout?: boolean },
  ): Promise<StepOutcome> {
    const s = this.state;
    if (s.phase === "complete") return { kind: "complete" };
    const now = opts.now;

    if (s.phase === "reveal" || s.phase === "resolution") {
      this.apply({ kind: "advance", at: now() });
      return { kind: "progress", detail: "advanced from reveal" };
    }

    if (isPhaseReady(s)) {
      this.apply({ kind: "advance", at: now() });
      return { kind: "progress", detail: `advanced from ${s.phase}` };
    }

    const ai = this.aiPending();
    if (s.phase === "negotiation" && ai.length > 0) {
      const id = this.negotiationOrder(ai)[0]!;
      const obs = this.observation(id);
      const { decision, meta } = await brains[id]!.negotiate(obs, opts.signal);
      if (opts.signal?.aborted) return { kind: "progress", detail: "aborted" };
      for (const m of decision.messages) {
        const r = this.apply({ kind: "message", playerId: id, message: m, at: now() });
        if (!r.ok) meta.errors.push(`message rejected: ${r.error}`);
      }
      if (decision.beliefs.length) {
        this.snap.memories[id] = applyBeliefUpdates(this.snap.memories[id]!, s.round, decision.beliefs, s.players.map((p) => p.id));
      }
      this.log(id, "negotiation", meta, decision.summary, now());
      this.apply({ kind: "end_negotiation", playerId: id, at: now() });
      return { kind: "progress", detail: `${id} negotiated` };
    }

    if (s.phase === "commitment" && ai.length > 0) {
      const decided = await Promise.all(
        ai.map(async (id) => {
          const obs = this.observation(id);
          return { id, ...(await brains[id]!.commit(obs, opts.signal)) };
        }),
      );
      if (opts.signal?.aborted) return { kind: "progress", detail: "aborted" };
      // Apply in seat order for determinism.
      const seatOf = (id: PlayerId) => this.state.players.find((p) => p.id === id)!.seat;
      decided.sort((a, b) => seatOf(a.id) - seatOf(b.id));
      for (const d of decided) {
        for (const r of d.decision.offerResponses) {
          const res = this.apply({ kind: "respond_offer", playerId: d.id, messageId: r.messageId, accept: r.accept, at: now() });
          if (!res.ok) d.meta.errors.push(`offer response rejected: ${res.error}`);
        }
        const source = d.meta.source === "fallback" ? "fallback" : d.meta.source === "heuristic" ? "heuristic" : "model";
        const res = this.apply({ kind: "commit", playerId: d.id, proposal: d.decision.proposal, source, decisionSummary: d.decision.summary, at: now() });
        if (!res.ok) {
          d.meta.errors.push(`engine rejected: ${res.error}`);
          this.apply({ kind: "commit", playerId: d.id, proposal: { action: "recover" }, source: "fallback", decisionSummary: null, at: now() });
        }
        if (d.decision.beliefs.length) {
          this.snap.memories[d.id] = applyBeliefUpdates(this.snap.memories[d.id]!, this.state.round, d.decision.beliefs, this.state.players.map((p) => p.id));
        }
        this.log(d.id, "commitment", d.meta, d.decision.summary, now());
      }
      return { kind: "progress", detail: "AI commitments collected" };
    }

    if (s.phase === "voting" && ai.length > 0) {
      const decided = await Promise.all(
        ai.map(async (id) => ({ id, ...(await brains[id]!.vote(this.observation(id), opts.signal)) })),
      );
      if (opts.signal?.aborted) return { kind: "progress", detail: "aborted" };
      const seatOf = (id: PlayerId) => this.state.players.find((p) => p.id === id)!.seat;
      decided.sort((a, b) => seatOf(a.id) - seatOf(b.id));
      for (const d of decided) {
        const res = this.apply({ kind: "vote", playerId: d.id, targetId: d.decision.targetId, at: now() });
        if (!res.ok) {
          d.meta.errors.push(`vote rejected: ${res.error}`);
          this.apply({ kind: "vote", playerId: d.id, targetId: null, at: now() });
        }
        this.log(d.id, "voting", d.meta, d.decision.summary, now());
      }
      return { kind: "progress", detail: "AI votes collected" };
    }

    const human = this.humanPending();
    if (human) {
      if (opts.forceHumanTimeout) {
        this.apply({ kind: "advance", at: now(), force: true });
        return { kind: "progress", detail: "human turn timed out" };
      }
      return { kind: "waiting_human", playerId: human };
    }
    // Should be unreachable: nothing pending but phase not ready.
    this.apply({ kind: "advance", at: now(), force: true });
    return { kind: "progress", detail: "forced advance" };
  }

  /** Run to completion without delays (tests, tournaments, accelerated batch). */
  async runToCompletion(brains: Record<PlayerId, AgentBrain>, opts: { now: () => number; signal?: AbortSignal; maxSteps?: number }): Promise<void> {
    const max = opts.maxSteps ?? 500;
    for (let i = 0; i < max; i++) {
      if (opts.signal?.aborted) return;
      const r = await this.step(brains, { ...opts, forceHumanTimeout: true });
      if (r.kind === "complete") return;
    }
    throw new Error(`Match ${this.id} did not finish within ${max} steps`);
  }

  newEventsSince(seq: number): GameEvent[] {
    return this.state.events.filter((e) => e.seq > seq);
  }
}
