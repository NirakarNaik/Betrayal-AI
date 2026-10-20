import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PERSONALITY_IDS } from "@/agents/personalities";
import { createBrains } from "@/server/brains";
import { MatchSession } from "@/server/session";
import { FileStore, VersionConflictError } from "@/server/store";
import { aggregateTournament, rotatedLineup, summarizeMatch, wilson } from "@/server/tournament-stats";
import type { MatchResultSummary } from "@/server/tournament-types";

async function playDemo(seed: number, index: number): Promise<MatchResultSummary> {
  const lineup = rotatedLineup(PERSONALITY_IDS, index, true);
  const session = MatchSession.create({
    setup: { id: `t_${seed}`, seed, rulesetId: "standard-v1", mode: "spectator", at: 0, players: lineup.map((pid, i) => ({ id: `p${i + 1}`, name: pid, kind: "ai" as const, personalityId: pid })) },
    agentMode: "demo",
    speed: "accelerated",
    humanTokenHash: null,
    tournamentId: "t",
    now: 0,
  });
  await session.runToCompletion(createBrains(session.state, "demo", null), { now: () => 0 });
  return summarizeMatch(session.state, session.snap.usage, "completed", 1, null);
}

describe("tournament aggregation", () => {
  it("rotates seats so every personality plays every seat", () => {
    const seats = new Map<string, Set<number>>();
    for (let i = 0; i < 5; i++) rotatedLineup(PERSONALITY_IDS, i, true).forEach((p, seat) => (seats.get(p) ?? seats.set(p, new Set()).get(p)!).add(seat));
    for (const s of seats.values()) expect(s.size).toBe(5);
  });

  it("aggregates only completed matches and computes consistent statistics", async () => {
    const matches = await Promise.all([0, 1, 2, 3, 4].map((i) => playDemo(100 + i, i)));
    const failed: MatchResultSummary = { matchId: "f", seed: 1, status: "failed", attempts: 2, terminal: null, players: [], usage: { calls: 3, costUsd: 0.01 }, error: "boom" };
    const agg = aggregateTournament([...matches, failed], PERSONALITY_IDS);
    expect(agg.completed).toBe(5);
    expect(agg.failed).toBe(1);
    const totalWins = agg.byPersonality.reduce((s, p) => s + p.wins, 0);
    expect(totalWins).toBe(5);
    for (const p of agg.byPersonality) {
      expect(p.n).toBe(5);
      expect(p.avgPlacement).toBeGreaterThanOrEqual(1);
      expect(p.avgPlacement).toBeLessThanOrEqual(5);
      expect(p.winRateCI[0]).toBeLessThanOrEqual(p.winRate);
      expect(p.winRateCI[1]).toBeGreaterThanOrEqual(p.winRate);
    }
    const avgPlace = agg.byPersonality.reduce((s, p) => s + p.avgPlacement, 0) / 5;
    expect(avgPlace).toBeCloseTo(3, 5);
    expect(agg.totalCostUsd).toBeCloseTo(0.01);
  });

  it("wilson interval behaves at the edges", () => {
    expect(wilson(0, 0)).toEqual([0, 0]);
    const [lo, hi] = wilson(1, 1);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBe(1);
  });
});

describe("file store", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "afc-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("persists sessions, rebuilds them by replay and rejects stale writes", async () => {
    const store = new FileStore(dir);
    const session = MatchSession.create({
      setup: { id: "m_store", seed: 5, rulesetId: "blitz-v1", mode: "spectator", at: 0, players: PERSONALITY_IDS.map((pid, i) => ({ id: `p${i + 1}`, name: pid, kind: "ai" as const, personalityId: pid })) },
      agentMode: "demo",
      speed: "accelerated",
      humanTokenHash: null,
      tournamentId: null,
      now: 0,
    });
    await session.runToCompletion(createBrains(session.state, "demo", null), { now: () => 0 });
    session.snap.status = "completed";
    const stale = structuredClone(session.snap);
    await store.saveSession(session.snap, session.state);
    const loaded = await store.loadSession("m_store");
    expect(loaded).not.toBeNull();
    const restored = MatchSession.restore(loaded!);
    expect(restored.state.terminal).toEqual(session.state.terminal);
    await expect(store.saveSession(stale, session.state)).rejects.toBeInstanceOf(VersionConflictError);
    const list = await store.listMatches(10);
    expect(list[0]!.id).toBe("m_store");
    expect(list[0]!.winnerName).toBeTruthy();
    expect(await store.loadSession("../etc/passwd")).toBeNull();
  });
});
