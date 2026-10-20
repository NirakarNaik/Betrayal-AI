"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getRuleset } from "@/game/config";
import { api, PHASE_LABEL, playerColor } from "@/lib/ui";
import { useArena } from "@/lib/use-arena";
import { AgentRoster } from "./AgentRoster";
import { ArenaHeader } from "./ArenaHeader";
import { EventFeed } from "./EventFeed";
import { CommitDock, PrivateMessagePanel, VotePanel } from "./HumanControls";
import { MatchLeaderboard } from "./MatchLeaderboard";
import { MatchSummary } from "./MatchSummary";
import { NegotiationFeed } from "./NegotiationFeed";
import { RoundReveal } from "./RoundReveal";
import { RulesPanel } from "./RulesPanel";
import { ErrorBanner, UsageMeter } from "./StatusBits";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function ArenaView({ matchId }: { matchId: string }) {
  const [omniscient, setOmniscient] = useState(true);
  const { data, connection, error, setError, lastUpdated, refresh } = useArena(matchId, omniscient);
  const [busy, setBusy] = useState(false);
  const [revealDismissed, setRevealDismissed] = useState<string | null>(null);
  const now = useNow(Boolean(data?.waiting.humanDeadline));

  if (!data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-7xl flex-col items-center justify-center gap-4 p-6">
        {error ? (
          <>
            <ErrorBanner message={error} />
            <Link href="/arena/new" className="btn btn-primary">
              Start a new match
            </Link>
          </>
        ) : (
          <div className="flex items-center gap-3 text-ink-dim" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" /> Connecting to the arena…
          </div>
        )}
      </main>
    );
  }

  const { view, waiting } = data;
  const rules = getRuleset(view.rulesetId);
  const isParticipant = view.self !== null;
  const me = isParticipant ? view.players.find((p) => p.id === view.self!.playerId)! : null;
  const canControl = view.mode === "spectator" || isParticipant;
  const revealKey = `${view.round}-${view.phase}`;

  async function send(body: unknown): Promise<boolean> {
    setBusy(true);
    try {
      await api(`/api/matches/${matchId}/action`, { method: "POST", body: JSON.stringify(body) });
      refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function control(op: "pause" | "resume" | "cancel" | "speed", speed?: "standard" | "accelerated") {
    try {
      await api(`/api/matches/${matchId}/control`, { method: "POST", body: JSON.stringify({ op, speed }) });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const waitingText = (() => {
    const names = (ids: string[]) => ids.map((id) => view.players.find((p) => p.id === id)?.name ?? id).join(", ");
    switch (waiting.kind) {
      case "agents":
        return `${names(waiting.playerIds)} ${waiting.playerIds.length > 1 ? "are" : "is"} deciding${data.agentMode === "live" ? " (Claude)" : " (demo agent)"}…`;
      case "human":
        return isParticipant ? "Your move." : `Waiting for ${names(waiting.playerIds)}…`;
      case "reveal":
        return "Resolving and revealing actions…";
      case "paused":
        return "Match paused. In-flight decisions were applied; no new decisions will start.";
      case "complete":
        return "The protocol has concluded.";
      case "error":
        return "The match failed and was stopped. Completed rounds are preserved.";
      default:
        return "Processing…";
    }
  })();
  const deadline = waiting.humanDeadline ? Math.max(0, Math.round((waiting.humanDeadline - now) / 1000)) : null;
  const latestStatements = data.decisions.filter((d) => d.summary && d.round === view.round).slice(-4);

  const center = (
    <div className="panel scanline relative overflow-hidden p-4 text-center">
      <p className="panel-title">{view.phase === "complete" ? "Final" : `Round ${view.round} / ${view.maxRounds}`}</p>
      <p className="mt-1 font-display text-2xl font-bold text-glow-cyan text-cyan-200">{PHASE_LABEL[view.phase]}</p>
      <p className="mt-2 text-sm text-ink-dim" aria-live="polite">
        {waiting.kind === "agents" && <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-300" />}
        {waitingText}
      </p>
      {deadline !== null && (
        <p className={`mt-1 font-mono text-xs ${deadline < 30 ? "text-rose-300" : "text-ink-faint"}`}>
          Turn timer {Math.floor(deadline / 60)}:{String(deadline % 60).padStart(2, "0")} — then defaults apply
        </p>
      )}
      {view.phase !== "complete" && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {view.players.filter((p) => p.alive).length} alive · {view.phase === "commitment" ? `${view.players.filter((p) => p.hasCommitted).length} locked` : view.phase === "voting" ? `${view.players.filter((p) => p.hasVoted).length} sealed` : ""}
        </p>
      )}
      {latestStatements.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-line pt-2 text-left">
          <p className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">Agent reasoning · self-reported, unverified</p>
          {latestStatements.map((d, i) => {
            const p = view.players.find((x) => x.id === d.playerId);
            return (
              <p key={`${d.at}-${i}`} className="truncate text-[11px] text-ink-dim" title={d.summary ?? ""}>
                <span className="font-semibold" style={{ color: p ? playerColor(p) : undefined }}>
                  {p?.name}:
                </span>{" "}
                {d.summary}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 p-3 sm:p-4">
      <ArenaHeader view={view} agentMode={data.agentMode} connection={connection} lastUpdated={lastUpdated} status={data.status} speed={data.speed} canControl={canControl} onControl={control} />
      <ErrorBanner message={error ?? (data.error ? `Match error: ${data.error}` : null)} onDismiss={error ? () => setError(null) : undefined} />
      {view.mode === "spectator" && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-dim">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={omniscient} onChange={(e) => setOmniscient(e.target.checked)} className="accent-violet-500" />
            Director&apos;s view — show secret objectives, private messages and agent reasoning
          </label>
          <span className="text-ink-faint">(only available in all-AI matches; filtered on the server)</span>
        </div>
      )}
      {view.mode === "human" && !isParticipant && (
        <p className="text-xs text-amber-200/80">You are spectating a human match. Private information is hidden until the match ends.</p>
      )}

      {view.phase === "complete" && <MatchSummary view={view} decisions={data.decisions} status={data.status} />}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,340px)_1fr] 2xl:grid-cols-[340px_1fr_340px]">
        <div className="order-2 flex flex-col gap-3 lg:order-1 lg:h-[calc(100dvh-170px)] lg:min-h-[560px]">
          <NegotiationFeed messages={view.messages} players={view.players} selfId={view.self?.playerId ?? null} round={view.round} omniscient={view.omniscient} />
        </div>

        <div className="order-1 space-y-3 lg:order-2">
          <div className="relative">
            <AgentRoster view={view} rules={rules} waiting={waiting} center={center} />
            <RoundReveal view={view} show={(view.phase === "reveal" || view.phase === "resolution") && revealDismissed !== revealKey} />
            {(view.phase === "reveal" || view.phase === "resolution") && revealDismissed !== revealKey && (
              <button className="absolute right-2 top-2 z-30 chip bg-surface text-ink-dim" onClick={() => setRevealDismissed(revealKey)}>
                Hide reveal
              </button>
            )}
          </div>

          <AnimatePresence>
            {isParticipant && me && view.phase !== "complete" && (
              <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="panel border-slate-300/30 p-4" aria-label="Your controls">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="panel-title text-slate-200">Your turn · {PHASE_LABEL[view.phase]}</h2>
                  {me.objective && (
                    <span className="text-xs text-violet-200">
                      Secret objective: <b>{me.objective.title}</b> — {me.objective.description}
                    </span>
                  )}
                </div>
                {!me.alive ? (
                  <p className="text-sm text-rose-300">You have been eliminated. You can keep watching until the match ends.</p>
                ) : data.status === "paused" ? (
                  <p className="text-sm text-ink-dim">The match is paused. Resume to continue.</p>
                ) : view.phase === "negotiation" ? (
                  <PrivateMessagePanel view={view} rules={rules} send={send} busy={busy} />
                ) : view.phase === "commitment" ? (
                  <CommitDock key={`commit-${view.round}`} view={view} send={send} busy={busy} />
                ) : view.phase === "voting" ? (
                  <VotePanel key={`vote-${view.round}`} view={view} send={send} busy={busy} />
                ) : (
                  <p className="text-sm text-ink-dim">Actions are resolving. Results appear in the reveal.</p>
                )}
                {me.clues && me.clues.length > 0 && (
                  <div className="mt-3 border-t border-line pt-2">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-cyan-300">Your private clues</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-dim">
                      {me.clues.map((c, i) => (
                        <li key={i}>
                          R{c.round}: {c.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.section>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:hidden">
            <MatchLeaderboard view={view} />
            <UsageMeter usage={data.usage} agentMode={data.agentMode} />
            <div className="h-[420px] md:col-span-2">
              <EventFeed events={view.events} />
            </div>
            <div className="md:col-span-2">
              <RulesPanel rulesetId={view.rulesetId} />
            </div>
          </div>
        </div>

        <div className="order-3 hidden flex-col gap-3 2xl:flex 2xl:h-[calc(100dvh-170px)] 2xl:min-h-[560px]">
          <MatchLeaderboard view={view} />
          <div className="min-h-0 flex-1">
            <EventFeed events={view.events} />
          </div>
          <UsageMeter usage={data.usage} agentMode={data.agentMode} />
          <RulesPanel rulesetId={view.rulesetId} />
        </div>
      </div>
    </main>
  );
}
