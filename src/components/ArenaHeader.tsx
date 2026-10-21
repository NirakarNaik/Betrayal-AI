"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MatchView } from "@/game/visibility";
import { PHASE_LABEL } from "@/lib/ui";
import { RoundTimeline } from "./RoundTimeline";
import { ConnectionStatus, ModeBadge, type Connection } from "./StatusBits";

export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="Agent Fight Club home">
      <svg width={lg ? 36 : 26} height={lg ? 36 : 26} viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 2h20l4 4v20l-4 4H6l-4-4V6z" fill="#8b5cf6" />
        <path d="M9.5 23 16 8l6.5 15M12 18h8" stroke="#08070c" strokeWidth="3" fill="none" strokeLinecap="square" />
      </svg>
      <span className={`display leading-none ${lg ? "text-3xl" : "text-[22px]"}`}>
        Agent Fight Club
      </span>
    </Link>
  );
}

/** Broadcast "scorebug" header. */
export function ArenaHeader({
  view,
  agentMode,
  connection,
  lastUpdated,
  status,
  speed,
  canControl,
  onControl,
}: {
  view: MatchView;
  agentMode: "live" | "demo";
  connection: Connection;
  lastUpdated: number | null;
  status: string;
  speed: "standard" | "accelerated";
  canControl: boolean;
  onControl: (op: "pause" | "resume" | "cancel" | "speed", speed?: "standard" | "accelerated") => void;
}) {
  const active = status === "running" || status === "paused";
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    if (!confirmCancel) return;
    const t = setTimeout(() => setConfirmCancel(false), 5000);
    return () => clearTimeout(t);
  }, [confirmCancel]);
  const alive = view.players.filter((p) => p.alive).length;
  return (
    <header className="border border-line bg-surface">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="flex items-center gap-4 border-b border-line px-4 py-3 lg:border-b-0 lg:border-r">
          <Logo />
        </div>
        <div className="flex items-stretch">
          <div className="flex flex-col justify-center bg-violet px-4 py-2 text-white">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] opacity-80">Round</span>
            <span className="display text-4xl leading-none">
              {view.phase === "complete" ? (status === "completed" ? "FT" : view.round) : view.round}
              <span className="text-xl opacity-60">/{view.maxRounds}</span>
            </span>
          </div>
          <div className="flex flex-col justify-center border-r border-line px-4 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">Phase</span>
            <span className={`display text-2xl leading-none ${status === "cancelled" || status === "failed" ? "text-danger" : "text-cyan"}`}>{status === "cancelled" ? "Cancelled" : status === "failed" ? "Failed" : PHASE_LABEL[view.phase]}</span>
          </div>
          <div className="hidden flex-col justify-center border-r border-line px-4 py-2 sm:flex">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">Alive</span>
            <span className="display text-2xl leading-none">{alive}</span>
          </div>
        </div>
        <div className="flex flex-1 items-center px-4 py-2.5">
          <RoundTimeline round={view.round} maxRounds={view.maxRounds} phase={view.phase} votingRounds={view.votingRounds} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 lg:border-l lg:border-t-0">
          <ModeBadge mode={agentMode} />
          <ConnectionStatus state={connection} lastUpdated={lastUpdated} />
          <span className="chip text-ink-faint" title="Match seed">
            seed {view.seed}
          </span>
          {canControl && active && (
            <div className="flex items-center gap-1.5">
              {status === "running" ? (
                <button className="btn px-3 py-1.5 text-sm" onClick={() => onControl("pause")} title="Pause: in-flight agent decisions finish; no new ones start">
                  Pause
                </button>
              ) : (
                <button className="btn btn-cyan px-3 py-1.5 text-sm" onClick={() => onControl("resume")}>
                  Resume
                </button>
              )}
              <button className="btn px-3 py-1.5 text-sm" onClick={() => onControl("speed", speed === "standard" ? "accelerated" : "standard")} aria-label={`Playback speed: ${speed}. Click to toggle.`}>
                {speed === "standard" ? "1×" : "4×"}
              </button>
              {confirmCancel ? (
                <button className="btn btn-danger px-3 py-1.5 text-sm" style={{ background: "var(--color-danger)", color: "#fff" }} onClick={() => onControl("cancel")} title="The match will be recorded as cancelled">
                  Confirm cancel
                </button>
              ) : (
                <button className="btn btn-danger px-3 py-1.5 text-sm" onClick={() => setConfirmCancel(true)}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
