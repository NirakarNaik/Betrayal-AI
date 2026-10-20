"use client";

import { motion, useAnimationControls } from "framer-motion";
import { useEffect, useRef } from "react";
import type { RulesetConfig } from "@/game/config";
import type { PlayerView } from "@/game/visibility";
import { personality, playerColor } from "@/lib/ui";
import { AgentAvatar } from "./AgentAvatar";
import { ResourceBar } from "./ResourceBar";

export type AgentActivity = "thinking" | "committed" | "voted" | "waiting" | "done" | null;

export function AgentCard({
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
  const prof = personality(player.personalityId);
  const controls = useAnimationControls();
  const prevHealth = useRef(player.health);
  useEffect(() => {
    if (player.health < prevHealth.current) {
      void controls.start({ x: [0, -7, 6, -4, 3, 0], transition: { duration: 0.45 } });
    }
    prevHealth.current = player.health;
  }, [player.health, controls]);

  const activityLabel: Record<NonNullable<AgentActivity>, string> = {
    thinking: "Deciding…",
    committed: "Locked in",
    voted: "Vote sealed",
    waiting: "Waiting",
    done: "Ready",
  };

  return (
    <motion.article
      animate={controls}
      layout
      className={`panel relative overflow-hidden ${compact ? "p-2.5" : "p-3"} ${player.alive ? "" : "opacity-60"}`}
      style={{
        borderColor: highlight === "hit" ? "#f43f5e" : isSelf ? "#e2e8f0" : undefined,
        boxShadow: player.alive ? `inset 0 1px 0 0 ${color}33` : undefined,
      }}
      aria-label={`${player.name}${player.alive ? "" : " (eliminated)"}`}
    >
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: player.alive ? color : "#3b3263" }} />
      {highlight === "hit" && (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-rose-500/20"
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
        />
      )}
      <div className="flex items-start gap-2.5">
        <AgentAvatar personalityId={player.personalityId} color={color} size={compact ? 40 : 50} eliminated={!player.alive} label={`${player.name} avatar`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-display text-sm font-bold tracking-wide" style={{ color }}>
              {player.name}
            </h3>
            {isSelf && <span className="chip border-slate-300/60 text-slate-200">You</span>}
            {hasPactWithSelf && <span className="chip border-emerald-400/50 text-emerald-300">Pact</span>}
          </div>
          <p className="truncate text-[11px] text-ink-faint">
            {player.kind === "human" ? "Human challenger" : prof?.title}
            <span className="ml-1 font-mono text-ink-faint/70">#{player.id}</span>
          </p>
          {!player.alive ? (
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-rose-400">
              Eliminated R{player.eliminatedRound} · {player.eliminationCause === "vote" ? "voted out" : "destroyed"}
            </p>
          ) : (
            activity && (
              <p className={`mt-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider ${activity === "thinking" ? "text-cyan-300" : "text-ink-dim"}`}>
                {activity === "thinking" && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />}
                {activityLabel[activity]}
              </p>
            )
          )}
        </div>
      </div>
      {player.alive && (
        <div className={`mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 ${compact ? "" : "sm:grid-cols-4 lg:grid-cols-2"}`}>
          <ResourceBar label="Health" value={player.health} max={caps.health} color="#f43f5e" />
          <ResourceBar label="Credits" value={player.credits} max={caps.credits} color="#facc15" segments={false} suffix={player.escrow ? ` (+${player.escrow})` : undefined} />
          <ResourceBar label="Intel" value={player.intel} max={caps.intel} color="#22d3ee" />
          <ResourceBar label="Influence" value={player.influence} max={caps.influence} color="#a78bfa" />
        </div>
      )}
      {player.objective && !compact && (
        <div className="mt-2 rounded-[3px] border border-dashed border-line-strong/80 bg-abyss/60 px-2 py-1.5 text-[11px]">
          <span className="font-mono uppercase tracking-wider text-violet-300">Secret · {player.objective.title}</span>
          {player.objectiveProgress && <span className="ml-1 text-ink-faint">— {player.objectiveProgress.detail}</span>}
        </div>
      )}
    </motion.article>
  );
}
