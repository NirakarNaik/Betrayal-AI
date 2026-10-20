"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { GameEvent } from "@/game/types";
import type { MatchView } from "@/game/visibility";
import { ACTION_META, eventTone, playerColor, TONE_CLASS } from "@/lib/ui";
import type { ActionType } from "@/game/types";

const IMPACT = new Set([
  "ATTACK_RESOLVED",
  "GUARD_TRIGGERED",
  "SABOTAGE_RESOLVED",
  "RESOURCE_TRANSFERRED",
  "MEDIATION_RESOLVED",
  "PLAYER_ELIMINATED",
  "PACT_BROKEN",
  "ACTION_FIZZLED",
  "VOTE_RESOLVED",
]);

/**
 * Round reveal overlay shown during the REVEAL phase (and briefly after a vote).
 * Content comes exclusively from resolved engine events.
 */
export function RoundReveal({ view, show }: { view: MatchView; show: boolean }) {
  const round = view.round;
  const revealed = view.events.filter((e) => e.round === round && e.type === "ACTION_REVEALED");
  const impacts = view.events.filter((e) => e.round === round && IMPACT.has(e.type) && e.visibility.scope === "public");
  const nameOf = (id: string) => view.players.find((p) => p.id === id);
  return (
    <AnimatePresence>
      {show && revealed.length > 0 && (
        <motion.div
          key={`reveal-${round}-${view.phase}`}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-20 flex items-center justify-center bg-void/80 p-3 backdrop-blur-[2px]"
          role="dialog"
          aria-label={`Round ${round} reveal`}
        >
          <div className="panel scanline w-full max-w-xl p-4">
            <p className="panel-title text-cyan-300">Round {round} · Reveal</p>
            <ul className="mt-3 space-y-1.5">
              {revealed.map((e: GameEvent, i) => {
                const actor = nameOf(e.data.playerId as string);
                const target = e.data.targetId ? nameOf(e.data.targetId as string) : null;
                const action = e.data.action as ActionType;
                return (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.18 }}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="w-28 truncate font-display font-bold" style={{ color: actor ? playerColor(actor) : undefined }}>
                      {actor?.name}
                    </span>
                    <span className="rounded-[2px] px-1.5 py-0.5 font-mono text-[11px] font-bold" style={{ background: `${ACTION_META[action].tone}22`, color: ACTION_META[action].tone }}>
                      {ACTION_META[action].label.toUpperCase()}
                      {e.data.amount ? ` ${String(e.data.amount)}cr` : ""}
                    </span>
                    {target && (
                      <>
                        <span className="text-ink-faint">→</span>
                        <span className="truncate font-display" style={{ color: playerColor(target) }}>
                          {target.name}
                        </span>
                      </>
                    )}
                    {e.data.source === "fallback" && <span className="chip border-amber-400/50 text-amber-300">fallback</span>}
                  </motion.li>
                );
              })}
            </ul>
            {impacts.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-2.5">
                {impacts.map((e, i) => (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 + revealed.length * 0.18 + i * 0.12 }}
                    className={`border-l-2 pl-2 text-[12.5px] ${TONE_CLASS[eventTone(e)]} ${e.type === "PLAYER_ELIMINATED" ? "font-bold" : ""}`}
                  >
                    {e.summary}
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
