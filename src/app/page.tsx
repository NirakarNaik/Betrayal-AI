import Link from "next/link";
import { PERSONALITY_IDS, PUBLIC_PERSONALITIES } from "@/agents/personalities-public";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Logo } from "@/components/ArenaHeader";
import { ModeBadge } from "@/components/StatusBits";
import { STANDARD_RULESET } from "@/game/config";
import { getController } from "@/server/controller";
import type { MatchListItem } from "@/server/store";

export const dynamic = "force-dynamic";

function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default async function Home() {
  const controller = getController();
  let status: Awaited<ReturnType<typeof controller.status>> | null = null;
  let matches: MatchListItem[] = [];
  let loadError: string | null = null;
  try {
    [status, matches] = await Promise.all([controller.status(), controller.listMatches(8)]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load arena status";
  }
  const r = STANDARD_RULESET;

  return (
    <main className="relative overflow-hidden">
      <div className="afc-grid pointer-events-none absolute inset-x-0 top-0 h-[640px] opacity-70" />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <nav className="flex items-center justify-between py-5">
          <Logo />
          <div className="flex items-center gap-2">
            {status && <ModeBadge mode={status.liveMode ? "live" : "demo"} />}
            <Link href="/tournaments" className="hidden font-display text-xs uppercase tracking-widest text-ink-dim hover:text-ink sm:inline">
              Tournament Lab
            </Link>
          </div>
        </nav>

        <section className="pt-10 pb-12 sm:pt-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-300">Game mode 01 · Betrayal Protocol</p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-7xl">
            Five agents.
            <br />
            <span className="text-violet-400 text-glow-violet">One survives</span> the deal.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-ink-dim sm:text-lg">
            An underground arena where AI agents negotiate in public, scheme in private, commit secret actions and vote each other out. Claude proposes every move. A deterministic engine decides what actually
            happens.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/arena/new" className="btn btn-primary px-6 py-3 text-sm">
              Enter the Arena
            </Link>
            <Link href="/arena/new?mode=spectator" className="btn px-5 py-3">
              Spectator Mode
            </Link>
            <Link href="/arena/new?mode=human" className="btn btn-cyan px-5 py-3">
              Play as a Human
            </Link>
            <Link href="/tournaments" className="btn px-5 py-3">
              Tournament Lab
            </Link>
          </div>
          {status && (
            <div className={`mt-6 max-w-2xl rounded-[4px] border px-3 py-2 text-xs ${status.liveMode ? "border-cyan-400/40 bg-cyan-950/20 text-cyan-100" : "border-amber-400/40 bg-amber-950/20 text-amber-100"}`}>
              {status.liveMode ? (
                <>
                  <b>Live API mode.</b> Agents call Claude ({status.models?.cheap} routine, {status.models?.strategic} for critical decisions). Spent so far: ${status.budget?.globalSpentUsd.toFixed(2)} of $
                  {status.budget?.globalLimitUsd.toFixed(2)} global budget (estimated).
                </>
              ) : (
                <>
                  <b>Local demo mode.</b> {status.apiKeyPresent ? "AGENT_MODE=demo is set, so" : "No ANTHROPIC_API_KEY is configured, so"} matches use deterministic heuristic agents — no API calls, no cost. Add a key to
                  <code className="mx-1 font-mono">.env.local</code>to run real Claude agents.
                </>
              )}
            </div>
          )}
          {loadError && <p className="mt-4 text-sm text-rose-300">{loadError}</p>}
        </section>

        <section aria-labelledby="roster" className="py-8">
          <div className="flex items-end justify-between">
            <h2 id="roster" className="font-display text-xl font-bold uppercase tracking-wider">
              The Roster
            </h2>
            <span className="font-mono text-[11px] text-ink-faint">personalities shape preferences — never outcomes</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PERSONALITY_IDS.map((id) => {
              const p = PUBLIC_PERSONALITIES[id];
              return (
                <article key={id} className="panel group relative overflow-hidden p-4 transition-colors hover:border-line-strong">
                  <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: p.color }} />
                  <AgentAvatar personalityId={id} color={p.color} size={58} label={`${p.title} avatar`} />
                  <h3 className="mt-3 font-display text-lg font-bold" style={{ color: p.color }}>
                    {p.title}
                  </h3>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">{p.tagline}</p>
                  <p className="mt-2 text-[13px] leading-snug text-ink-dim">{p.description}</p>
                  <div className="mt-3">
                    <div className="flex justify-between font-mono text-[10px] uppercase text-ink-faint">
                      <span>Risk</span>
                      <span>{Math.round(p.riskTolerance * 100)}</span>
                    </div>
                    <div className="mt-0.5 h-1 rounded bg-line">
                      <div className="h-full rounded" style={{ width: `${p.riskTolerance * 100}%`, background: p.color }} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 py-8 lg:grid-cols-[1.1fr_1fr]">
          <section aria-labelledby="rules" className="panel p-5">
            <h2 id="rules" className="font-display text-xl font-bold uppercase tracking-wider">
              How the protocol works
            </h2>
            <ol className="mt-4 space-y-3 text-sm text-ink-dim">
              {[
                ["Negotiate", `Up to ${r.negotiation.maxMessagesPerRound} messages a round — public, or private offers with escrowed credits and non-aggression pacts. Words are never binding.`],
                ["Commit in secret", "Each agent locks exactly one action: Strike, Guard, Scout, Investigate, Sabotage, Trade, Mediate or Recover. Nobody sees anything until everyone has committed."],
                ["Resolve", "The engine resolves all actions simultaneously in a fixed, documented order. Damage, transfers and eliminations are computed by code — never by the model."],
                ["Vote", `After rounds ${r.voting.afterRounds.join(", ")}, a strict majority can eliminate a player. Ties change nothing. Voting against a pact partner is a betrayal.`],
                ["Win", `Last agent standing wins. Otherwise survivors are ranked by Protocol Score — secret objective (+${r.scoring.objectiveBonus}), influence, health and credits.`],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 font-mono text-xs text-violet-400">0{i + 1}</span>
                  <span>
                    <b className="font-display uppercase tracking-wide text-ink">{t}.</b> {d}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="recent" className="panel flex flex-col p-5">
            <h2 id="recent" className="font-display text-xl font-bold uppercase tracking-wider">
              Recent matches
            </h2>
            {matches.length === 0 ? (
              <div className="mt-4 flex flex-1 flex-col items-start justify-center gap-3 rounded-[4px] border border-dashed border-line-strong p-5 text-sm text-ink-dim">
                <p>No matches have been played on this server yet.</p>
                <Link href="/arena/new" className="btn btn-primary">
                  Start the first match
                </Link>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {matches.map((m) => (
                  <li key={m.id}>
                    <Link href={`/arena/${m.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface-2/50">
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-semibold">
                          {m.winnerName ? `${m.winnerName} won` : m.status === "running" || m.status === "paused" ? `In progress · round ${m.round}` : m.status}
                          <span className="ml-2 font-mono text-[10px] uppercase text-ink-faint">{m.mode === "human" ? "human match" : "spectator"}</span>
                        </p>
                        <p className="font-mono text-[10px] text-ink-faint">
                          seed {m.seed} · {m.reason ? m.reason.replaceAll("_", " ") : m.rulesetId} · {timeAgo(m.createdAt)}
                        </p>
                      </div>
                      <span className={`chip ${m.agentMode === "live" ? "border-cyan-400/50 text-cyan-300" : "border-amber-400/50 text-amber-300"}`}>{m.agentMode}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="border-t border-line pt-6 font-mono text-[11px] text-ink-faint">
          Every displayed outcome comes from the deterministic engine. Agent messages and reasoning are labelled as unverified statements. Storage: {status?.store ?? "—"}.
        </footer>
      </div>
    </main>
  );
}
