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

const r = STANDARD_RULESET;

/** Ticker items are rules facts only — never invented results or statistics. */
const TICKER = [
  `${r.maxRounds} rounds`,
  `${r.start.health} health · ${r.start.credits} credits · ${r.start.intel} intel · ${r.start.influence} influence`,
  `elimination votes after rounds ${r.voting.afterRounds.join(" / ")}`,
  "strike 3cr · guard 1cr · scout 1cr · sabotage 2cr",
  "investigate 2 intel · mediate 1 influence · recover free",
  "promises are not binding",
  "the engine decides, the model only proposes",
  "simultaneous resolution · fixed order",
];

const STEPS: [string, string][] = [
  ["Negotiate", `Up to ${r.negotiation.maxMessagesPerRound} messages a round. Public statements, or private offers with escrowed credits and a non-aggression pact. Nothing said is binding.`],
  ["Commit", "Each agent seals exactly one action. Nobody sees anything until every living player has locked in."],
  ["Resolve", "All actions land at once in a fixed order — costs, guards, intel, economy, strikes, diplomacy, eliminations. Pure code."],
  ["Vote", `After rounds ${r.voting.afterRounds.join(", ")} a strict majority removes a player. Ties do nothing. Voting against a pact partner is a betrayal.`],
];

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

  return (
    <main>
      {/* Ticker */}
      <div className="overflow-hidden border-b border-line bg-abyss" aria-hidden="true">
        <div className="ticker-track flex w-max gap-10 whitespace-nowrap py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-10">
              {t}
              <span className="text-violet">◆</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
        <nav className="flex items-center justify-between py-5">
          <Logo />
          <div className="flex items-center gap-5">
            <Link href="/arena/new" className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim hover:text-ink sm:inline">
              New match
            </Link>
            <Link href="/tournaments" className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim hover:text-ink sm:inline">
              Tournament lab
            </Link>
            {status && <ModeBadge mode={status.liveMode ? "live" : "demo"} />}
          </div>
        </nav>

        {/* Hero */}
        <section className="grid gap-10 border-b border-line pb-14 pt-8 lg:grid-cols-[1.25fr_1fr] lg:gap-14 lg:pt-14">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-violet-bright">Game mode 01</p>
            <h1 className="display mt-3 text-[clamp(4rem,11vw,9.5rem)] font-black">
              Betrayal
              <br />
              <span className="text-violet">Protocol</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-dim">
              Five agents sit down at the table. They make deals in public, cut deals in private, lock in one secret move a round and vote each other out. <span className="text-ink">Claude proposes. A deterministic engine decides what actually happens.</span>
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Link href="/arena/new" className="btn btn-primary px-7 py-3.5 text-lg">
                Enter the arena
              </Link>
              <Link href="/arena/new?mode=spectator" className="btn px-5 py-3.5">
                Spectate
              </Link>
              <Link href="/arena/new?mode=human" className="btn btn-cyan px-5 py-3.5">
                Play as human
              </Link>
              <Link href="/tournaments" className="btn px-5 py-3.5">
                Tournament lab
              </Link>
            </div>
            {status && (
              <p className="mt-6 max-w-xl border-l-2 pl-3 text-[13px] leading-relaxed text-ink-dim" style={{ borderColor: status.liveMode ? "var(--color-cyan)" : "var(--color-warn)" }}>
                {status.liveMode ? (
                  <>
                    <b className="text-ink">Live API mode.</b> Routine calls go to {status.models?.cheap}; critical decisions escalate to {status.models?.strategic}. Spent so far ≈ ${status.budget?.globalSpentUsd.toFixed(2)} of a $
                    {status.budget?.globalLimitUsd.toFixed(2)} cap.
                  </>
                ) : (
                  <>
                    <b className="text-ink">Local demo mode.</b> {status.apiKeyPresent ? "AGENT_MODE=demo is set, so" : "No API key is configured, so"} agents are deterministic heuristics — no API calls, no cost.
                  </>
                )}
              </p>
            )}
            {loadError && <p className="mt-4 text-sm text-danger">{loadError}</p>}
          </div>

          {/* Fight card */}
          <aside aria-labelledby="card" className="self-end">
            <div className="flex items-baseline justify-between border-b border-line-strong pb-2">
              <h2 id="card" className="display text-2xl">
                The card
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">risk tolerance</span>
            </div>
            <ol>
              {PERSONALITY_IDS.map((id, i) => {
                const p = PUBLIC_PERSONALITIES[id];
                return (
                  <li key={id} className="group grid grid-cols-[28px_44px_1fr_64px] items-center gap-3 border-b border-line py-3">
                    <span className="font-mono text-xs text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                    <AgentAvatar personalityId={id} color={p.color} size={42} label={`${p.title} emblem`} />
                    <div className="min-w-0">
                      <p className="display text-[26px] leading-none" style={{ color: p.color }}>
                        {p.name}
                      </p>
                      <p className="mt-1 truncate text-[12.5px] text-ink-dim">{p.tagline} {p.description.split(". ")[0]}.</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-ink">{Math.round(p.riskTolerance * 100)}</p>
                      <div className="mt-1 h-[3px] bg-line">
                        <div className="h-full" style={{ width: `${p.riskTolerance * 100}%`, background: p.color }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">Personalities bias preferences. They never script outcomes.</p>
          </aside>
        </section>

        {/* Round structure */}
        <section aria-labelledby="round" className="border-b border-line py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="round" className="display text-4xl sm:text-5xl">
              Anatomy of a round
            </h2>
            <p className="max-w-md text-sm text-ink-dim">
              Last agent standing wins. Otherwise survivors rank by Protocol Score: secret objective (+{r.scoring.objectiveBonus}), influence, health and credits.
            </p>
          </div>
          <ol className="mt-8 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="bg-void p-5 pr-6">
                <span className="display block text-6xl text-surface-3">{i + 1}</span>
                <h3 className="display mt-2 text-2xl text-ink">{title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-dim">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Results */}
        <section aria-labelledby="recent" className="py-14">
          <div className="flex items-end justify-between">
            <h2 id="recent" className="display text-4xl sm:text-5xl">
              Results
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">played on this server</span>
          </div>
          {matches.length === 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-dashed border-line-strong p-6">
              <p className="text-ink-dim">No matches have been played on this server yet.</p>
              <Link href="/arena/new" className="btn btn-primary">
                Run the first match
              </Link>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                  <tr className="border-b border-line-strong">
                    <th className="py-2 font-medium">Outcome</th>
                    <th className="py-2 font-medium">Format</th>
                    <th className="py-2 font-medium">Ending</th>
                    <th className="py-2 font-medium">Agents</th>
                    <th className="py-2 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const winner = m.players.find((p) => p.name === m.winnerName);
                    const color = winner?.personalityId ? PUBLIC_PERSONALITIES[winner.personalityId as keyof typeof PUBLIC_PERSONALITIES]?.color : undefined;
                    return (
                      <tr key={m.id} className="border-b border-line hover:bg-surface">
                        <td className="py-3">
                          <Link href={`/arena/${m.id}`} className="display text-2xl hover:underline" style={{ color: color ?? "var(--color-ink)" }}>
                            {m.winnerName ? `${m.winnerName} wins` : m.status === "running" || m.status === "paused" ? `Live · round ${m.round}` : m.status}
                          </Link>
                        </td>
                        <td className="py-3 font-mono text-xs text-ink-dim">
                          {m.mode === "human" ? "human seat" : "all-AI"} · {m.rulesetId.replace("-v1", "")}
                        </td>
                        <td className="py-3 font-mono text-xs text-ink-dim">{m.reason ? m.reason.replaceAll("_", " ") : "—"}</td>
                        <td className="py-3">
                          <span className={`chip ${m.agentMode === "live" ? "text-cyan" : "text-warn"}`}>{m.agentMode === "live" ? "claude" : "demo"}</span>
                        </td>
                        <td className="py-3 text-right font-mono text-xs text-ink-faint">
                          seed {m.seed} · {timeAgo(m.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="flex flex-wrap justify-between gap-3 border-t border-line pt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          <span>Every outcome comes from the deterministic engine · agent speech is labelled unverified</span>
          <span>storage: {status?.store ?? "—"}</span>
        </footer>
      </div>
    </main>
  );
}
