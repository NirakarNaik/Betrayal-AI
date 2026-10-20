"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PUBLIC_PERSONALITIES } from "@/agents/personalities-public";
import { api, fmtUsd, pct } from "@/lib/ui";
import type { TournamentAggregate, TournamentRecord } from "@/server/tournament-types";
import { AgentAvatar } from "./AgentAvatar";
import { Logo } from "./ArenaHeader";
import { ErrorBanner } from "./StatusBits";

const STATUS_STYLE: Record<string, string> = {
  completed: "border-emerald-400/50 text-emerald-300",
  failed: "border-rose-500/60 text-rose-300",
  cancelled: "border-line-strong text-ink-faint",
  running: "border-cyan-400/60 text-cyan-300",
  pending: "border-line text-ink-faint",
};

export function TournamentDashboard({ id }: { id: string }) {
  const [data, setData] = useState<{ record: TournamentRecord; aggregate: TournamentAggregate } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/tournaments/${id}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    const t0 = setTimeout(() => void load(), 0);
    const t = setInterval(() => {
      if (data?.record.status === "running" || !data) void load();
    }, 2000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [load, data]);

  async function cancel() {
    try {
      await api(`/api/tournaments/${id}/cancel`, { method: "POST" });
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) {
    return <main className="flex min-h-dvh items-center justify-center p-6">{error ? <ErrorBanner message={error} /> : <p className="text-ink-dim">Loading tournament…</p>}</main>;
  }
  const { record: t, aggregate: a } = data;
  const done = a.completed + a.failed + a.cancelled;
  const sorted = [...a.byPersonality].sort((x, y) => y.avgPoints - x.avgPoints);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <nav className="flex items-center justify-between">
        <Logo />
        <Link href="/tournaments" className="font-display text-xs uppercase tracking-widest text-ink-dim hover:text-ink">
          ← Tournament Lab
        </Link>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">{t.config.name}</h1>
          <p className="font-mono text-[11px] text-ink-faint">
            {t.config.agentMode} agents · {t.config.rulesetId} · seeds {t.config.seedStart}–{t.config.seedStart + t.config.matchCount - 1} · seats {t.config.rotateSeats ? "rotated" : "fixed"}
            {t.metadata.modelCheap && ` · ${t.metadata.modelCheap} / ${t.metadata.modelStrategic} (escalate ≥ ${t.metadata.escalationThreshold})`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${STATUS_STYLE[t.status] ?? ""}`}>{t.status}</span>
          {t.status === "running" && (
            <button className="btn btn-danger px-3 py-1.5 text-[11px]" onClick={() => void cancel()}>
              Cancel remaining
            </button>
          )}
        </div>
      </header>
      <ErrorBanner message={error ?? t.error} />

      <section className="panel p-4" aria-label="Progress">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="panel-title">Progress</h2>
          <p className="font-mono text-xs text-ink-dim">
            {a.completed} completed · {a.failed} failed · {a.cancelled} cancelled · {a.running} running · {a.pending} pending
          </p>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden bg-line" role="progressbar" aria-valuenow={done} aria-valuemax={t.config.matchCount}>
          <div className="bg-emerald-400" style={{ width: `${(a.completed / t.config.matchCount) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(a.failed / t.config.matchCount) * 100}%` }} />
          <div className="bg-ink-faint" style={{ width: `${(a.cancelled / t.config.matchCount) * 100}%` }} />
          <div className="animate-pulse bg-cyan-400" style={{ width: `${(a.running / t.config.matchCount) * 100}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Cost so far {fmtUsd(a.totalCostUsd)} (estimated){a.completed ? ` · avg ${fmtUsd(a.avgCostPerMatchUsd)} and ${a.avgCallsPerMatch.toFixed(0)} calls per completed match` : ""}. Failed and cancelled matches are excluded from
          every statistic below. {t.metadata.failurePolicy}
        </p>
      </section>

      <section className="panel overflow-x-auto p-4" aria-label="Aggregate standings">
        <h2 className="panel-title">Aggregate standings</h2>
        {a.completed === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">No completed matches yet.</p>
        ) : (
          <>
            <table className="mt-3 w-full min-w-[920px] text-left text-[13px]">
              <thead className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                <tr>
                  <th className="pb-2">Agent</th>
                  <th className="pb-2 text-right">n</th>
                  <th className="pb-2 text-right">Win rate (95% CI)</th>
                  <th className="pb-2 text-right">Avg place</th>
                  <th className="pb-2 text-right">Avg pts</th>
                  <th className="pb-2 text-right">Survival</th>
                  <th className="pb-2 text-right">Objective</th>
                  <th className="pb-2 text-right">Avg credits</th>
                  <th className="pb-2 text-right">Dmg dealt / taken</th>
                  <th className="pb-2 text-right">Strikes/rd</th>
                  <th className="pb-2 text-right">Betrayals/m</th>
                  <th className="pb-2 text-right">Alliance success</th>
                  <th className="pb-2 text-right">Invalid rate</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const prof = PUBLIC_PERSONALITIES[p.personalityId];
                  return (
                    <tr key={p.personalityId} className="border-t border-line font-mono">
                      <td className="py-2 font-sans">
                        <span className="flex items-center gap-2 font-display font-semibold" style={{ color: prof.color }}>
                          <AgentAvatar personalityId={p.personalityId} color={prof.color} size={22} label="" />
                          {prof.name}
                        </span>
                      </td>
                      <td className="py-2 text-right text-ink-faint">{p.n}</td>
                      <td className="py-2 text-right">
                        {pct(p.winRate)} <span className="text-[10px] text-ink-faint">({pct(p.winRateCI[0])}–{pct(p.winRateCI[1])})</span>
                      </td>
                      <td className="py-2 text-right">
                        {p.avgPlacement.toFixed(2)} <span className="text-[10px] text-ink-faint">±{p.placementSE.toFixed(2)}</span>
                      </td>
                      <td className="py-2 text-right text-violet-300">{p.avgPoints.toFixed(2)}</td>
                      <td className="py-2 text-right">{pct(p.survivalRate)}</td>
                      <td className="py-2 text-right">{pct(p.objectiveRate)}</td>
                      <td className="py-2 text-right">{p.avgCredits.toFixed(1)}</td>
                      <td className="py-2 text-right">
                        {p.avgDamageDealt.toFixed(1)} / {p.avgDamageReceived.toFixed(1)}
                      </td>
                      <td className="py-2 text-right">{p.attackFrequency.toFixed(2)}</td>
                      <td className="py-2 text-right">{p.betrayalsPerMatch.toFixed(2)}</td>
                      <td className="py-2 text-right">{p.allianceSuccessRate === null ? "—" : pct(p.allianceSuccessRate)}</td>
                      <td className="py-2 text-right">{pct(p.invalidActionRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-ink-faint">
              {a.completed < 30 ? `Only ${a.completed} completed match${a.completed === 1 ? "" : "es"}: differences are likely within noise — check the confidence intervals before drawing conclusions. ` : ""}
              Betrayal = striking, sabotaging or voting against an active pact partner (PACT_BROKEN). Alliance success = share of joined pacts never broken. Invalid rate = (rejected + fallback actions) per round
              alive.
            </p>
          </>
        )}
      </section>

      <section className="panel overflow-x-auto p-4" aria-label="Matches">
        <h2 className="panel-title">Matches</h2>
        <table className="mt-3 w-full min-w-[640px] text-left text-[13px]">
          <thead className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            <tr>
              <th className="pb-2">#</th>
              <th className="pb-2">Seed</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Winner</th>
              <th className="pb-2">Ending</th>
              <th className="pb-2 text-right">Calls / cost</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {t.matches.map((m, i) => {
              const winner = m.players.find((p) => p.place === 1);
              return (
                <tr key={`${m.matchId}-${i}`} className="border-t border-line">
                  <td className="py-1.5 font-mono text-ink-faint">{i + 1}</td>
                  <td className="py-1.5 font-mono">{m.seed}</td>
                  <td className="py-1.5">
                    <span className={`chip ${STATUS_STYLE[m.status] ?? ""}`}>{m.status}</span>
                    {m.attempts > 1 && <span className="ml-1 font-mono text-[10px] text-amber-300">retry</span>}
                  </td>
                  <td className="py-1.5 font-display" style={{ color: winner ? PUBLIC_PERSONALITIES[winner.personalityId].color : undefined }}>
                    {m.status === "completed" && winner ? PUBLIC_PERSONALITIES[winner.personalityId].name : "—"}
                  </td>
                  <td className="py-1.5 text-xs text-ink-dim">{m.error ? <span className="text-rose-300">{m.error}</span> : (m.terminal?.reason.replaceAll("_", " ") ?? "")}</td>
                  <td className="py-1.5 text-right font-mono text-xs">
                    {m.usage.calls} / {fmtUsd(m.usage.costUsd)}
                  </td>
                  <td className="py-1.5 text-right">
                    {(m.status === "completed" || m.status === "failed" || m.status === "cancelled") && m.matchId.startsWith("tm_") && (
                      <span className="flex justify-end gap-2 text-xs">
                        <Link className="text-cyan-300 hover:underline" href={`/arena/${m.matchId}`}>
                          Details
                        </Link>
                        {m.status === "completed" && (
                          <Link className="text-violet-300 hover:underline" href={`/arena/${m.matchId}/replay`}>
                            Replay
                          </Link>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
