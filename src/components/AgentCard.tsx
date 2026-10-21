"use client";

import { motion, useAnimationControls } from "framer-motion";
import { memo, useEffect, useRef } from "react";
import type { RulesetConfig } from "@/game/config";
import type { PlayerView } from "@/game/visibility";
import { playerColor } from "@/lib/ui";
import { AgentAvatar } from "./AgentAvatar";
import { ResourceBar } from "./ResourceBar";

export type AgentActivity = "thinking" | "committed" | "voted" | "waiting" | "done" | null;

const ACTIVITY_LABEL: Record<NonNullable<AgentActivity>, string> = {
  thinking: "Deciding",
  committed: "Locked",
  voted: "Sealed",
  waiting: "Waiting",
  done: "Ready",
};

/** Player plate: name bar, big health pips, compact resource meters. */
export const AgentCard = memo(function AgentCard({
  player,
  caps,
  activity,
  isSelf,
  hasPactWithSelf,
  highlight,
  compact = false,
}: {
  player: PlayerView;
  caps: RulesetConfig["caps"];
  activity: AgentActivity;
  isSelf: boolean;
  hasPactWithSelf: boolean;
  highlight: "hit" | "blocked" | null;
  compact?: boolean;
}) {
  const color = playerColor(player);
    const controls = useAnimationControls();
  const prevHealth = useRef(player.health);
  useEffect(() => {
    if (player.health < prevHealth.current) {
      void controls.start({ x: [0, -8, 7, -4, 3, 0], transition: { duration: 0.45 } });
    }
    prevHealth.current = player.health;
  }, [player.health, controls]);

  return (
    <motion.article
      animate={controls}
      className={`relative overflow-hidden border bg-surface ${player.alive ? "" : "opacity-55"}`}
      style={{ borderColor: highlight === "hit" ? "var(--color-danger)" : isSelf ? "#e8e6ef" : "var(--color-line)" }}
      aria-label={`${player.name}${player.alive ? "" : " (eliminated)"}`}
      data-testid={`agent-card-${player.id}`}
    >
      {highlight === "hit" && (
        <motion.div className="pointer-events-none absolute inset-0 z-10 bg-danger/25" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.3 }} />
      )}
      {/* Name bar */}
      <div className="flex items-center gap-2.5 border-b border-line pr-2.5" style={{ background: `linear-gradient(90deg, ${color}26, transparent 70%)` }}>
        <div className="w-1 self-stretch" style={{ background: player.alive ? color : "var(--color-line-strong)" }} />
        <div className="py-1.5">
          <AgentAvatar personalityId={player.personalityId} color={color} size={compact ? 34 : 40} eliminated={!player.alive} label={`${player.name} emblem`} />
        </div>
        <div className="min-w-0 flex-1 py-1.5">
          <h3 className="display truncate text-[23px] leading-none" style={{ color: player.alive ? color : undefined }}>
            {player.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-2 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            <span>seat {player.seat + 1}{player.kind === "human" ? " · human" : ""}</span>
            {player.alive && activity && (
              <span className={`flex items-center gap-1 ${activity === "thinking" ? "text-cyan" : activity === "committed" || activity === "voted" ? "text-ink" : ""}`}>
                {activity === "thinking" && <span className="h-1.5 w-1.5 animate-pulse bg-cyan" />}
                {(activity === "committed" || activity === "voted") && <span className="h-1.5 w-1.5 bg-ink" />}
                {ACTIVITY_LABEL[activity]}
              </span>
            )}
          </p>
        </div>
        {(isSelf || hasPactWithSelf) && (
          <div className="flex flex-col items-end gap-1">
            {isSelf && <span className="chip border-ink text-ink">you</span>}
            {hasPactWithSelf && <span className="chip border-ok/60 text-ok">pact</span>}
          </div>
        )}
      </div>

      {!player.alive ? (
        <div className="relative px-3 py-3">
          <div className="hazard absolute inset-x-0 top-0 h-1 opacity-70" />
          <p className="display text-xl text-danger">Eliminated</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            round {player.eliminatedRound} · {player.eliminationCause === "vote" ? "voted out" : "destroyed"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2.5">
          <div aria-label={`Health ${player.health} of ${caps.health}`}>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">HP</p>
            <div className="mt-1 flex gap-1">
              {Array.from({ length: caps.health }, (_, i) => (
                <span key={i} className="block h-6 w-3 transition-colors duration-300" style={{ clipPath: "polygon(0 0, 100% 0, 100% 80%, 70% 100%, 0 100%)", backgroundColor: i < player.health ? "#ff3b5c" : "#2a2536" }} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1">
            <ResourceBar label="CR" value={player.credits} max={caps.credits} color="#f5c542" segments={false} suffix={player.escrow ? `+${player.escrow}` : undefined} />
            <ResourceBar label="INT" value={player.intel} max={caps.intel} color="#2dd4e6" />
            <ResourceBar label="INF" value={player.influence} max={caps.influence} color="#b49cff" />
          </div>
        </div>
      )}

      {player.objective && !compact && (
        <div className="border-t border-dashed border-line-strong px-3 py-1.5 text-[11px]">
          <span className="font-mono uppercase tracking-[0.1em] text-violet-bright">secret · {player.objective.title}</span>
          {player.objectiveProgress && <span className="ml-1 text-ink-faint">— {player.objectiveProgress.detail}</span>}
        </div>
      )}
      {player.objective && compact && (
        <div className="border-t border-dashed border-line-strong px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-violet-bright" title={player.objectiveProgress?.detail}>
          secret · {player.objective.title}
          {player.objectiveProgress?.status === "completed" ? " ✓" : ""}
        </div>
      )}
    </motion.article>
  );
});
