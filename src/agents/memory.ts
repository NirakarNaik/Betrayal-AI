/**
 * Compact structured agent memory.
 *
 * Observed FACTS are derived by code from events this agent was entitled to
 * see. BELIEFS (trust estimates and notes) are subjective: they are updated by
 * a personality-specific policy and optionally nudged by the agent's own model
 * output. Trust values may be wrong and are never presented as verified facts.
 */
import { canSee } from "@/game/events";
import type { GameEvent, PlayerId } from "@/game/types";
import type { PersonalityProfile } from "./personalities";

export interface AgentMemory {
  playerId: PlayerId;
  lastSeq: number;
  facts: {
    attacksOnMe: { round: number; by: PlayerId; damage: number }[];
    sabotagesOnMe: { round: number; by: PlayerId }[];
    myAttacks: { round: number; target: PlayerId }[];
    trades: { round: number; with: PlayerId; direction: "in" | "out"; amount: number }[];
    pactsFormed: { round: number; with: PlayerId }[];
    brokenPacts: { round: number; betrayer: PlayerId; victim: PlayerId; how: string }[];
    observedVotes: { round: number; voter: PlayerId; target: PlayerId | null }[];
    clues: { round: number; target: PlayerId; text: string }[];
  };
  beliefs: {
    /** Subjective trust in [0, 1]; 0.5 = neutral. */
    trust: Record<PlayerId, number>;
    notes: { round: number; about: PlayerId | null; note: string }[];
  };
  recent: string[];
}

export function createMemory(playerId: PlayerId, others: PlayerId[]): AgentMemory {
  return {
    playerId,
    lastSeq: -1,
    facts: {
      attacksOnMe: [],
      sabotagesOnMe: [],
      myAttacks: [],
      trades: [],
      pactsFormed: [],
      brokenPacts: [],
      observedVotes: [],
      clues: [],
    },
    beliefs: { trust: Object.fromEntries(others.map((o) => [o, 0.5])), notes: [] },
    recent: [],
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function adjust(mem: AgentMemory, id: PlayerId, delta: number): void {
  if (id === mem.playerId) return;
  mem.beliefs.trust[id] = clamp01((mem.beliefs.trust[id] ?? 0.5) + delta);
}

function remember(mem: AgentMemory, policy: PersonalityProfile["memory"], line: string): void {
  mem.recent.push(line);
  if (mem.recent.length > policy.recentLimit) mem.recent.splice(0, mem.recent.length - policy.recentLimit);
}

/** Incorporate newly visible events. Pure with respect to inputs (returns a new memory). */
export function updateMemory(memory: AgentMemory, events: GameEvent[], profile: PersonalityProfile): AgentMemory {
  const mem: AgentMemory = structuredClone(memory);
  const me = mem.playerId;
  const pol = profile.memory;
  for (const e of events) {
    if (e.seq <= mem.lastSeq) continue;
    mem.lastSeq = e.seq;
    if (!canSee(e, me, false)) continue;
    const d = e.data as Record<string, unknown>;
    switch (e.type) {
      case "ATTACK_RESOLVED": {
        const by = d.attackerId as string;
        const target = d.targetId as string;
        if (target === me) {
          mem.facts.attacksOnMe.push({ round: e.round, by, damage: d.damage as number });
          adjust(mem, by, -pol.hostilityPenalty);
          remember(mem, pol, `R${e.round}: ${e.summary}`);
        } else if (by === me) {
          mem.facts.myAttacks.push({ round: e.round, target });
        } else {
          // Aggression elsewhere slightly lowers trust in the aggressor.
          adjust(mem, by, -pol.hostilityPenalty * 0.2);
        }
        break;
      }
      case "SABOTAGE_RESOLVED": {
        const by = d.playerId as string;
        if (d.targetId === me) {
          mem.facts.sabotagesOnMe.push({ round: e.round, by });
          adjust(mem, by, -pol.hostilityPenalty * 0.8);
          remember(mem, pol, `R${e.round}: ${e.summary}`);
        }
        break;
      }
      case "RESOURCE_TRANSFERRED": {
        const amount = d.amount as number;
        if (amount <= 0) break;
        if (d.toId === me) {
          mem.facts.trades.push({ round: e.round, with: d.fromId as string, direction: "in", amount });
          adjust(mem, d.fromId as string, pol.cooperationBonus);
          remember(mem, pol, `R${e.round}: received ${amount} credits from ${d.fromId as string}`);
        } else if (d.fromId === me) {
          mem.facts.trades.push({ round: e.round, with: d.toId as string, direction: "out", amount });
          adjust(mem, d.toId as string, pol.cooperationBonus * 0.5);
        }
        break;
      }
      case "PACT_FORMED": {
        const other = d.aId === me ? (d.bId as string) : (d.aId as string);
        mem.facts.pactsFormed.push({ round: e.round, with: other });
        adjust(mem, other, pol.cooperationBonus);
        remember(mem, pol, `R${e.round}: pact formed with ${other}`);
        break;
      }
      case "PACT_BROKEN": {
        const betrayer = d.betrayerId as string;
        const victim = d.victimId as string;
        mem.facts.brokenPacts.push({ round: e.round, betrayer, victim, how: d.how as string });
        adjust(mem, betrayer, victim === me ? -pol.betrayalPenalty * 2 - pol.hostilityPenalty : -pol.betrayalPenalty);
        remember(mem, pol, `R${e.round}: ${e.summary}`);
        break;
      }
      case "VOTE_RESOLVED": {
        const ballots = (d.ballots as { voterId: string; targetId: string | null }[]) ?? [];
        for (const b of ballots) {
          mem.facts.observedVotes.push({ round: e.round, voter: b.voterId, target: b.targetId });
          if (b.targetId === me && b.voterId !== me) adjust(mem, b.voterId, -pol.hostilityPenalty * 0.6);
        }
        remember(mem, pol, `R${e.round}: ${e.summary}`);
        break;
      }
      case "INVESTIGATION_RESOLVED": {
        if (d.private && d.playerId === me) {
          mem.facts.clues.push({ round: e.round, target: d.targetId as string, text: d.clue as string });
        }
        break;
      }
      case "PLAYER_ELIMINATED":
        remember(mem, pol, `R${e.round}: ${e.summary}`);
        break;
      case "ROUND_COMPLETED": {
        // Trust decays toward neutral according to the personality's memory policy.
        for (const id of Object.keys(mem.beliefs.trust)) {
          const t = mem.beliefs.trust[id]!;
          mem.beliefs.trust[id] = t + (0.5 - t) * pol.trustDecay;
        }
        break;
      }
      default:
        break;
    }
  }
  return mem;
}

/** Apply bounded belief updates proposed by the agent's model output. */
export function applyBeliefUpdates(
  memory: AgentMemory,
  round: number,
  updates: { playerId: PlayerId; trustDelta: number; note: string | null }[],
  validIds: PlayerId[],
): AgentMemory {
  const mem: AgentMemory = structuredClone(memory);
  for (const u of updates.slice(0, 4)) {
    if (!validIds.includes(u.playerId) || u.playerId === mem.playerId) continue;
    const delta = Math.max(-0.2, Math.min(0.2, u.trustDelta));
    adjust(mem, u.playerId, delta);
    if (u.note) {
      mem.beliefs.notes.push({ round, about: u.playerId, note: u.note.slice(0, 140) });
      if (mem.beliefs.notes.length > 8) mem.beliefs.notes.splice(0, mem.beliefs.notes.length - 8);
    }
  }
  return mem;
}

/** Compact text rendering for prompts, separating facts from beliefs. */
export function renderMemory(mem: AgentMemory, nameOf: (id: PlayerId) => string): string {
  const f = mem.facts;
  const lines: string[] = ["OBSERVED FACTS:"];
  if (f.attacksOnMe.length) lines.push(`- Attacked me: ${f.attacksOnMe.map((a) => `${nameOf(a.by)}(R${a.round},${a.damage}dmg)`).join(", ")}`);
  if (f.sabotagesOnMe.length) lines.push(`- Sabotaged me: ${f.sabotagesOnMe.map((a) => `${nameOf(a.by)}(R${a.round})`).join(", ")}`);
  if (f.myAttacks.length) lines.push(`- I attacked: ${f.myAttacks.map((a) => `${nameOf(a.target)}(R${a.round})`).join(", ")}`);
  if (f.trades.length) lines.push(`- Trades: ${f.trades.map((t) => `${t.direction === "in" ? "from" : "to"} ${nameOf(t.with)} ${t.amount}cr(R${t.round})`).join(", ")}`);
  if (f.pactsFormed.length) lines.push(`- My pacts: ${f.pactsFormed.map((p) => `${nameOf(p.with)}(R${p.round})`).join(", ")}`);
  if (f.brokenPacts.length) lines.push(`- Broken pacts: ${f.brokenPacts.map((b) => `${nameOf(b.betrayer)} betrayed ${nameOf(b.victim)} by ${b.how}(R${b.round})`).join("; ")}`);
  if (f.observedVotes.length) {
    lines.push(`- Votes: ${f.observedVotes.map((v) => `${nameOf(v.voter)}→${v.target ? nameOf(v.target) : "abstain"}(R${v.round})`).join(", ")}`);
  }
  if (f.clues.length) lines.push(`- My clues: ${f.clues.map((c) => c.text).join(" | ")}`);
  if (lines.length === 1) lines.push("- Nothing notable yet.");
  lines.push("SUBJECTIVE BELIEFS (may be wrong):");
  lines.push(
    `- Trust: ${Object.entries(mem.beliefs.trust)
      .map(([id, t]) => `${nameOf(id)}=${t.toFixed(2)}`)
      .join(", ")}`,
  );
  for (const n of mem.beliefs.notes.slice(-4)) lines.push(`- Note (R${n.round}${n.about ? `, ${nameOf(n.about)}` : ""}): ${n.note}`);
  return lines.join("\n");
}
