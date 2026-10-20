"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ArenaPayload } from "@/server/controller";
import type { Connection } from "@/components/StatusBits";

/**
 * Polls the server for the viewer-filtered arena payload. The UI renders only
 * this server state — nothing is simulated in the browser.
 */
export function useArena(matchId: string, omniscient: boolean) {
  const [data, setData] = useState<ArenaPayload | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}?omniscient=${omniscient ? 1 : 0}`, { cache: "no-store" });
      const body = (await res.json()) as ArenaPayload & { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        setConnection(res.status === 404 ? "offline" : "reconnecting");
        failures.current += 1;
        return res.status === 404 ? "stop" : "retry";
      }
      failures.current = 0;
      setData(body);
      setError(null);
      setConnection("live");
      setLastUpdated(Date.now());
      return body.view.phase === "complete" && body.status !== "running" ? "done" : "ok";
    } catch {
      failures.current += 1;
      setConnection(failures.current > 5 ? "offline" : "reconnecting");
      return "retry";
    }
  }, [matchId, omniscient]);

  const schedule = useCallback(
    (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        if (!alive.current) return;
        const r = await fetchOnce();
        if (!alive.current || r === "stop") return;
        if (r === "done") return schedule(15_000);
        const backoff = r === "retry" ? Math.min(10_000, 1000 * 2 ** Math.min(4, failures.current)) : document.hidden ? 4000 : 900;
        schedule(backoff);
      }, ms);
    },
    [fetchOnce],
  );

  useEffect(() => {
    alive.current = true;
    schedule(0);
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [schedule]);

  const refresh = useCallback(() => schedule(0), [schedule]);
  return { data, connection, error, setError, lastUpdated, refresh };
}
