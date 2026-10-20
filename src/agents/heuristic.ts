/**
 * Heuristic agent brain — the explicitly labelled LOCAL DEMO agent.
 *
 * Makes no API calls. Decisions are a deterministic function of the agent's
 * filtered observation, its personality weights, its memory, and a PRNG seeded
 * from (match seed, player, round, phase). Used for:
 *  - local demo mode when no Anthropic credentials are configured,
 *  - deterministic mock agents in tests,
 *  - fallback decisions when the budget kill switch has tripped.
 * Its dialogue comes from short code templates and is labelled as demo output.
 */
import { hashString, nextFloat, type Rng } from "@/game/random";
import type { ActionProposal, LegalActionOption, MessageInput, PlayerId } from "@/game/types";
import type { PlayerView } from "@/game/visibility";
import type {
  AgentBrain,
  AgentObservation,
  CommitDecision,
  Decided,
  DecisionMeta,
  NegotiationDecision,
  VoteDecision,
} from "./types";

function rngFor(obs: AgentObservation, salt: string): Rng {
  return { state: hashString(`${obs.seed}:${obs.playerId}:${obs.view.round}:${salt}`) || 1 };
}

const meta = (): DecisionMeta => ({ source: "heuristic", model: null, attempts: 1, errors: [], usage: [], escalated: false });

function others(obs: AgentObservation): PlayerView[] {
  return obs.view.players.filter((p) => p.alive && p.id !== obs.playerId);
}

function me(obs: AgentObservation): PlayerView {
  return obs.view.players.find((p) => p.id === obs.playerId)!;
}

function trust(obs: AgentObservation, id: PlayerId): number {
  return obs.memory.beliefs.trust[id] ?? 0.5;
}

function hasActivePact(obs: AgentObservation, id: PlayerId): boolean {
  return obs.view.pacts.some(
    (p) =>
      p.brokenBy === null &&
      p.expiresAfterRound >= obs.view.round &&
      ((p.aId === obs.playerId && p.bId === id) || (p.bId === obs.playerId && p.aId === id)),
  );
}

function threat(p: PlayerView): number {
  return p.health * 2 + p.credits * 0.5 + p.influence + p.intel * 0.3;
}

/** Choose a target according to the personality's preference and memory. */
function chooseTarget(obs: AgentObservation, candidates: PlayerView[], rng: Rng, hostile: boolean): PlayerView | null {
  if (candidates.length === 0) return null;
  const pref = obs.profile.targetPreference;
  const obj = me(obs).objective;
  const scored = candidates.map((c) => {
    let s = 0;
    if (pref === "weakest") s = 10 - c.health * 2 - c.credits * 0.2;
    else if (pref === "strongest" || pref === "threat") s = threat(c);
    else if (pref === "richest") s = c.credits;
    else s = (1 - trust(obs, c.id)) * 10;
    if (hostile) {
      s += (1 - trust(obs, c.id)) * 4;
      if (obj?.kind === "nemesis" && obj.rivalId === c.id) s += 8;
      if (hasActivePact(obs, c.id)) s -= nextFloat(rng) < obs.profile.opportunism * 0.5 ? 0 : 20;
    } else {
      s = trust(obs, c.id) * 10 + (hasActivePact(obs, c.id) ? 3 : 0);
    }
    s += nextFloat(rng) * 2 * obs.profile.riskTolerance;
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s || a.c.seat - b.c.seat);
  return scored[0]!.c;
}

const LINES: Record<string, string[]> = {
  chessmaster: ["Patience wins this table. I have no quarrel with anyone who has none with me.", "Think three rounds ahead before you swing."],
  snake: ["Friends, let's keep this civil. Nobody needs to get hurt.", "I'm only here to survive, same as all of you."],
  politician: ["A coalition of the reasonable can carry this vote.", "Let's agree on who the real threat is before round's end."],
  chaos_gremlin: ["I might strike. I might not. Isn't that exciting?", "Someone's going to have a very bad round."],
  quant: ["The numbers favor cooperation this round.", "Credits spent on strikes are credits not compounding."],
};

export class HeuristicBrain implements AgentBrain {
  readonly kind = "heuristic" as const;

  async negotiate(obs: AgentObservation): Promise<Decided<NegotiationDecision>> {
    const rng = rngFor(obs, "neg");
    const self = me(obs);
    const messages: MessageInput[] = [];
    const lines = LINES[obs.profile.id] ?? ["..."];
    if (nextFloat(rng) < 0.6) {
      messages.push({ toId: null, text: lines[Math.floor(nextFloat(rng) * lines.length)]!, offerCredits: 0, proposePact: false });
    }
    const wantsDeal = nextFloat(rng) < obs.profile.diplomacy || self.objective?.kind === "dealmaker" || self.objective?.kind === "influencer";
    if (wantsDeal) {
      const partner = chooseTarget(obs, others(obs), rng, false);
      if (partner) {
        const max = Math.min(obs.rules.negotiation.maxOfferCredits, self.credits - 3);
        const credits = self.objective?.kind === "dealmaker" ? Math.max(1, Math.min(2, max)) : max >= 2 && nextFloat(rng) < 0.5 ? 1 : 0;
        messages.push({
          toId: partner.id,
          text: credits > 0 ? `Here's ${credits} credits as good faith. Non-aggression for two rounds?` : "Non-aggression for two rounds? We both last longer.",
          offerCredits: Math.max(0, credits),
          proposePact: true,
        });
      }
    }
    return {
      decision: { messages: messages.slice(0, obs.view.self?.messagesRemaining ?? 2), summary: "Demo heuristic negotiation.", beliefs: [] },
      meta: meta(),
    };
  }

  async commit(obs: AgentObservation): Promise<Decided<CommitDecision>> {
    const rng = rngFor(obs, "commit");
    const self = me(obs);
    const obj = self.objective;
    const offerResponses = (obs.view.self?.pendingOffers ?? []).map((m) => ({
      messageId: m.id,
      accept: m.offerCredits > 0 || trust(obs, m.fromId) >= 0.35 || obs.profile.opportunism > 0.6,
    }));
    // Credits arriving from accepted offers are available at resolution.
    const incoming = (obs.view.self?.pendingOffers ?? [])
      .filter((m) => offerResponses.find((r) => r.messageId === m.id)?.accept)
      .reduce((s, m) => s + m.offerCredits, 0);
    const credits = self.credits + incoming;
    const legal = obs.view.self?.legalActions ?? [];
    const opts = legal.filter((o) => o.affordable || (o.action !== "trade" && credits >= o.cost.credits && self.intel >= o.cost.intel && self.influence >= o.cost.influence));
    const w = { ...obs.profile.actionWeights };
    const lowHealth = self.health <= 1;
    if (lowHealth) w.guard *= 2.2;
    if (credits <= 3) w.recover *= 2;
    if (credits >= obs.rules.caps.credits - 2) w.recover *= 0.2;
    if (self.intel < obs.rules.effects.investigateIntelCost) w.scout *= 1.3;
    const acceptedPartners = obs.view.messages
      .filter((m) => m.round === obs.view.round && (m.offerStatus === "accepted" || offerResponses.some((r) => r.messageId === m.id && r.accept)))
      .map((m) => (m.fromId === obs.playerId ? m.toId : m.fromId))
      .filter((id): id is string => Boolean(id));
    if (acceptedPartners.length === 0) w.mediate = 0;
    switch (obj?.kind) {
      case "pacifist":
        w.strike = 0;
        break;
      case "hoarder":
        w.recover *= 1.8;
        w.strike *= 0.5;
        w.trade *= 0.1;
        break;
      case "iron_wall":
        w.guard *= 1.8;
        break;
      case "spymaster":
        w.investigate *= 2.2;
        w.scout *= 1.5;
        break;
      case "dealmaker":
        w.trade *= 2;
        break;
      case "influencer":
        w.mediate *= 2.5;
        break;
      case "nemesis":
        w.strike *= 1.6;
        w.sabotage *= 1.2;
        break;
      default:
        break;
    }
    if (obs.view.round === 1) w.strike *= 0.6 + obs.profile.riskTolerance * 0.4;

    let best: { option: LegalActionOption; score: number } | null = null;
    for (const option of opts) {
      const score = (w[option.action] ?? 0) * (0.75 + nextFloat(rng) * 0.5 * (0.5 + obs.profile.riskTolerance));
      if (score > 0 && (!best || score > best.score)) best = { option, score };
    }
    const candidates = others(obs);
    let proposal: ActionProposal = { action: "recover" };
    if (best) {
      const a = best.option.action;
      if (a === "strike" || a === "sabotage" || a === "investigate") {
        const pool = a === "investigate" ? candidates.filter((c) => !(self.clues ?? []).some((cl) => cl.targetId === c.id && cl.tier !== "category")) : candidates;
        const t = chooseTarget(obs, pool.length ? pool : candidates, rng, a !== "investigate");
        if (t) proposal = { action: a, targetId: t.id };
      } else if (a === "trade") {
        const t = chooseTarget(obs, candidates, rng, false);
        if (t && self.credits >= 1) proposal = { action: "trade", targetId: t.id, amount: 1 };
      } else if (a === "mediate") {
        const t = acceptedPartners[0];
        if (t) proposal = { action: "mediate", targetId: t };
      } else {
        proposal = { action: a };
      }
    }
    return {
      decision: { offerResponses, proposal, summary: `Demo heuristic chose ${proposal.action.toUpperCase()}.`, beliefs: [] },
      meta: meta(),
    };
  }

  async vote(obs: AgentObservation): Promise<Decided<VoteDecision>> {
    const rng = rngFor(obs, "vote");
    const self = me(obs);
    const obj = self.objective;
    let target: PlayerView | null;
    const pool = others(obs);
    if (obj?.kind === "nemesis" && obj.rivalId && pool.some((p) => p.id === obj.rivalId)) {
      target = pool.find((p) => p.id === obj.rivalId)!;
    } else if (obj?.kind === "clean_hands_voter") {
      // Vote for whoever looks most likely to fall: lowest health, then least trusted.
      target = [...pool].sort((a, b) => a.health - b.health || trust(obs, a.id) - trust(obs, b.id) || a.seat - b.seat)[0] ?? null;
    } else {
      target = chooseTarget(obs, pool, rng, true);
    }
    const abstain = nextFloat(rng) < 0.1 * (1 - obs.profile.riskTolerance);
    return {
      decision: { targetId: abstain ? null : (target?.id ?? null), summary: "Demo heuristic vote." },
      meta: meta(),
    };
  }
}
