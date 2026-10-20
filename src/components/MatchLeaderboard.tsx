"use client";

import { motion } from "framer-motion";
import type { MatchView } from "@/game/visibility";
import { playerColor } from "@/lib/ui";

/**
 * Live standings. While the match runs, ordering uses public information only
 * (alive, health, credits); final placements come from the engine's terminal state.
 */
export function MatchLeaderboard({ view }: { view: MatchView }) {
  const final = view.terminal?.placements ?? null;
  const rows = final
    ? final.map((pl) => ({ p: view.players.find((x) => x.id === pl.playerId)!, place: pl.place, points: pl.points, score: pl.protocolScore, obj: pl.objectiveCompleted }))
    : [...view.players]
        .sort((a, b) => Number(b.alive) - Number(a.alive) || (b.eliminatedRound ?? 99) - (a.eliminatedRound ?? 99) || b.health - a.health || b.credits - a.credits)
        .map((p, i) => ({ p, place: i + 1, points: null as number | null, score: null as number | null, obj: null as boolean | null }));
  return (
    <section className="panel p-3" aria-label="Standings">
      <div className="flex items-baseline justify-between">
        <h2 className="panel-title">{final ? "Final placements" : "Standings"}</h2>
        {!final && <span className="font-mono text-[10px] text-ink-faint">public info only</span>}
      </div>
      <ol className="mt-2 space-y-1">
        {rows.map((r) => (
          <motion.li layout key={r.p.id} className="flex items-center gap-2 bg-surface-2/60 px-2 py-1.5 text-sm">
            <span className="w-5 font-mono text-xs text-ink-faint">{r.place}</span>
            <span className="h-2 w-2 rounded-full" style={{ background: playerColor(r.p) }} />
            <span className={`flex-1 truncate font-display font-semibold ${r.p.alive ? "" : "text-ink-faint line-through"}`}>{r.p.name}</span>
            {r.score !== null ? (
              <span className="font-mono text-[11px] text-ink-dim" title="Protocol score / placement points">
                {r.obj ? "★ " : ""}
                {r.score} ps · <span className="text-violet-300">{r.points} pts</span>
              </span>
            ) : (
              <span className="font-mono text-[11px] text-ink-dim">
                {r.p.alive ? `${r.p.health}♥ ${r.p.credits}cr` : `out R${r.p.eliminatedRound}`}
              </span>
            )}
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
