"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getRuleset } from "@/game/config";
import type { MatchSetup } from "@/game/initial-state";
import { replayFrames } from "@/game/replay";
import type { EngineInput } from "@/game/types";
import { buildView } from "@/game/visibility";
import { api, PHASE_LABEL } from "@/lib/ui";
import { AgentRoster } from "./AgentRoster";
import { Logo } from "./ArenaHeader";
import { EventFeed } from "./EventFeed";
import { MatchLeaderboard } from "./MatchLeaderboard";
import { NegotiationFeed } from "./NegotiationFeed";
import { RoundReveal } from "./RoundReveal";
import { RoundTimeline } from "./RoundTimeline";
import { ErrorBanner } from "./StatusBits";

interface ReplayData {
  setup: MatchSetup;
  inputs: EngineInput[];
}

/**
 * Replays rebuild every state with the deterministic engine in the browser from
 * the recorded inputs. No model is called; outcomes are identical by construction.
 */
export function ReplayView({ matchId }: { matchId: string }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(false);

  useEffect(() => {
    api<ReplayData>(`/api/matches/${matchId}/replay`).then(setData, (e: Error) => setError(e.message));
  }, [matchId]);

  const frames = useMemo(() => {
    if (!data) return [];
    // Keep frames that produced at least one public-facing event.
    return replayFrames(data).filter((f, idx) => idx === 0 || f.events.length > 0);
  }, [data]);

  useEffect(() => {
    if (!playing) return;
    if (i >= frames.length - 1) {
      const t0 = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(t0);
    }
    const phase = frames[i]?.state.phase;
    const t = setTimeout(() => setI((x) => Math.min(frames.length - 1, x + 1)), (phase === "reveal" ? 2200 : 650) / (fast ? 4 : 1));
    return () => clearTimeout(t);
  }, [playing, i, frames, fast]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6">
        <ErrorBanner message={error} />
        <Link href={`/arena/${matchId}`} className="btn">
          Back to match
        </Link>
      </main>
    );
  }
  if (!data || frames.length === 0) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-dim" role="status">
        Rebuilding replay from recorded inputs…
      </main>
    );
  }

  const frame = frames[Math.min(i, frames.length - 1)]!;
  const view = buildView(frame.state, { kind: "spectator" }, true);
  const rules = getRuleset(view.rulesetId);

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 p-3 sm:p-4">
      <header className="panel flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="chip border-cyan-400/50 text-cyan-300">Replay · no model calls</span>
        </div>
        <RoundTimeline round={view.round} maxRounds={view.maxRounds} phase={view.phase} votingRounds={view.votingRounds} />
        <Link href={`/arena/${matchId}`} className="btn px-3 py-1.5 text-[11px]">
          Exit replay
        </Link>
      </header>
      <section className="panel flex flex-wrap items-center gap-3 px-4 py-3" aria-label="Replay controls">
        <button className="btn px-3 py-1.5" onClick={() => setI(0)} aria-label="Restart">
          ⏮
        </button>
        <button className="btn px-3 py-1.5" onClick={() => setI((x) => Math.max(0, x - 1))} aria-label="Step back">
          ◀
        </button>
        <button className="btn btn-primary px-4 py-1.5" onClick={() => setPlaying((p) => !p)}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button className="btn px-3 py-1.5" onClick={() => setI((x) => Math.min(frames.length - 1, x + 1))} aria-label="Step forward">
          ▶
        </button>
        <button className="btn px-3 py-1.5" onClick={() => setFast((f) => !f)} aria-pressed={fast}>
          {fast ? "4×" : "1×"}
        </button>
        <input type="range" min={0} max={frames.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} className="min-w-40 flex-1 accent-violet-500" aria-label="Replay position" />
        <span className="font-mono text-xs text-ink-dim">
          R{view.round} · {PHASE_LABEL[view.phase]} · step {i + 1}/{frames.length}
        </span>
      </section>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_1fr_340px]">
        <div className="h-[640px]">
          <NegotiationFeed messages={view.messages} players={view.players} selfId={null} round={view.round} omniscient={view.omniscient} />
        </div>
        <div className="relative">
          <AgentRoster view={view} rules={rules} waiting={{ kind: "reveal", playerIds: [], humanDeadline: null }} center={<div className="panel p-4 text-center font-display text-xl text-cyan-200">{PHASE_LABEL[view.phase]}</div>} />
          <RoundReveal view={view} show={view.phase === "reveal"} />
        </div>
        <div className="flex h-[640px] flex-col gap-3">
          <MatchLeaderboard view={view} />
          <div className="min-h-0 flex-1">
            <EventFeed events={view.events} />
          </div>
        </div>
      </div>
    </main>
  );
}
