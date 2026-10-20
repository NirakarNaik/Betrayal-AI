"use client";

import { motion } from "framer-motion";
import type { RulesetConfig } from "@/game/config";
import type { MatchView } from "@/game/visibility";
import type { WaitingInfo } from "@/server/controller";
import { AgentCard, type AgentActivity } from "./AgentCard";

// Pentagon anchor points (percent of the arena box) for the desktop layout.
const ANCHORS = [
  { x: 50, y: 13 },
  { x: 86, y: 40 },
  { x: 74, y: 84 },
  { x: 26, y: 84 },
  { x: 14, y: 40 },
];

function activityFor(view: MatchView, waiting: WaitingInfo, id: string): AgentActivity {
  const p = view.players.find((x) => x.id === id)!;
  if (!p.alive || view.phase === "complete") return null;
  if (waiting.kind === "agents" && waiting.playerIds.includes(id)) return "thinking";
  if (view.phase === "commitment") return p.hasCommitted ? "committed" : "waiting";
  if (view.phase === "voting") return p.hasVoted ? "voted" : "waiting";
  if (view.phase === "negotiation") return p.doneNegotiating ? "done" : "waiting";
  return null;
}

export function AgentRoster({ view, rules, waiting, center }: { view: MatchView; rules: RulesetConfig; waiting: WaitingInfo; center: React.ReactNode }) {
  const selfId = view.self?.playerId ?? null;
  const pactPartners = new Set(
    view.pacts
      .filter((p) => p.brokenBy === null && p.expiresAfterRound >= view.round && selfId && (p.aId === selfId || p.bId === selfId))
      .map((p) => (p.aId === selfId ? p.bId : p.aId)),
  );
  const showImpacts = view.phase === "reveal" || view.phase === "voting";
  const roundAttacks = showImpacts ? view.events.filter((e) => e.round === view.round && e.type === "ATTACK_RESOLVED") : [];
  const roundTrades = showImpacts ? view.events.filter((e) => e.round === view.round && e.type === "RESOURCE_TRANSFERRED" && e.visibility.scope === "public") : [];
  const hitIds = new Set(roundAttacks.filter((e) => !e.data.blocked).map((e) => e.data.targetId as string));
  const seatIndex = (id: string) => view.players.findIndex((p) => p.id === id);
  const activePacts = view.pacts.filter((p) => p.brokenBy === null && p.expiresAfterRound >= view.round);

  const card = (id: string, compact: boolean) => {
    const p = view.players.find((x) => x.id === id)!;
    return (
      <AgentCard
        player={p}
        caps={rules.caps}
        activity={activityFor(view, waiting, id)}
        isSelf={id === selfId}
        hasPactWithSelf={pactPartners.has(id)}
        highlight={hitIds.has(id) ? "hit" : null}
        compact={compact}
      />
    );
  };

  return (
    <>
      {/* Desktop: pentagon arena with interaction lines */}
      <div className="relative hidden h-[640px] xl:block">
        <div className="afc-grid pointer-events-none absolute inset-0 opacity-60" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points={ANCHORS.map((a) => `${a.x},${a.y}`).join(" ")} fill="none" stroke="#2a2347" strokeWidth="0.25" />
          {activePacts.map((pact) => {
            const a = ANCHORS[seatIndex(pact.aId)];
            const b = ANCHORS[seatIndex(pact.bId)];
            if (!a || !b) return null;
            return <line key={pact.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#34d399" strokeOpacity="0.55" strokeWidth="0.35" strokeDasharray="1 1" />;
          })}
          {roundTrades.map((e) => {
            const a = ANCHORS[seatIndex(e.data.fromId as string)];
            const b = ANCHORS[seatIndex(e.data.toId as string)];
            if (!a || !b) return null;
            return <motion.line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#facc15" strokeWidth="0.4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />;
          })}
          {roundAttacks.map((e, i) => {
            const a = ANCHORS[seatIndex(e.data.attackerId as string)];
            const b = ANCHORS[seatIndex(e.data.targetId as string)];
            if (!a || !b) return null;
            return (
              <motion.line
                key={e.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.data.blocked ? "#22d3ee" : "#f43f5e"}
                strokeWidth="0.6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.15 }}
              />
            );
          })}
        </svg>
        <div className="absolute left-1/2 top-[52%] w-[300px] -translate-x-1/2 -translate-y-1/2">{center}</div>
        {view.players.map((p, i) => (
          <div key={p.id} className="absolute w-[272px] -translate-x-1/2 -translate-y-1/2" style={{ left: `${ANCHORS[i]!.x}%`, top: `${ANCHORS[i]!.y}%` }}>
            {card(p.id, true)}
          </div>
        ))}
      </div>
      {/* Mobile / tablet: stacked */}
      <div className="space-y-3 xl:hidden">
        {center}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">{view.players.map((p) => <div key={p.id}>{card(p.id, false)}</div>)}</div>
      </div>
    </>
  );
}
