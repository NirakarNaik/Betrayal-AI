"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PUBLIC_PERSONALITIES, PERSONALITY_IDS } from "@/agents/personalities-public";
import { api, fmtUsd } from "@/lib/ui";
import type { MatchEstimate } from "@/llm/estimate";
import { AgentAvatar } from "./AgentAvatar";
import { Logo } from "./ArenaHeader";
import { ErrorBanner, ModeBadge } from "./StatusBits";

interface Status {
  liveMode: boolean;
  apiKeyPresent: boolean;
  models: { cheap: string; strategic: string } | null;
  budget: { globalSpentUsd: number; globalLimitUsd: number; matchLimitUsd: number; killSwitch: boolean } | null;
  rulesets: { id: string; name: string; description: string; maxRounds: number }[];
  estimates: Record<string, { spectator: MatchEstimate; human: MatchEstimate }>;
  humanTimeoutMs: number;
}

export function MatchSetupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<"spectator" | "human">(params.get("mode") === "human" ? "human" : "spectator");
  const [rulesetId, setRulesetId] = useState("standard-v1");
  const [seed, setSeed] = useState<string>("");
  const [speed, setSpeed] = useState<"standard" | "accelerated">("standard");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<Status>("/api/status").then(setStatus, (e: Error) => setError(e.message));
  }, []);

  const est = status?.estimates[rulesetId]?.[mode];
  const seedValue = seed.trim() === "" ? null : Number(seed);
  const seedInvalid = seedValue !== null && (!Number.isInteger(seedValue) || seedValue < 0 || seedValue > 0xffffffff);

  async function start() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ matchId: string }>("/api/matches", {
        method: "POST",
        body: JSON.stringify({ mode, rulesetId, seed: seedValue, speed, humanName: mode === "human" ? name : undefined }),
      });
      router.push(`/arena/${res.matchId}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <nav className="flex items-center justify-between">
        <Logo />
        {status && <ModeBadge mode={status.liveMode ? "live" : "demo"} />}
      </nav>
      <h1 className="mt-8 font-display text-3xl font-bold uppercase tracking-wide">Match setup</h1>
      <p className="mt-1 text-sm text-ink-dim">Configure a Betrayal Protocol match. Seeds make objective assignment and every engine outcome reproducible.</p>
      <div className="mt-4">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(["spectator", "human"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`panel p-4 text-left transition-colors ${mode === m ? "border-violet-400 bg-surface-2" : "hover:border-line-strong"}`}
          >
            <p className="font-display text-lg font-bold uppercase tracking-wide">{m === "spectator" ? "Spectator match" : "Human match"}</p>
            <p className="mt-1 text-sm text-ink-dim">
              {m === "spectator" ? "Five AI agents compete. Watch with an optional director's view of every secret." : "You take a seat against four AI agents. You only see what your seat is entitled to see."}
            </p>
            <div className="mt-3 flex gap-1.5">
              {(m === "spectator" ? PERSONALITY_IDS : PERSONALITY_IDS.slice(0, 4)).map((id) => (
                <AgentAvatar key={id} personalityId={id} color={PUBLIC_PERSONALITIES[id].color} size={30} label={PUBLIC_PERSONALITIES[id].title} />
              ))}
              {m === "human" && <AgentAvatar personalityId={null} color="#e2e8f0" size={30} label="You" />}
            </div>
          </button>
        ))}
      </div>

      <section className="panel mt-4 grid gap-4 p-5 md:grid-cols-2">
        <label className="block">
          <span className="panel-title">Rule configuration</span>
          <select className="input mt-1.5" value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}>
            {(status?.rulesets ?? [{ id: "standard-v1", name: "Standard Protocol", description: "", maxRounds: 6 }]).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {r.maxRounds} rounds
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-ink-faint">{status?.rulesets.find((r) => r.id === rulesetId)?.description}</span>
        </label>
        <label className="block">
          <span className="panel-title">Match seed</span>
          <div className="mt-1.5 flex gap-2">
            <input className="input font-mono" inputMode="numeric" placeholder="Random" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} aria-invalid={seedInvalid} />
            <button className="btn shrink-0" onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000)))}>
              Generate
            </button>
          </div>
          <span className={`mt-1 block text-xs ${seedInvalid ? "text-rose-300" : "text-ink-faint"}`}>{seedInvalid ? "Seed must be an integer between 0 and 4294967295." : "Leave empty for a random seed."}</span>
        </label>
        <fieldset>
          <legend className="panel-title">Simulation speed</legend>
          <div className="mt-1.5 flex gap-2">
            {(["standard", "accelerated"] as const).map((s) => (
              <button key={s} className={`btn flex-1 ${speed === s ? "border-cyan-400 text-cyan-200" : ""}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {s}
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-ink-faint">Controls pauses between phases. Can be changed during the match.</span>
        </fieldset>
        {mode === "human" ? (
          <label className="block">
            <span className="panel-title">Your callsign</span>
            <input className="input mt-1.5" maxLength={24} placeholder="Challenger" value={name} onChange={(e) => setName(e.target.value)} />
            <span className="mt-1 block text-xs text-ink-faint">Turn timer: {Math.round((status?.humanTimeoutMs ?? 180000) / 1000)}s per phase, then defaults apply (end negotiation / RECOVER / abstain).</span>
          </label>
        ) : (
          <div />
        )}
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="panel-title">Model decisions & cost</h2>
        {!status ? (
          <p className="mt-2 text-sm text-ink-faint">Loading configuration…</p>
        ) : !status.liveMode ? (
          <p className="mt-2 text-sm text-amber-100">
            Local demo mode: agents are deterministic heuristics. <b>0 API calls, $0.</b>
            {!status.apiKeyPresent && " Set ANTHROPIC_API_KEY in .env.local and restart to use Claude agents."}
          </p>
        ) : est ? (
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="font-mono text-2xl text-cyan-200">≤ {est.decisions.total}</p>
              <p className="text-xs text-ink-faint">
                model decisions ({est.decisions.negotiate} negotiate · {est.decisions.commit} commit · {est.decisions.vote} vote) plus at most one retry each
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl text-cyan-200">
                {fmtUsd(est.approxCostUsd.low)}–{fmtUsd(est.approxCostUsd.high)}
              </p>
              <p className="text-xs text-ink-faint">estimated cost (estimate, not a quote)</p>
            </div>
            <div className="text-xs text-ink-faint">
              <p>{est.assumptions}</p>
              {status.budget && (
                <p className="mt-1">
                  Match budget cap ${status.budget.matchLimitUsd.toFixed(2)} · global ${status.budget.globalSpentUsd.toFixed(2)} / ${status.budget.globalLimitUsd.toFixed(2)}
                  {status.budget.killSwitch && <b className="text-rose-300"> · kill switch engaged (demo agents will play)</b>}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-6 flex justify-end">
        <button className="btn btn-primary px-8 py-3" disabled={submitting || seedInvalid || !status} onClick={() => void start()}>
          {submitting ? "Starting…" : mode === "human" ? "Take your seat" : "Start match"}
        </button>
      </div>
    </main>
  );
}
