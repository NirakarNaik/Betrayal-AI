/** Browser-safe display helpers. Never import server modules here. */
import { PUBLIC_PERSONALITIES } from "@/agents/personalities-public";
import type { ActionProposal, ActionType, GameEvent, Phase, PersonalityId } from "@/game/types";
import type { PlayerView } from "@/game/visibility";

export const HUMAN_COLOR = "#e2e8f0";

export function playerColor(p: Pick<PlayerView, "personalityId" | "kind">): string {
  if (p.kind === "human" || !p.personalityId) return HUMAN_COLOR;
  return PUBLIC_PERSONALITIES[p.personalityId].color;
}

export function personality(id: PersonalityId | null) {
  return id ? PUBLIC_PERSONALITIES[id] : null;
}

export const PHASE_LABEL: Record<Phase, string> = {
  negotiation: "Negotiation",
  commitment: "Secret Commitment",
  resolution: "Resolution",
  reveal: "Reveal",
  voting: "Elimination Vote",
  complete: "Match Complete",
};

export const ACTION_META: Record<ActionType, { label: string; short: string; tone: string; blurb: string }> = {
  strike: { label: "Strike", short: "STK", tone: "#f43f5e", blurb: "Deal 1 damage to a target." },
  guard: { label: "Guard", short: "GRD", tone: "#22d3ee", blurb: "Absorb the first point of damage this round." },
  scout: { label: "Scout", short: "SCT", tone: "#a78bfa", blurb: "Gain 1 intel." },
  investigate: { label: "Investigate", short: "INV", tone: "#c084fc", blurb: "Private clue about a target's secret objective." },
  sabotage: { label: "Sabotage", short: "SAB", tone: "#fb923c", blurb: "Drain up to 2 credits from a target." },
  trade: { label: "Trade", short: "TRD", tone: "#34d399", blurb: "Give credits to another player." },
  mediate: { label: "Mediate", short: "MED", tone: "#38bdf8", blurb: "Gain influence if a verified agreement exists this round." },
  recover: { label: "Recover", short: "RCV", tone: "#facc15", blurb: "Gain 2 credits. Free." },
};

export function describeProposal(p: ActionProposal, nameOf: (id: string) => string): string {
  const m = ACTION_META[p.action].label.toUpperCase();
  if (p.action === "trade") return `${m} ${p.amount}cr → ${nameOf(p.targetId)}`;
  if ("targetId" in p) return `${m} → ${nameOf(p.targetId)}`;
  return m;
}

export type EventTone = "danger" | "cyan" | "violet" | "ok" | "warn" | "muted";

export function eventTone(e: GameEvent): EventTone {
  switch (e.type) {
    case "ATTACK_RESOLVED":
    case "PLAYER_ELIMINATED":
    case "PACT_BROKEN":
    case "SABOTAGE_RESOLVED":
      return "danger";
    case "GUARD_TRIGGERED":
    case "SCOUT_RESOLVED":
    case "INVESTIGATION_RESOLVED":
      return "cyan";
    case "VOTE_RESOLVED":
    case "MATCH_COMPLETED":
    case "OBJECTIVE_COMPLETED":
      return "violet";
    case "RESOURCE_TRANSFERRED":
    case "RECOVER_RESOLVED":
    case "PACT_FORMED":
    case "OFFER_ACCEPTED":
    case "MEDIATION_RESOLVED":
      return "ok";
    case "ACTION_FIZZLED":
    case "ACTION_REJECTED":
    case "ACTION_FALLBACK":
    case "OFFER_DECLINED":
    case "OFFER_EXPIRED":
      return "warn";
    default:
      return "muted";
  }
}

export const TONE_CLASS: Record<EventTone, string> = {
  danger: "text-rose-300 border-rose-500/50",
  cyan: "text-cyan-200 border-cyan-400/40",
  violet: "text-violet-200 border-violet-400/50",
  ok: "text-emerald-200 border-emerald-400/40",
  warn: "text-amber-200 border-amber-400/40",
  muted: "text-ink-dim border-line",
};

export function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] } & T;
  if (!res.ok) throw new Error(body.error ? `${body.error}${body.issues ? `: ${body.issues.join("; ")}` : ""}` : `Request failed (${res.status})`);
  return body;
}
