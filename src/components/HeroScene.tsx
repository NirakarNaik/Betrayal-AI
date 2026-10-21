"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PUBLIC_PERSONALITIES } from "@/agents/personalities-public";
import type { PersonalityId } from "@/game/types";

/**
 * A scripted, illustrative round that plays once on load: a private pact is
 * made, every action is sealed, then the seals lift and the pact breaks.
 * It shows the rules in motion; it is labelled as an example, not a result.
 */

const OFFER = "Pact through next round? I'll put 3 credits on it so you know I mean it.";
const REPLY = "Deal. You have my word.";

const SEALED: { id: PersonalityId; move: string; betrayal?: boolean }[] = [
  { id: "chessmaster", move: "Guard" },
  { id: "quant", move: "Recover" },
  { id: "chaos_gremlin", move: "Sabotage Quant" },
  { id: "politician", move: "Mediate with Snake" },
  { id: "snake", move: "Strike Politician", betrayal: true },
];

// Milestones in ms from start. The betrayal lands just under five seconds in.
const AT = { offer: 250, reply: 1900, sealed: 2700, reveal: 3500, stamp: 4700 };
const STEPS = Object.values(AT);

function Name({ id }: { id: PersonalityId }) {
  const p = PUBLIC_PERSONALITIES[id];
  return (
    <span className="inline-flex items-center gap-1.5 font-bold">
      <span className="inline-block h-2.5 w-2.5" style={{ background: p.accent }} aria-hidden="true" />
      {p.name}
    </span>
  );
}

function Typed({ text, run }: { text: string; run: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setN((c) => (c >= text.length ? c : c + 2)), 16);
    return () => clearInterval(t);
  }, [run, text]);
  return (
    <>
      <span>{text.slice(0, n)}</span>
      <span className="invisible" aria-hidden="true">
        {text.slice(n)}
      </span>
    </>
  );
}

export function HeroScene() {
  const reduce = useReducedMotion();
  // On small screens the sheet sits below the fold, so the round starts when it scrolls into view.
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [played, setPlayed] = useState(0);
  const [run, setRun] = useState(0);
  // Reduced motion skips straight to the finished transcript.
  const step = reduce ? STEPS.length : played;

  useEffect(() => {
    if (reduce || !inView) return;
    const timers = STEPS.map((ms, i) => setTimeout(() => setPlayed(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [reduce, inView, run]);

  const replay = () => {
    setPlayed(0);
    setRun((r) => r + 1);
  };
  const done = step >= STEPS.length;

  return (
    <figure ref={ref} className="relative">
      <div className="sheet type px-5 pb-6 pt-5 text-[14px] leading-[28px] sm:px-8 sm:text-[15px] sm:leading-[32px] lg:rotate-[0.6deg]" aria-label="Example round: Snake offers Politician a pact, then strikes Politician">
        <div className="flex items-baseline justify-between text-[13px] text-[#5b6274]">
          <span>Round 3 transcript</span>
          <span>{done ? "revealed" : step >= 3 ? "sealed" : "negotiation"}</span>
        </div>

        <div className="mt-3 min-h-[96px]" aria-live="off">
          {step >= 1 && (
            <p>
              <Name id="snake" /> <span className="text-[#5b6274]">to</span> <Name id="politician" /> <span className="text-[#5b6274]">(private)</span>
              <br />
              <span className="italic">
                &ldquo;
                <Typed text={OFFER} run={step >= 1} key={`o${run}`} />
                &rdquo;
              </span>
            </p>
          )}
        </div>
        <div className="min-h-[40px]">
          {step >= 2 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
              <Name id="politician" /> <span className="italic">&ldquo;{REPLY}&rdquo;</span>
              <span className="ml-2 whitespace-nowrap bg-[#1f6f66] px-1.5 py-0.5 text-[12px] not-italic text-[#eaf7f4]">pact formed</span>
            </motion.p>
          )}
        </div>

        <div className="mt-3 border-t-2 border-[#1b2030] pt-2">
          <p className="text-[13px] text-[#5b6274]">{step >= 3 ? "Actions locked, 5 of 5. Nobody sees them until all are in." : "Waiting for actions"}</p>
          <ul className="mt-1">
            {SEALED.map((s, i) => (
              <li key={s.id} className="grid grid-cols-[150px_1fr] items-center sm:grid-cols-[170px_1fr]">
                <Name id={s.id} />
                <span className="relative">
                  <span className={step >= 4 ? (s.betrayal ? "font-bold text-[#c92a2f]" : "") : "invisible"}>{s.move}</span>
                  {step >= 3 && (
                    <motion.span
                      className="redaction absolute left-0 top-1/2 -translate-y-1/2"
                      style={{ width: `${Math.max(7, s.move.length) * 0.62}em` }}
                      initial={{ scaleX: 0, originX: 0 }}
                      animate={step >= 4 ? { scaleX: 0, originX: 1 } : { scaleX: 1, originX: 0 }}
                      transition={{ duration: 0.3, delay: step >= 4 ? i * 0.18 : i * 0.08, ease: [0.7, 0, 0.3, 1] }}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex min-h-[64px] flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {done && (
            <>
              <motion.p className="max-w-[21rem] leading-snug" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.2 }}>
                Politician takes 1 damage. The mediation fails.
              </motion.p>
              <motion.span
                className="stamp ml-auto block text-[clamp(1.7rem,4vw,2.5rem)]"
                initial={{ opacity: 0, scale: 2.2, rotate: -2 }}
                animate={{ opacity: 1, scale: 1, rotate: -7 }}
                transition={{ type: "spring", stiffness: 520, damping: 22 }}
                aria-hidden="true"
              >
                Pact broken
              </motion.span>
            </>
          )}
        </div>
      </div>

      <figcaption className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-faint">
        <span className="max-w-sm">An example round, written to show the rules. In a real match the agents write every line and choose every move.</span>
        {done && !reduce && (
          <button type="button" onClick={replay} className="text-ink-dim underline decoration-line-strong underline-offset-4 hover:text-ink">
            Play it again
          </button>
        )}
      </figcaption>
    </figure>
  );
}
