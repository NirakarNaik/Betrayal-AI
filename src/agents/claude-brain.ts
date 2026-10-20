/**
 * Claude-backed agent brain.
 *
 * Pipeline per decision:
 *  1. Route to cheap/strategic model.  2. Request structured JSON via the gateway.
 *  3. Parse + schema-validate.  4. Convert to a discriminated-union proposal.
 *  5. Check legality, target eligibility and resources against the agent's view.
 *  6. Retry at most once with a compact validation error.
 *  7. Otherwise use a deterministic legal fallback (RECOVER / abstain / no messages),
 *     recorded with source "fallback".
 * If the budget guard blocks the request, the labelled heuristic demo brain decides.
 * The model never mutates state: the engine re-validates every proposal.
 */
import { fallbackProposal } from "@/game/legal-actions";
import type { ActionProposal, MessageInput } from "@/game/types";
import type { LlmGateway } from "@/llm/gateway";
import { routeModel } from "@/llm/router";
import type { UsageRecord } from "@/llm/usage";
import { HeuristicBrain } from "./heuristic";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import {
  COMMIT_JSON_SCHEMA,
  extractJson,
  NEGOTIATION_JSON_SCHEMA,
  RawCommitSchema,
  RawNegotiationSchema,
  RawVoteSchema,
  toProposal,
  VOTE_JSON_SCHEMA,
} from "./schema";
import type {
  AgentBrain,
  AgentObservation,
  BeliefUpdate,
  CommitDecision,
  Decided,
  DecisionMeta,
  NegotiationDecision,
  VoteDecision,
} from "./types";

type Purpose = "negotiate" | "commit" | "vote";

/** Check a proposal against the agent's own legal-action list (plus credits it is about to accept). */
export function checkAgainstView(obs: AgentObservation, proposal: ActionProposal, incomingCredits: number): string | null {
  const opt = obs.view.self?.legalActions.find((a) => a.action === proposal.action);
  if (!opt) return `Action ${proposal.action} is not available now`;
  const me = obs.view.players.find((p) => p.id === obs.playerId)!;
  if ("targetId" in proposal) {
    if (proposal.targetId === obs.playerId) return "You cannot target yourself";
    if (!opt.validTargets.includes(proposal.targetId)) return `Invalid target ${proposal.targetId}; valid: ${opt.validTargets.join(",")}`;
  }
  const credits = me.credits + incomingCredits;
  const needCredits = opt.cost.credits + (proposal.action === "trade" ? proposal.amount : 0);
  if (credits < needCredits) return `Needs ${needCredits} credits, you have ${credits}`;
  if (me.intel < opt.cost.intel) return `Needs ${opt.cost.intel} intel, you have ${me.intel}`;
  if (me.influence < opt.cost.influence) return `Needs ${opt.cost.influence} influence, you have ${me.influence}`;
  return null;
}

function cleanBeliefs(obs: AgentObservation, raw: BeliefUpdate[]): BeliefUpdate[] {
  const ids = obs.view.players.map((p) => p.id);
  return raw
    .filter((b) => ids.includes(b.playerId) && b.playerId !== obs.playerId && Number.isFinite(b.trustDelta))
    .slice(0, 4)
    .map((b) => ({ playerId: b.playerId, trustDelta: Math.max(-0.2, Math.min(0.2, b.trustDelta)), note: b.note ? b.note.slice(0, 140) : null }));
}

export class ClaudeBrain implements AgentBrain {
  readonly kind = "claude" as const;
  private demo = new HeuristicBrain();

  constructor(
    private gateway: LlmGateway,
    private ctx: { tournamentId: string | null } = { tournamentId: null },
  ) {}

  private async ask(
    obs: AgentObservation,
    purpose: Purpose,
    schema: Record<string, unknown>,
    correction: string | null,
    signal: AbortSignal | undefined,
  ): Promise<{ text: string | null; records: UsageRecord[]; model: string; escalated: boolean; blocked: boolean; error: string | null }> {
    const status = this.gateway.budget.status(obs.matchId);
    const used = status.matchLimitUsd > 0 ? status.matchSpentUsd / status.matchLimitUsd : 1;
    const route = routeModel(obs, purpose, this.gateway.config, used);
    let user = buildUserPrompt(obs, purpose);
    if (correction) user += `\n\nYOUR PREVIOUS ANSWER WAS INVALID: ${correction}\nReturn a corrected JSON answer.`;
    const res = await this.gateway.request({
      matchId: obs.matchId,
      tournamentId: this.ctx.tournamentId,
      playerId: obs.playerId,
      purpose,
      model: route.model,
      escalated: route.escalated,
      system: buildSystemPrompt(obs.profile, obs.rules),
      user,
      schema,
      maxTokens: route.maxTokens,
      effort: route.effort,
      signal,
    });
    return {
      text: res.ok ? res.text : null,
      records: res.records,
      model: route.model,
      escalated: route.escalated,
      blocked: res.outcome === "budget_blocked",
      error: res.error,
    };
  }

  async negotiate(obs: AgentObservation, signal?: AbortSignal): Promise<Decided<NegotiationDecision>> {
    const r = await this.ask(obs, "negotiate", NEGOTIATION_JSON_SCHEMA, null, signal);
    const meta: DecisionMeta = { source: "model", model: r.model, attempts: 1, errors: [], usage: r.records, escalated: r.escalated };
    if (r.blocked) {
      const d = await this.demo.negotiate(obs);
      return { decision: d.decision, meta: { ...d.meta, usage: r.records, errors: [r.error ?? "budget blocked"] } };
    }
    if (!r.text) {
      return { decision: { messages: [], summary: null, beliefs: [] }, meta: { ...meta, source: "fallback", errors: [r.error ?? "no response"] } };
    }
    try {
      const raw = RawNegotiationSchema.parse(extractJson(r.text));
      const me = obs.view.players.find((p) => p.id === obs.playerId)!;
      const alive = new Set(obs.view.players.filter((p) => p.alive && p.id !== obs.playerId).map((p) => p.id));
      let budget = me.credits;
      const messages: MessageInput[] = [];
      // Repair rather than retry for negotiation (cheap and safe): drop bad recipients,
      // truncate long text, clamp offers to the limit and affordability.
      for (const m of raw.messages.slice(0, obs.view.self?.messagesRemaining ?? 0)) {
        const text = m.text.trim().slice(0, obs.rules.negotiation.maxMessageLength);
        if (!text) continue;
        if (m.toId !== null && !alive.has(m.toId)) {
          meta.errors.push(`dropped message to invalid recipient ${m.toId}`);
          continue;
        }
        const isPrivate = m.toId !== null;
        const offer = isPrivate ? Math.max(0, Math.min(m.offerCredits, obs.rules.negotiation.maxOfferCredits, budget)) : 0;
        budget -= offer;
        messages.push({ toId: m.toId, text, offerCredits: offer, proposePact: isPrivate && m.proposePact });
      }
      return { decision: { messages, summary: raw.decisionSummary.slice(0, 200), beliefs: cleanBeliefs(obs, raw.beliefs) }, meta };
    } catch (e) {
      return {
        decision: { messages: [], summary: null, beliefs: [] },
        meta: { ...meta, source: "fallback", errors: [`invalid negotiation output: ${(e as Error).message.slice(0, 160)}`] },
      };
    }
  }

  async commit(obs: AgentObservation, signal?: AbortSignal): Promise<Decided<CommitDecision>> {
    const errors: string[] = [];
    const usage: UsageRecord[] = [];
    let correction: string | null = null;
    let model: string | null = null;
    let escalated = false;
    const pending = obs.view.self?.pendingOffers ?? [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await this.ask(obs, "commit", COMMIT_JSON_SCHEMA, correction, signal);
      usage.push(...r.records);
      model = r.model;
      escalated = escalated || r.escalated;
      if (r.blocked) {
        const d = await this.demo.commit(obs);
        return { decision: d.decision, meta: { ...d.meta, usage, errors: [...errors, r.error ?? "budget blocked"] } };
      }
      if (!r.text) {
        errors.push(r.error ?? "no response");
        break; // transport failures were already retried by the gateway
      }
      try {
        const raw = RawCommitSchema.parse(extractJson(r.text));
        const conv = toProposal(raw);
        if (!conv.ok) throw new Error(conv.error);
        const offerResponses = pending.map((o) => ({
          messageId: o.id,
          accept: raw.offerResponses.find((x) => x.messageId === o.id)?.accept ?? false,
        }));
        const incoming = pending.filter((o) => offerResponses.find((x) => x.messageId === o.id)?.accept).reduce((s, o) => s + o.offerCredits, 0);
        const illegal = checkAgainstView(obs, conv.proposal, incoming);
        if (illegal) throw new Error(illegal);
        return {
          decision: { offerResponses, proposal: conv.proposal, summary: raw.decisionSummary.slice(0, 200), beliefs: cleanBeliefs(obs, raw.beliefs) },
          meta: { source: "model", model, attempts: attempt, errors, usage, escalated },
        };
      } catch (e) {
        const msg = (e as Error).message.slice(0, 200);
        errors.push(`attempt ${attempt}: ${msg}`);
        correction = msg;
      }
    }
    return {
      decision: {
        offerResponses: pending.map((o) => ({ messageId: o.id, accept: false })),
        proposal: fallbackProposal(),
        summary: null,
        beliefs: [],
      },
      meta: { source: "fallback", model, attempts: 2, errors, usage, escalated },
    };
  }

  async vote(obs: AgentObservation, signal?: AbortSignal): Promise<Decided<VoteDecision>> {
    const errors: string[] = [];
    const usage: UsageRecord[] = [];
    let correction: string | null = null;
    let model: string | null = null;
    let escalated = false;
    const alive = obs.view.players.filter((p) => p.alive).map((p) => p.id);
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await this.ask(obs, "vote", VOTE_JSON_SCHEMA, correction, signal);
      usage.push(...r.records);
      model = r.model;
      escalated = escalated || r.escalated;
      if (r.blocked) {
        const d = await this.demo.vote(obs);
        return { decision: d.decision, meta: { ...d.meta, usage, errors: [...errors, r.error ?? "budget blocked"] } };
      }
      if (!r.text) {
        errors.push(r.error ?? "no response");
        break;
      }
      try {
        const raw = RawVoteSchema.parse(extractJson(r.text));
        if (raw.targetId !== null && !alive.includes(raw.targetId)) {
          throw new Error(`Invalid vote target ${raw.targetId}; choose from ${alive.join(",")} or null`);
        }
        return {
          decision: { targetId: raw.targetId, summary: raw.decisionSummary.slice(0, 200) },
          meta: { source: "model", model, attempts: attempt, errors, usage, escalated },
        };
      } catch (e) {
        const msg = (e as Error).message.slice(0, 200);
        errors.push(`attempt ${attempt}: ${msg}`);
        correction = msg;
      }
    }
    return { decision: { targetId: null, summary: null }, meta: { source: "fallback", model, attempts: 2, errors, usage, escalated } };
  }
}
