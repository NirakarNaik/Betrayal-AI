"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PERSONALITY_IDS, PUBLIC_PERSONALITIES } from "@/agents/personalities-public";
import { STANDARD_RULESET as r } from "@/game/config";
import type { ActionType } from "@/game/types";
import { ACTION_META } from "@/lib/ui";

function cost(a: ActionType): string {
  const c = r.actions[a];
  const parts = [c.credits ? `${c.credits} credit${c.credits === 1 ? "" : "s"}` : null, c.intel ? `${c.intel} intel` : null, c.influence ? `${c.influence} influence` : null].filter(Boolean);
  if (parts.length) return parts.join(" + ");
  return a === "trade" ? "the amount you give" : "free";
}

const RESOURCES: [string, number, string][] = [
  ["Health", r.start.health, "Hit zero and you're out. Strikes take 1."],
  ["Credits", r.start.credits, "Pay for most moves, bribe other players."],
  ["Intel", r.start.intel, "Spend it to investigate someone's secret goal."],
  ["Influence", r.start.influence, "Spend it to mediate. It also counts toward your score."],
];

const ROUND: [string, string][] = [
  ["Talk", `Each player gets up to ${r.negotiation.maxMessagesPerRound} messages: public to the table, or private to one player. A private offer can carry up to ${r.negotiation.maxOfferCredits} credits and a non-aggression pact.`],
  ["Lock in a move", "Everyone secretly picks exactly one action. Nobody sees anyone else's until all of them are in."],
  ["Reveal", "Every action lands at the same time, in a fixed order. The engine settles the result, not the agents."],
  ["Vote", `After rounds ${r.voting.afterRounds.join(", ")}, everyone votes to remove a player. A strict majority is needed. A tie removes nobody.`],
];

type Step = { title: string; body: React.ReactNode };

const STEPS: Step[] = [
  {
    title: "A game where talk is cheap",
    body: (
      <>
        <p>
          Betrayal Protocol is a social deduction game played by AI agents. Five players share a table. Each round they talk, make deals, then secretly pick one move. Every few rounds they vote someone out.
        </p>
        <p>
          Nothing anyone says is binding. Agents can promise anything and do the opposite. The only things that are guaranteed are the rules, which are enforced by a game engine written in plain code.
        </p>
        <p>Claude writes every message and proposes every move. The engine checks each move is legal and decides what actually happens.</p>
      </>
    ),
  },
  {
    title: "Three ways in",
    body: (
      <dl className="grid gap-5">
        <div>
          <dt className="text-lg font-bold text-ink">Watch a match</dt>
          <dd>Five agents play each other while you watch. Turn on the director’s view to read their private deals and the reasoning behind each move.</dd>
        </div>
        <div>
          <dt className="text-lg font-bold text-ink">Play against them</dt>
          <dd>Take one seat against four agents. You see only what your seat is allowed to see, the same as they do.</dd>
        </div>
        <div>
          <dt className="text-lg font-bold text-ink">Tournament lab</dt>
          <dd>Run many matches at once with rotating seats to see which personality wins most often.</dd>
        </div>
      </dl>
    ),
  },
  {
    title: "What everyone starts with",
    body: (
      <>
        <ul className="grid gap-px bg-line sm:grid-cols-2">
          {RESOURCES.map(([name, n, what]) => (
            <li key={name} className="flex items-start gap-4 bg-surface p-4">
              <span className="headline text-5xl text-ink">{n}</span>
              <span>
                <b className="block text-ink">{name}</b>
                {what}
              </span>
            </li>
          ))}
        </ul>
        <p>
          Each player also gets one secret objective, like ending with the most credits or never striking anyone. Completing it is worth {r.scoring.objectiveBonus} points. Nobody else knows yours unless they investigate you.
        </p>
      </>
    ),
  },
  {
    title: `Every round, in order`,
    body: (
      <>
        <ol className="grid gap-4">
          {ROUND.map(([title, text], i) => (
            <li key={title} className="grid grid-cols-[2.25rem_1fr] gap-3">
              <span className="headline text-4xl text-violet">{i + 1}</span>
              <span>
                <b className="block text-ink">{title}</b>
                {text}
              </span>
            </li>
          ))}
        </ol>
        <p>A match lasts {r.maxRounds} rounds.</p>
      </>
    ),
  },
  {
    title: "The eight moves",
    body: (
      <>
        <p>You pick one per round. If you can’t afford it when the round resolves, it fizzles and costs nothing.</p>
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
            <li key={a} className="border-l-2 pl-3" style={{ borderColor: ACTION_META[a].tone }}>
              <b className="text-ink">{ACTION_META[a].label}</b> <span className="text-ink-faint">({cost(a)})</span>
              <span className="block">{ACTION_META[a].blurb}</span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    title: "Deals, pacts and betrayal",
    body: (
      <>
        <p>
          A private offer locks its credits in escrow the moment it’s sent. If the other player accepts, they get the credits. If they decline, the credits come back. That part is guaranteed. The words attached to it are not.
        </p>
        <p>An offer can also propose a pact: a promise not to attack each other for this round and the next.</p>
        <p className="border-l-2 border-violet pl-3 text-ink">
          Striking, sabotaging or voting against a pact partner breaks the pact, and everyone sees it. Nothing stops you doing it. Everyone will just remember.
        </p>
      </>
    ),
  },
  {
    title: "How to win",
    body: (
      <>
        <p>If only one player is left standing, they win.</p>
        <p>
          Otherwise, after round {r.maxRounds} the survivors are ranked by Protocol Score: {r.scoring.objectiveBonus} for a completed secret objective, plus influence, plus health, plus one point for every {r.scoring.creditsPerPoint} credits.
        </p>
        <p>Survivors always rank above eliminated players, so staying alive comes first.</p>
        <div>
          <b className="text-ink">Who you’re up against</b>
          <ul className="mt-2 grid gap-1.5">
            {PERSONALITY_IDS.map((id) => {
              const p = PUBLIC_PERSONALITIES[id];
              return (
                <li key={id}>
                  <b style={{ color: p.color }}>{p.name}.</b> {p.tagline}
                </li>
              );
            })}
          </ul>
        </div>
      </>
    ),
  },
  {
    title: "Before your first match",
    body: (
      <>
        <ul className="grid gap-3">
          <li>Watch one match first. It takes a few minutes and shows how the agents talk and when they turn.</li>
          <li>When you play, you have a timer for each phase. If it runs out, your move becomes Recover and your vote is an abstention.</li>
          <li>Guard is cheap insurance in rounds when someone has a reason to hit you.</li>
          <li>Investigating tells you what a player is after, which tells you what they’ll do next.</li>
        </ul>
        <p>
          The full rulebook, including the exact resolution order, is in <code className="font-mono text-[13px] text-ink">docs/RULES.md</code>. Every match screen also has a rules panel you can open at any time.
        </p>
      </>
    ),
  },
];

export function TutorialButton({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(0);
  const last = STEPS.length - 1;

  const open = () => {
    setI(0);
    ref.current?.showModal();
  };
  const close = useCallback(() => ref.current?.close(), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((n) => Math.min(last, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    d.addEventListener("keydown", onKey);
    return () => d.removeEventListener("keydown", onKey);
  }, [last]);

  const step = STEPS[i] ?? STEPS[0]!;

  return (
    <>
      <button type="button" onClick={open} className={`group inline-flex items-center gap-2.5 text-ink-dim hover:text-ink ${className}`}>
        <span className="grid h-7 w-7 place-items-center rounded-full border border-line-strong text-sm font-bold group-hover:border-ink" aria-hidden="true">
          ?
        </span>
        <span className="underline decoration-line-strong underline-offset-4 group-hover:decoration-ink">New here? How it works</span>
      </button>

      <dialog
        ref={ref}
        className="tutorial"
        aria-labelledby="tutorial-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex gap-1 px-6 pt-5 sm:px-8" aria-hidden="true">
            {STEPS.map((s, n) => (
              <span key={s.title} className={`h-[3px] flex-1 ${n <= i ? "bg-ink" : "bg-line"}`} />
            ))}
          </div>
          <header className="flex items-start justify-between gap-4 px-6 pt-5 sm:px-8">
            <div>
              <p className="text-sm text-ink-faint">
                {i + 1} of {STEPS.length}
              </p>
              <h2 id="tutorial-title" className="headline mt-1 text-[clamp(2rem,5vw,2.75rem)] text-ink">
                {step.title}
              </h2>
            </div>
            <button type="button" onClick={close} className="-mr-2 grid h-9 w-9 shrink-0 place-items-center text-xl text-ink-dim hover:text-ink" aria-label="Close tutorial">
              ×
            </button>
          </header>
          <div key={i} className="afc-enter scroll-thin grid flex-1 content-start gap-4 overflow-y-auto px-6 py-5 text-[15.5px] leading-relaxed text-ink-dim sm:px-8">
            {step.body}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4 sm:px-8">
            <button type="button" className="btn" onClick={() => setI((n) => n - 1)} disabled={i === 0}>
              Back
            </button>
            {i < last ? (
              <button type="button" className="btn btn-primary" onClick={() => setI((n) => n + 1)} autoFocus>
                Next
              </button>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Link href="/arena/new?mode=human" className="btn" onClick={close}>
                  Play against them
                </Link>
                <Link href="/arena/new?mode=spectator" className="btn btn-primary" onClick={close}>
                  Watch a match
                </Link>
              </div>
            )}
          </footer>
        </div>
      </dialog>
    </>
  );
}
