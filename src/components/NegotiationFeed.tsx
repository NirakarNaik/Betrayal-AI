"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { Message } from "@/game/types";
import type { PlayerView } from "@/game/visibility";
import { playerColor } from "@/lib/ui";

/**
 * Negotiation feed. Every message is an AGENT STATEMENT — unverified and
 * non-binding. Only the event feed shows verified facts.
 */
export function NegotiationFeed({
  messages,
  players,
  selfId,
  round,
  omniscient,
}: {
  messages: Message[];
  players: PlayerView[];
  selfId: string | null;
  round: number;
  omniscient: boolean;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the feed container, never the page.
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <section className="panel flex h-full min-h-0 flex-col" aria-label="Negotiation feed">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="panel-title">Negotiation</h2>
        <span className="font-mono text-[10px] uppercase text-ink-faint">Statements · unverified</span>
      </header>
      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {messages.length === 0 && <p className="text-xs text-ink-faint">No messages yet. Negotiation opens each round.</p>}
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const from = byId.get(m.fromId);
            const to = m.toId ? byId.get(m.toId) : null;
            const isPrivate = m.toId !== null;
            const involvesMe = selfId !== null && (m.fromId === selfId || m.toId === selfId);
            const color = from ? playerColor(from) : "#999";
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`rounded-[4px] border px-2.5 py-2 ${isPrivate ? "border-dashed border-violet-400/50 bg-violet-950/25" : "border-line bg-surface-2/70"} ${m.round !== round ? "opacity-55" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-display font-bold" style={{ color }}>
                    {from?.name ?? m.fromId}
                  </span>
                  {isPrivate && (
                    <>
                      <span className="text-ink-faint">→</span>
                      <span className="font-display font-bold" style={{ color: to ? playerColor(to) : undefined }}>
                        {to?.name ?? m.toId}
                      </span>
                      <span className={`chip ${involvesMe ? "border-violet-300 text-violet-200" : "border-violet-400/40 text-violet-300/80"}`}>
                        {involvesMe ? "Private · to you" : omniscient ? "Private · intercepted" : "Private"}
                      </span>
                    </>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-ink-faint">R{m.round}</span>
                </div>
                <p className="mt-1 text-[13px] leading-snug text-ink">
                  <span className="sr-only">Agent statement: </span>“{m.text}”
                </p>
                {(m.offerCredits > 0 || m.proposePact) && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase">
                    {m.offerCredits > 0 && <span className="chip border-amber-400/50 text-amber-200">{m.offerCredits} cr in escrow</span>}
                    {m.proposePact && <span className="chip border-emerald-400/50 text-emerald-200">Pact proposal</span>}
                    <span
                      className={`chip ${
                        m.offerStatus === "accepted" ? "border-emerald-400/60 text-emerald-300" : m.offerStatus === "pending" ? "border-cyan-400/50 text-cyan-200" : "border-line-strong text-ink-faint"
                      }`}
                    >
                      {m.offerStatus}
                    </span>
                  </p>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
