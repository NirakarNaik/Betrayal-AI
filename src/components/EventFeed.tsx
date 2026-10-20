"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { GameEvent } from "@/game/types";
import { eventTone, TONE_CLASS } from "@/lib/ui";

const NOISY = new Set(["PHASE_CHANGED", "VOTE_CAST", "ACTION_COMMITTED", "MESSAGE_SENT", "OFFER_SENT", "MATCH_STARTED", "OBJECTIVE_ASSIGNED"]);

/** Verified engine events only. Agent statements never appear here. */
export function EventFeed({ events, title = "Verified events" }: { events: GameEvent[]; title?: string }) {
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => {
    const filtered = showAll ? events : events.filter((e) => !NOISY.has(e.type));
    return filtered.slice(-80).reverse();
  }, [events, showAll]);
  return (
    <section className="panel flex h-full min-h-0 flex-col" aria-label="Event feed">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="panel-title">{title}</h2>
        <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-ink-faint">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-violet-500" />
          All
        </label>
      </header>
      <ol className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-2" aria-live="polite">
        {list.length === 0 && <li className="p-1 text-xs text-ink-faint">No events yet.</li>}
        <AnimatePresence initial={false}>
          {list.map((e) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`border-l-2 py-1 pl-2 text-[12px] leading-snug ${TONE_CLASS[eventTone(e)]}`}
            >
              <span className="mr-1.5 font-mono text-[10px] text-ink-faint">R{e.round}</span>
              {e.visibility.scope === "private" && <span className="mr-1 font-mono text-[10px] uppercase text-violet-300">[private]</span>}
              {e.summary}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
