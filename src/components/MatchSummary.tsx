"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { MatchView } from "@/game/visibility";
import type { DecisionLogEntry } from "@/server/session";
import { personality, playerColor } from "@/lib/ui";
import { AgentAvatar } from "./AgentAvatar";

export function MatchSummary({ view, decisions, status }: { view: MatchView; decisions: DecisionLogEntry[]; status: string }) {
  const t = view.terminal;
  if (!t) return null;
  const winner = t.winnerId ? view.players.find((p) => p.id === t.winnerId) : null;
  const fallbacks = decisions.filter((d) => d.source === "fallback").length;
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel overflow-hidden" aria-label="Match summary">
      <div className="relative border-b border-line p-5 pl-7">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: winner ? playerColor(winner) : "var(--color-line-strong)" }} />
        <p className="panel-title text-violet-300">{status === "cancelled" ? "Match cancelled" : status === "failed" ? "Match failed" : "Protocol complete"}</p>
        {winner ? (
          <div className="mt-3 flex items-center gap-4">
            <AgentAvatar personalityId={winner.personalityId} color={playerColor(winner)} size={72} label={`${winner.name} avatar`} />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">Winner</p>
              <h2 className="display text-3xl text-glow-violet" style={{ color: playerColor(winner) }}>
                {winner.name}
              </h2>
              <p className="text-sm text-ink-dim">
                {winner.kind === "human" ? "Human challenger" : personality(winner.personalityId)?.title} · {t.reason.replaceAll("_", " ")} · round {t.round}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-dim">No winner recorded ({t.reason.replaceAll("_", " ")}).</p>
        )}
      </div>
      {t.placements.length > 0 && (
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="pb-2">#</th>
                <th className="pb-2">Player</th>
                <th className="pb-2">Secret objective</th>
                <th className="pb-2 text-right">Score</th>
                <th className="pb-2 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {t.placements.map((pl) => {
                const p = view.players.find((x) => x.id === pl.playerId)!;
                return (
                  <tr key={pl.playerId} className="border-t border-line">
                    <td className="py-2 font-mono text-ink-faint">{pl.place}</td>
                    <td className="py-2 font-semibold" style={{ color: playerColor(p) }}>
                      {p.name} {!p.alive && <span className="ml-1 font-mono text-[10px] text-rose-400">out R{p.eliminatedRound}</span>}
                    </td>
                    <td className="py-2 text-xs text-ink-dim">
                      {p.objective ? (
                        <>
                          <span className={pl.objectiveCompleted ? "text-emerald-300" : "text-ink-faint"}>{pl.objectiveCompleted ? "★ " : "✗ "}</span>
                          {p.objective.title}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">{pl.protocolScore}</td>
                    <td className="py-2 text-right font-mono text-violet-300">{pl.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-ink-faint">
            Winner and placements computed by the deterministic engine (survival → protocol score → credits → health → seeded tie-break). {fallbacks > 0 ? `${fallbacks} decision(s) used the deterministic fallback.` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/arena/${view.id}/replay`} className="btn btn-cyan">
              <span aria-hidden="true">▶</span> Watch replay
            </Link>
            <Link href="/arena/new" className="btn btn-primary">
              New match
            </Link>
          </div>
        </div>
      )}
    </motion.section>
  );
}
