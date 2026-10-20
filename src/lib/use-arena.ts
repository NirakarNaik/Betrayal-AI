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
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchOnce(): Promise<"ok" | "done" | "retry" | "stop"> {
      try {
        const res = await fetch(`/api/matches/${matchId}?omniscient=${omniscient ? 1 : 0}`, { cache: "no-store" });
        const body = (await res.json()) as ArenaPayload & { error?: string };
        if (!alive) return "stop";
        if (!res.ok) {
          failures += 1;
          setError(body.error ?? `Request failed (${res.status})`);
          setConnection(res.status === 404 ? "offline" : "reconnecting");
          return res.status === 404 ? "stop" : "retry";
        }
        failures = 0;
        setData(body);
        setError(null);
        setConnection("live");
        setLastUpdated(Date.now());
        return body.view.phase === "complete" && body.status !== "running" ? "done" : "ok";
      } catch {
        failures += 1;
        if (alive) setConnection(failures > 5 ? "offline" : "reconnecting");
        return "retry";
      }
    }

    function schedule(ms: number) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const r = await fetchOnce();
        if (!alive || r === "stop") return;
        if (r === "done") return schedule(15_000);
        schedule(r === "retry" ? Math.min(10_000, 1000 * 2 ** Math.min(4, failures)) : document.hidden ? 4000 : 900);
      }, ms);
    }

    kick.current = () => schedule(0);
    schedule(0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [matchId, omniscient]);

  const refresh = useCallback(() => kick.current(), []);
  return { data, connection, error, setError, lastUpdated, refresh };
}
