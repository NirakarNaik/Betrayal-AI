"use client";

import { memo, useState } from "react";
import { getRuleset } from "@/game/config";
import { ACTION_META } from "@/lib/ui";
import type { ActionType } from "@/game/types";

export const RulesPanel = memo(function RulesPanel({ rulesetId, defaultOpen = false }: { rulesetId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const r = getRuleset(rulesetId);
  const cost = (a: ActionType) => {
    const c = r.actions[a];
    return [c.credits ? `${c.credits} cr` : null, c.intel ? `${c.intel} intel` : null, c.influence ? `${c.influence} inf` : null].filter(Boolean).join(" + ") || (a === "trade" ? "amount" : "free");
  };
  return (
    <section className="panel" aria-label="Rules">
      <button className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-title">Rules · {r.name}</span>
        <span className="font-mono text-xs text-ink-faint">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2.5 text-[12px] leading-relaxed text-ink-dim">
          <p>
            {r.maxRounds} rounds of <b className="text-ink">Negotiation → Secret Commitment → Resolution → Reveal</b>. Elimination votes after rounds {r.voting.afterRounds.join(", ")} — a strict majority of living players
            eliminates; ties do nothing.
          </p>
          <p>
            Start: {r.start.health} health, {r.start.credits} credits, {r.start.intel} intel, {r.start.influence} influence. Up to {r.negotiation.maxMessagesPerRound} messages per round; private offers escrow up to{" "}
            {r.negotiation.maxOfferCredits} credits and may propose a pact for this round and the next.
          </p>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
              <li key={a}>
                <b style={{ color: ACTION_META[a].tone }}>{ACTION_META[a].label}</b> <span className="font-mono text-[10px] text-ink-faint">({cost(a)})</span> — {ACTION_META[a].blurb}
              </li>
            ))}
          </ul>
          <p>Resolution order: costs → guards → intel → sabotage, then income → simultaneous strikes → mediation → eliminations. Attacking or voting against an active pact partner publicly breaks the pact.</p>
          <p>
            Ranking: survivors first, then Protocol Score ({r.scoring.objectiveBonus} for a completed secret objective + influence + health + credits/{r.scoring.creditsPerPoint}), then credits, health and a seeded tie-break.
          </p>
        </div>
      )}
    </section>
  );
});
