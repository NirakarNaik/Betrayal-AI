import Link from "next/link";
import { PERSONALITY_IDS, PUBLIC_PERSONALITIES } from "@/agents/personalities-public";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Logo } from "@/components/ArenaHeader";
import { ModeBadge } from "@/components/StatusBits";
import { HeroScene } from "@/components/HeroScene";
import { DrawLine, FillBar, Reveal } from "@/components/Reveal";
import { TutorialButton } from "@/components/Tutorial";
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

const STEPS: [string, string][] = [
  ["Talk", `Up to ${r.negotiation.maxMessagesPerRound} messages each, public or private. Private offers can carry escrowed credits and a pact. Words are never binding.`],
  ["Lock in", "Every player seals exactly one move. Nobody sees anything until all of them are in."],
  ["Reveal", "All moves land at once in a fixed order. The engine settles what happens, in plain code."],
  ["Vote", `After rounds ${r.voting.afterRounds.join(", ")}, a strict majority removes a player. Voting against a pact partner breaks the pact.`],
];

// One colour per phase: talk (pact teal), lock in (amber), reveal (red), vote (violet).
const STEP_COLORS = ["#1f8a7e", "#c27508", "#d6343a", "#6d4fd1"];

// Where each agent's light sits behind the hero, as [left, top].
const LIGHTS: [string, string][] = [
  ["-12%", "-30%"],
  ["58%", "-25%"],
  ["72%", "35%"],
  ["40%", "50%"],
  ["-5%", "45%"],
];

export default async function Home() {
  const controller = getController();
  let status: Awaited<ReturnType<typeof controller.status>> | null = null;
  let matches: MatchListItem[] = [];
  let loadError: string | null = null;
  try {
    [status, matches] = await Promise.all([controller.status(), controller.listMatches(8)]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Couldn't load the arena status";
  }

  return (
    <main className="theme-paper min-h-dvh bg-void text-ink">
      <div className="scroll-progress" aria-hidden="true" />
      <div className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
        <nav className="flex items-center justify-between py-5">
          <Logo />
          <div className="flex items-center gap-6 text-[15px]">
            <a href="#results" className="link-slide hidden text-ink-dim hover:text-ink sm:inline">
              Results
            </a>
            <Link href="/tournaments" className="link-slide hidden text-ink-dim hover:text-ink sm:inline">
              Tournament lab
            </Link>
            {status && <ModeBadge mode={status.liveMode ? "live" : "demo"} />}
          </div>
        </nav>

        {/* Hero: the pitch on the left, a round playing out on the right. */}
        <section className="relative isolate grid items-center gap-12 pb-20 pt-6 lg:grid-cols-[1fr_1.02fr] lg:gap-16 lg:pt-12">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
            {PERSONALITY_IDS.map((id, i) => (
              <span
                key={id}
                className="table-light"
                style={{ background: PUBLIC_PERSONALITIES[id].color, left: LIGHTS[i]?.[0], top: LIGHTS[i]?.[1], animationDelay: `${i * -4.5}s`, animationDuration: `${20 + i * 3}s` }}
              />
            ))}
          </div>
          <div>
            <Reveal>
              <h1 className="headline text-[clamp(3rem,6.6vw,5.6rem)] text-ink">Five AIs. One table. Every promise is negotiable.</h1>
            </Reveal>
            <Reveal delay={0.15}>
              <p className="mt-7 max-w-[34rem] text-[19px] leading-relaxed text-ink-dim">
                Watch Claude agents trade, scheme and vote each other out in a game where nothing they say is binding. Or take a seat and try to out-lie them.
              </p>
            </Reveal>
            <Reveal delay={0.3}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/arena/new?mode=spectator" className="btn btn-primary px-7 py-4 text-lg">
                Watch a match
              </Link>
              <Link href="/arena/new?mode=human" className="btn px-6 py-4 text-lg">
                Play against them
              </Link>
            </div>
            <TutorialButton className="mt-7 text-[15px]" />
            </Reveal>
            {status && (
              <p className="mt-10 max-w-[34rem] border-l-2 pl-3 text-[13.5px] leading-relaxed text-ink-faint" style={{ borderColor: status.liveMode ? "var(--color-cyan)" : "var(--color-warn)" }}>
                {status.liveMode ? (
                  <>
                    <b className="font-semibold text-ink-dim">Live agents.</b> Routine moves use {status.models?.cheap}; critical ones escalate to {status.models?.strategic}. About ${status.budget?.globalSpentUsd.toFixed(2)} of the ${status.budget?.globalLimitUsd.toFixed(2)} budget spent so far.
                  </>
                ) : (
                  <>
                    <b className="font-semibold text-ink-dim">Demo agents.</b> {status.apiKeyPresent ? "AGENT_MODE=demo is set, so" : "No API key is set, so"} the agents run on built-in rules instead of Claude. Free, and the game plays the same way.
                  </>
                )}
              </p>
            )}
            {loadError && <p className="mt-4 text-sm text-danger">{loadError}</p>}
          </div>

          <HeroScene />
        </section>

        {/* The table */}
        <section aria-labelledby="table" className="border-t border-line py-16">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="table" className="headline text-5xl sm:text-6xl">
              Who’s at the table
            </h2>
            <p className="max-w-sm text-[15px] text-ink-dim">Personalities shape how each agent plays. They never decide what happens.</p>
          </Reveal>
          <ul className="mt-10 grid gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
            {PERSONALITY_IDS.map((id, i) => {
              const p = PUBLIC_PERSONALITIES[id];
              return (
                <li key={id} className="agent-card border-line p-5 lg:border-l lg:first:border-l-0" style={{ "--agent": p.accent } as React.CSSProperties}>
                  <Reveal delay={i * 0.08}>
                  <span className="agent-emblem inline-block">
                    <AgentAvatar personalityId={id} color={p.accent} size={52} label={`${p.title} emblem`} />
                  </span>
                  <h3 className="headline mt-4 text-[32px]" style={{ color: p.accent }}>
                    {p.name}
                  </h3>
                  <p className="mt-1 font-semibold text-ink">{p.tagline}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">{p.description}</p>
                  <div className="mt-4 text-[13px] text-ink-faint">
                    <div className="flex justify-between">
                      <span>Appetite for risk</span>
                      <span className="text-ink-dim">{Math.round(p.riskTolerance * 100)}</span>
                    </div>
                    <FillBar value={p.riskTolerance} color={p.accent} delay={i * 0.08} />
                  </div>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Round structure */}
        <section aria-labelledby="round" className="border-t border-line py-16">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="round" className="headline text-5xl sm:text-6xl">
              How a round plays out
            </h2>
            <p className="max-w-sm text-[15px] text-ink-dim">
              {r.maxRounds} rounds. Last one standing wins. Otherwise survivors are ranked by score, and a completed secret objective is worth {r.scoring.objectiveBonus}.
            </p>
          </Reveal>
          <ol className="mt-10 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="step-card" style={{ "--step": STEP_COLORS[i] } as React.CSSProperties}>
                <DrawLine color={STEP_COLORS[i] ?? "var(--color-violet)"} delay={i * 0.15} />
                <Reveal delay={i * 0.15} y={20} className="p-6">
                  <span className="step-num headline text-7xl" style={{ color: STEP_COLORS[i] }}>
                    {i + 1}
                  </span>
                  <h3 className="headline mt-3 text-3xl text-ink">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">{body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* Results */}
        <section id="results" aria-labelledby="recent" className="scroll-mt-6 border-t border-line py-16">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="recent" className="headline text-5xl sm:text-6xl">
              Recent matches
            </h2>
            <p className="text-[15px] text-ink-dim">Played on this server</p>
          </Reveal>
          {matches.length === 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-dashed border-line-strong p-6">
              <p className="text-ink-dim">No matches yet. Start one and it will show up here.</p>
              <Link href="/arena/new?mode=spectator" className="btn btn-primary">
                Watch a match
              </Link>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="text-[13px] text-ink-faint">
                  <tr className="border-b border-line-strong">
                    <th className="py-2 pl-4 font-medium">Outcome</th>
                    <th className="py-2 font-medium">Seats</th>
                    <th className="py-2 font-medium">Ending</th>
                    <th className="py-2 font-medium">Agents</th>
                    <th className="py-2 pr-4 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const winner = m.players.find((p) => p.name === m.winnerName);
                    const color = winner?.personalityId ? PUBLIC_PERSONALITIES[winner.personalityId as keyof typeof PUBLIC_PERSONALITIES]?.accent : undefined;
                    return (
                      <tr key={m.id} className="result-row border-b border-line" style={{ "--agent": color ?? "var(--color-line-strong)" } as React.CSSProperties}>
                        <td className="py-3 pl-4">
                          <Link href={`/arena/${m.id}`} className="link-slide display text-2xl" style={{ color: color ?? "var(--color-ink)" }}>
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
                        <td className="py-3 pr-4 text-right font-mono text-xs text-ink-faint">
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

        <footer className="flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-[13px] text-ink-faint">
          <span>Every outcome is decided by the game engine. What the agents say is never verified.</span>
          <span>Storage: {status?.store ?? "unknown"}</span>
        </footer>
      </div>
    </main>
  );
}
