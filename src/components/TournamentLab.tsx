"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PERSONALITY_IDS, PUBLIC_PERSONALITIES } from "@/agents/personalities-public";
import { api, fmtUsd } from "@/lib/ui";
import type { MatchEstimate } from "@/llm/estimate";
import { AgentAvatar } from "./AgentAvatar";
import { Logo } from "./ArenaHeader";
import { ErrorBanner, ModeBadge } from "./StatusBits";

interface Status {
  liveMode: boolean;
  models: { cheap: string; strategic: string } | null;
  budget: { globalSpentUsd: number; globalLimitUsd: number; killSwitch: boolean } | null;
  rulesets: { id: string; name: string; maxRounds: number }[];
  estimates: Record<string, { spectator: MatchEstimate }>;
  tournamentLimits: { live: number; demo: number };
}

interface ListItem {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  agentMode: "live" | "demo";
  matchCount: number;
  completed: number;
  failed: number;
}

export function TournamentLab() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [list, setList] = useState<ListItem[] | null>(null);
  const [name, setName] = useState("");
  const [count, setCount] = useState(10);
  const [seedStart, setSeedStart] = useState("");
  const [rulesetId, setRulesetId] = useState("standard-v1");
  const [rotate, setRotate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Status>("/api/status").then(setStatus, (e: Error) => setError(e.message));
    api<{ tournaments: ListItem[] }>("/api/tournaments").then((r) => setList(r.tournaments), (e: Error) => setError(e.message));
  }, []);

  const limit = status ? (status.liveMode ? status.tournamentLimits.live : status.tournamentLimits.demo) : 10;
  const est = status?.estimates[rulesetId]?.spectator;
  const estCost = status?.liveMode && est ? est.approxCostUsd.high * count : 0;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/tournaments", {
        method: "POST",
        body: JSON.stringify({ name: name || undefined, matchCount: count, seedStart: seedStart === "" ? null : Number(seedStart), rulesetId, rotateSeats: rotate }),
      });
      router.push(`/tournaments/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <nav className="flex items-center justify-between">
        <Logo />
        {status && <ModeBadge mode={status.liveMode ? "live" : "demo"} />}
      </nav>
      <h1 className="mt-8 display text-3xl">Tournament Lab</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-dim">
        Run batches of all-AI matches under identical rules with rotating seats and reproducible seeds, then compare personalities. Small samples are noisy — every statistic shows its sample size.
      </p>
      <div className="mt-4">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </div>

      <section className="panel mt-6 p-5" aria-label="Create tournament">
        <h2 className="panel-title">New tournament</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-ink-dim">Name</span>
            <input className="input mt-1" maxLength={60} placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-ink-dim">Ruleset</span>
            <select className="input mt-1" value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}>
              {(status?.rulesets ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.maxRounds} rounds
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-ink-dim">
              Matches: <b className="text-ink">{count}</b> (max {limit} in {status?.liveMode ? "live" : "demo"} mode)
            </span>
            <input type="range" min={1} max={limit} value={Math.min(count, limit)} onChange={(e) => setCount(Number(e.target.value))} className="mt-2 w-full accent-violet-500" />
          </label>
          <label className="block">
            <span className="text-xs text-ink-dim">Seed range start (match i uses seed start + i)</span>
            <input className="input mt-1 font-mono" inputMode="numeric" placeholder="Random" value={seedStart} onChange={(e) => setSeedStart(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-dim">Lineup:</span>
          {PERSONALITY_IDS.map((id) => (
            <span key={id} className="chip" style={{ color: PUBLIC_PERSONALITIES[id].color }}>
              <AgentAvatar personalityId={id} color={PUBLIC_PERSONALITIES[id].color} size={16} label="" />
              {PUBLIC_PERSONALITIES[id].name}
            </span>
          ))}
          <label className="ml-2 flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} className="accent-violet-500" /> Rotate seats
          </label>
        </div>
        <div className="mt-4 border border-line bg-abyss/60 p-3 text-xs text-ink-dim">
          {status?.liveMode ? (
            <>
              Model routing: <b className="text-ink">{status.models?.cheap}</b> for routine decisions, <b className="text-ink">{status.models?.strategic}</b> for escalations. Estimated upper bound:{" "}
              <b className="text-cyan-200">{fmtUsd(estCost)}</b> (estimate). Remaining global budget: {status.budget ? fmtUsd(status.budget.globalLimitUsd - status.budget.globalSpentUsd) : "—"}. Tournaments never start automatically.
            </>
          ) : (
            <>Local demo mode: matches use deterministic heuristic agents — no API calls, $0. Useful for validating the pipeline and rules balance.</>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn btn-primary" disabled={busy || !status} onClick={() => void create()}>
            {busy ? "Starting…" : `Run ${count} match${count === 1 ? "" : "es"}`}
          </button>
        </div>
      </section>

      <section className="mt-6" aria-label="Previous tournaments">
        <h2 className="panel-title">Tournaments</h2>
        {list === null ? (
          <p className="mt-2 text-sm text-ink-faint">Loading…</p>
        ) : list.length === 0 ? (
          <p className="mt-2 border border-dashed border-line-strong p-4 text-sm text-ink-dim">No tournaments yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line border border-line">
            {list.map((t) => (
              <li key={t.id}>
                <Link href={`/tournaments/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="font-mono text-[10px] text-ink-faint">
                      {new Date(t.createdAt).toLocaleString()} · {t.completed}/{t.matchCount} completed{t.failed ? ` · ${t.failed} failed` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <span className={`chip ${t.agentMode === "live" ? "text-cyan-300" : "text-amber-300"}`}>{t.agentMode}</span>
                    <span className="chip text-ink-dim">{t.status}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
