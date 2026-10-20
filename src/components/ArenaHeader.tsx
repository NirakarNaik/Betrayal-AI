"use client";

import Link from "next/link";
import type { MatchView } from "@/game/visibility";
import { PHASE_LABEL } from "@/lib/ui";
import { RoundTimeline } from "./RoundTimeline";
import { ConnectionStatus, ModeBadge, type Connection } from "./StatusBits";

export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2" aria-label="Agent Fight Club home">
      <svg width={size === "lg" ? 40 : 26} height={size === "lg" ? 40 : 26} viewBox="0 0 40 40" aria-hidden="true">
        <polygon points="20,2 37,11 37,29 20,38 3,29 3,11" fill="none" stroke="#8b5cf6" strokeWidth="2" />
        <path d="M12 26l8-14 8 14M15 21h10" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="square" />
      </svg>
      <span className={`font-display font-bold uppercase tracking-[0.14em] ${size === "lg" ? "text-xl" : "text-sm"}`}>
        Agent <span className="text-violet-400">Fight</span> Club
      </span>
    </Link>
  );
}

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
  return (
    <header className="panel flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <Logo />
        <span className="hidden h-5 w-px bg-line lg:block" />
        <div>
          <p className="font-display text-xs uppercase tracking-[0.2em] text-ink-faint">Betrayal Protocol</p>
          <p className="font-display text-lg font-bold leading-tight">
            {view.phase === "complete" ? "Match complete" : `Round ${view.round}`}
            <span className="ml-2 text-sm font-semibold text-cyan-300">{view.phase !== "complete" ? PHASE_LABEL[view.phase] : ""}</span>
          </p>
        </div>
      </div>
      <RoundTimeline round={view.round} maxRounds={view.maxRounds} phase={view.phase} votingRounds={view.votingRounds} />
      <div className="flex flex-wrap items-center gap-2">
        <ModeBadge mode={agentMode} />
        <ConnectionStatus state={connection} lastUpdated={lastUpdated} />
        <span className="chip text-ink-faint" title="Match seed">
          seed {view.seed}
        </span>
        {canControl && active && (
          <div className="flex items-center gap-1.5">
            {status === "running" ? (
              <button className="btn px-2.5 py-1.5 text-[11px]" onClick={() => onControl("pause")} title="Pause: in-flight agent decisions finish; no new ones start">
                ❚❚ Pause
              </button>
            ) : (
              <button className="btn btn-cyan px-2.5 py-1.5 text-[11px]" onClick={() => onControl("resume")}>
                ▶ Resume
              </button>
            )}
            <button
              className="btn px-2.5 py-1.5 text-[11px]"
              onClick={() => onControl("speed", speed === "standard" ? "accelerated" : "standard")}
              aria-label={`Playback speed: ${speed}. Click to toggle.`}
            >
              {speed === "standard" ? "1×" : "4×"} speed
            </button>
            <button
              className="btn btn-danger px-2.5 py-1.5 text-[11px]"
              onClick={() => {
                if (confirm("Cancel this match? It will be recorded as cancelled.")) onControl("cancel");
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
