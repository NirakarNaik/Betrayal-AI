import type { Phase } from "@/game/types";
import { PHASE_LABEL } from "@/lib/ui";

const PHASES: Phase[] = ["negotiation", "commitment", "reveal", "voting"];

export function RoundTimeline({ round, maxRounds, phase, votingRounds }: { round: number; maxRounds: number; phase: Phase; votingRounds: number[] }) {
  const complete = phase === "complete";
  return (
    <div className="flex flex-col gap-1.5" aria-label={`Round ${round} of ${maxRounds}, ${PHASE_LABEL[phase]}`}>
      <div className="flex items-center gap-1">
        {Array.from({ length: maxRounds }, (_, i) => {
          const r = i + 1;
          const state = complete || r < round ? "done" : r === round ? "current" : "future";
          return (
            <div key={r} className="flex items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center border font-mono text-[11px] ${
                  state === "current" ? "border-violet-400 bg-violet-500/25 text-white" : state === "done" ? "border-line-strong bg-surface-3 text-ink-dim" : "border-line text-ink-faint"
                }`}
              >
                {r}
              </div>
              {votingRounds.includes(r) && <span className={`text-[10px] ${state === "future" ? "text-ink-faint" : "text-rose-400"}`} title="Elimination vote">⚑</span>}
            </div>
          );
        })}
      </div>
      {!complete && (
        <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider">
          {PHASES.filter((p) => p !== "voting" || votingRounds.includes(round)).map((p) => {
            const active = phase === p || (p === "reveal" && phase === "resolution");
            return (
              <span key={p} className={`rounded-[2px] px-1.5 py-0.5 ${active ? "bg-cyan-400/15 text-cyan-300" : "text-ink-faint"}`}>
                {p === "commitment" ? "commit" : p}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
