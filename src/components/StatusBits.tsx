"use client";

import { AnimatePresence, motion } from "framer-motion";
import { memo } from "react";
import type { UsageSummary } from "@/llm/usage";
import { fmtUsd } from "@/lib/ui";

export type Connection = "connecting" | "live" | "reconnecting" | "offline";

export function ConnectionStatus({ state, lastUpdated }: { state: Connection; lastUpdated: number | null }) {
  const meta: Record<Connection, { label: string; dot: string }> = {
    connecting: { label: "Connecting", dot: "bg-amber-400 animate-pulse" },
    live: { label: "Live", dot: "bg-emerald-400" },
    reconnecting: { label: "Reconnecting", dot: "bg-amber-400 animate-pulse" },
    offline: { label: "Offline", dot: "bg-rose-500" },
  };
  return (
    <span className="chip border-line-strong text-ink-dim" role="status" aria-live="polite" title={lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : undefined}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta[state].dot}`} />
      {meta[state].label}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: "live" | "demo" }) {
  return mode === "live" ? (
    <span className="chip border-cyan-400/60 text-cyan-300" title="Agents are making real Claude API calls">
      ◉ Live API
    </span>
  ) : (
    <span className="chip border-amber-400/60 text-amber-300" title="No API calls: deterministic heuristic demo agents">
      ◌ Local demo agents
    </span>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          role="alert"
          className="flex items-start justify-between gap-3 border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200"
        >
          <span>{message}</span>
          {onDismiss && (
            <button onClick={onDismiss} className="font-mono text-xs uppercase text-rose-300 hover:text-white" aria-label="Dismiss error">
              ✕
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const UsageMeter = memo(function UsageMeter({ usage, agentMode, limitUsd }: { usage: UsageSummary; agentMode: "live" | "demo"; limitUsd?: number | null }) {
  if (agentMode === "demo") {
    return (
      <div className="panel p-3">
        <h2 className="panel-title">Model usage</h2>
        <p className="mt-1.5 text-xs text-ink-faint">Local demo mode — no API calls are made and no cost is incurred.</p>
      </div>
    );
  }
  const models = Object.entries(usage.byModel);
  return (
    <div className="panel p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="panel-title">Model usage</h2>
        <span className="font-mono text-sm text-cyan-300">{fmtUsd(usage.costUsd)}</span>
      </div>
      {limitUsd ? (
        <div className="mt-2 h-1 overflow-hidden bg-line">
          <div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, (usage.costUsd / limitUsd) * 100)}%` }} />
        </div>
      ) : null}
      <dl className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
        <div>
          <dt className="text-ink-faint">Calls</dt>
          <dd>{usage.calls}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">In tok</dt>
          <dd>{usage.inputTokens.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Out tok</dt>
          <dd>{usage.outputTokens.toLocaleString()}</dd>
        </div>
      </dl>
      {models.length > 0 && (
        <ul className="mt-2 space-y-0.5 font-mono text-[10px] text-ink-faint">
          {models.map(([m, v]) => (
            <li key={m} className="flex justify-between">
              <span className="truncate">{m}</span>
              <span>
                {v.calls}× · {fmtUsd(v.costUsd)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {usage.failures > 0 && <p className="mt-1 text-[10px] text-amber-300">{usage.failures} non-successful request(s) recorded</p>}
      <p className="mt-1.5 text-[10px] text-ink-faint">Costs are estimates from SDK-reported tokens and the configured pricing table.</p>
    </div>
  );
});
