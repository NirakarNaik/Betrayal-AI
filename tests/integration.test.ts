import { describe, expect, it } from "vitest";
import { ClaudeBrain } from "@/agents/claude-brain";
import { HeuristicBrain } from "@/agents/heuristic";
import { COMMIT_JSON_SCHEMA } from "@/agents/schema";
import { replayMatch, eventFingerprint } from "@/game/replay";
import { buildView } from "@/game/visibility";
import { TransportError } from "@/llm/gateway";
import { createBrains } from "@/server/brains";
import { MatchSession } from "@/server/session";
import { mockGateway, scriptedResponder } from "./mock-transport";
import { setup } from "./helpers";

let clock = 1_000;
const now = () => (clock += 10);

function spectatorSession(seed = 42) {
  return MatchSession.create({ setup: setup({ id: `m_${seed}`, seed }), agentMode: "live", speed: "accelerated", humanTokenHash: null, tournamentId: null, now: now() });
}

function humanSession(seed = 7) {
  const base = setup({ id: `h_${seed}`, seed, mode: "human" });
  base.players[0] = { id: "p1", name: "You", kind: "human", personalityId: null };
  return MatchSession.create({ setup: base, agentMode: "demo", speed: "accelerated", humanTokenHash: "x", tournamentId: null, now: now() });
}

describe("AI-versus-AI match with mocked Claude responses", () => {
  it("completes with structured decisions, recorded usage and a code-computed winner", async () => {
    const { gateway, transport } = mockGateway(scriptedResponder);
    const session = spectatorSession();
    await session.runToCompletion(createBrains(session.state, "live", gateway), { now });
    const s = session.state;
    expect(s.phase).toBe("complete");
    expect(s.terminal?.reason).toBeTruthy();
    expect(s.terminal?.winnerId).toBeTruthy();
    expect(transport.calls.length).toBeGreaterThan(20);
    expect(session.snap.usage.length).toBe(transport.calls.length);
    expect(session.snap.usage.every((u) => u.inputTokens === 1000 && u.estimatedCostUsd > 0)).toBe(true);
    const modelCommits = s.actionHistory.filter((a) => a.source === "model");
    expect(modelCommits.length).toBeGreaterThan(10);
    expect(s.events.some((e) => e.type === "ATTACK_RESOLVED")).toBe(true);
    expect(s.events.some((e) => e.type === "PACT_FORMED")).toBe(true);
  });

  it("escalates critical decisions (votes) to the strategic model", async () => {
    const { gateway, transport } = mockGateway(scriptedResponder);
    const session = spectatorSession(3);
    await session.runToCompletion(createBrains(session.state, "live", gateway), { now });
    const models = new Set(transport.calls.map((c) => c.model));
    expect(models.has("claude-haiku-4-5")).toBe(true);
    expect(models.has("claude-opus-5-5")).toBe(true);
    expect(session.snap.usage.some((u) => u.escalated && u.purpose === "vote")).toBe(true);
  });
});

describe("invalid Claude output and fallback", () => {
  it("retries once with a validation error, then falls back to a legal action", async () => {
    const { gateway, transport } = mockGateway((req) => {
      if (req.schema === COMMIT_JSON_SCHEMA) {
        return JSON.stringify({ offerResponses: [], action: "strike", targetId: /YOU ARE (p\d)/.exec(req.user)![1], amount: null, message: null, decisionSummary: "self hit", beliefs: [] });
      }
      return "not json at all";
    });
    const session = spectatorSession(5);
    const brain = new ClaudeBrain(gateway);
    await session.step({ p1: brain, p2: brain, p3: brain, p4: brain, p5: brain }, { now }); // p? negotiation (invalid → no messages)
    expect(session.snap.decisions[0]!.source).toBe("fallback");
    // Finish negotiation then commitment.
    for (let i = 0; i < 6 && session.state.phase !== "reveal"; i++) await session.step({ p1: brain, p2: brain, p3: brain, p4: brain, p5: brain }, { now });
    const commits = session.snap.decisions.filter((d) => d.phase === "commitment");
    expect(commits).toHaveLength(5);
    for (const c of commits) {
      expect(c.source).toBe("fallback");
      expect(c.attempts).toBe(2);
      expect(c.errors[0]).toMatch(/target yourself/);
    }
    const retryPrompts = transport.calls.filter((c) => c.user.includes("YOUR PREVIOUS ANSWER WAS INVALID"));
    expect(retryPrompts).toHaveLength(5);
    expect(session.state.events.filter((e) => e.type === "ACTION_FALLBACK")).toHaveLength(5);
    expect(session.state.actionHistory.every((a) => a.proposal.action === "recover")).toBe(true);
  });

  it("rejects schema-valid but illegal actions (unaffordable)", async () => {
    const { gateway } = mockGateway(() =>
      JSON.stringify({ offerResponses: [], action: "trade", targetId: "p2", amount: 999, message: null, decisionSummary: "all in", beliefs: [] }),
    );
    const session = spectatorSession(6);
    session.apply({ kind: "advance", at: now(), force: true });
    const d = await new ClaudeBrain(gateway).commit(session.observation("p1"));
    expect(d.meta.source).toBe("fallback");
    expect(d.decision.proposal).toEqual({ action: "recover" });
    expect(d.meta.errors.join(" ")).toMatch(/Needs 999 credits/);
  });
});

describe("model timeout and retry handling", () => {
  it("retries transient timeouts with backoff and records each attempt", async () => {
    const { gateway, transport } = mockGateway((req, call) =>
      call <= 2 ? new TransportError("Request timed out", "timeout") : scriptedResponder(req, call),
    );
    const session = spectatorSession(8);
    session.apply({ kind: "advance", at: now(), force: true });
    const d = await new ClaudeBrain(gateway).commit(session.observation("p1"));
    expect(transport.calls).toHaveLength(3);
    expect(d.meta.source).toBe("model");
    expect(d.meta.usage.map((u) => u.outcome)).toEqual(["timeout", "timeout", "success"]);
  }, 10_000);

  it("does not retry non-transient client errors and falls back", async () => {
    const { gateway, transport } = mockGateway(() => new TransportError("API error 400", "client"));
    const session = spectatorSession(9);
    session.apply({ kind: "advance", at: now(), force: true });
    const d = await new ClaudeBrain(gateway).commit(session.observation("p1"));
    expect(transport.calls).toHaveLength(1);
    expect(d.meta.source).toBe("fallback");
  });

  it("stops after bounded retries", async () => {
    const { gateway, transport } = mockGateway(() => new TransportError("Server error 529", "server"), { maxRetries: 1 });
    const session = spectatorSession(10);
    session.apply({ kind: "advance", at: now(), force: true });
    await new ClaudeBrain(gateway).commit(session.observation("p1"));
    expect(transport.calls).toHaveLength(2);
  }, 10_000);
});

describe("API budget exhaustion", () => {
  it("blocks requests past the match budget and hands control to the labelled demo brain", async () => {
    const { gateway, transport } = mockGateway(scriptedResponder, { matchBudgetUsd: 0.02 });
    const session = spectatorSession(11);
    await session.runToCompletion(createBrains(session.state, "live", gateway), { now });
    expect(session.state.phase).toBe("complete");
    const blocked = session.snap.usage.filter((u) => u.outcome === "budget_blocked");
    expect(blocked.length).toBeGreaterThan(0);
    expect(session.snap.decisions.some((d) => d.source === "heuristic")).toBe(true);
    const spent = session.snap.usage.reduce((s, u) => s + u.estimatedCostUsd, 0);
    expect(spent).toBeLessThanOrEqual(0.02 + 1e-9);
    expect(transport.calls.length).toBeLessThan(20);
  });

  it("engages the global kill switch", async () => {
    const { gateway } = mockGateway(scriptedResponder, { globalBudgetUsd: 0.005 });
    gateway.budget.record(null, 0.005);
    expect(gateway.budget.status().killSwitch).toBe(true);
    const r = await gateway.request({ matchId: "x", tournamentId: null, playerId: "p1", purpose: "vote", model: "claude-haiku-4-5", escalated: false, system: "s", user: "u", schema: {}, maxTokens: 10, effort: null });
    expect(r.outcome).toBe("budget_blocked");
  });
});

describe("private information isolation", () => {
  it("agent prompts never include other players' objectives or private messages", async () => {
    const { gateway, transport } = mockGateway(scriptedResponder);
    const session = spectatorSession(12);
    await session.runToCompletion(createBrains(session.state, "live", gateway), { now });
    const s = session.state;
    for (const call of transport.calls) {
      const me = /YOU ARE (p\d)/.exec(call.user)![1]!;
      for (const p of s.players) {
        if (p.id === me) continue;
        expect(call.user).not.toContain(p.objective.description);
      }
      const foreignPrivate = s.messages.filter((m) => m.toId && m.fromId !== me && m.toId !== me);
      for (const m of foreignPrivate) expect(call.user).not.toContain(`${m.fromId} → ${m.toId} (private)`);
    }
  });

  it("player and spectator views are filtered server-side", () => {
    const session = humanSession();
    session.apply({ kind: "message", playerId: "p2", message: { toId: "p3", text: "secret plan", offerCredits: 1 }, at: now() });
    const human = buildView(session.state, { kind: "player", playerId: "p1" }, true);
    expect(human.omniscient).toBe(false);
    expect(human.players.filter((p) => p.objective !== null).map((p) => p.id)).toEqual(["p1"]);
    expect(human.messages.some((m) => m.text === "secret plan")).toBe(false);
    expect(JSON.stringify(human.events)).not.toContain("secret plan");
    // Spectators of a human match are never omniscient.
    const spec = buildView(session.state, { kind: "spectator" }, true);
    expect(spec.omniscient).toBe(false);
    expect(spec.players.every((p) => p.objective === null)).toBe(true);
    // Committed actions stay hidden until resolution.
    session.apply({ kind: "advance", at: now(), force: true });
    session.apply({ kind: "commit", playerId: "p2", proposal: { action: "strike", targetId: "p1" }, source: "model", decisionSummary: "hit p1", at: now() });
    const mid = buildView(session.state, { kind: "player", playerId: "p1" }, false);
    expect(JSON.stringify(mid)).not.toContain("hit p1");
    expect(mid.players.find((p) => p.id === "p2")!.hasCommitted).toBe(true);
    expect(mid.actionHistory).toHaveLength(0);
  });

  it("all-AI spectator matches can be omniscient", () => {
    const session = spectatorSession(13);
    const v = buildView(session.state, { kind: "spectator" }, true);
    expect(v.omniscient).toBe(true);
    expect(v.players.every((p) => p.objective !== null)).toBe(true);
  });
});

describe("human joins and completes a match", () => {
  it("human inputs are validated and the match completes", async () => {
    const session = humanSession(21);
    const brains = createBrains(session.state, "demo", null);
    expect(Object.keys(brains)).toEqual(["p2", "p3", "p4", "p5"]);
    let guard = 0;
    while (session.state.phase !== "complete" && guard++ < 400) {
      const r = await session.step(brains, { now });
      if (r.kind !== "waiting_human") continue;
      const s = session.state;
      if (s.phase === "negotiation") {
        const bad = session.apply({ kind: "message", playerId: "p1", message: { toId: "p1", text: "me" }, at: now() });
        expect(bad.ok).toBe(false);
        session.apply({ kind: "message", playerId: "p1", message: { toId: null, text: "I come in peace." }, at: now() });
        session.apply({ kind: "end_negotiation", playerId: "p1", at: now() });
      } else if (s.phase === "commitment") {
        const view = buildView(s, { kind: "player", playerId: "p1" }, false);
        for (const o of view.self!.pendingOffers) session.apply({ kind: "respond_offer", playerId: "p1", messageId: o.id, accept: true, at: now() });
        const forged = session.apply({ kind: "commit", playerId: "p1", proposal: { action: "trade", targetId: "p2", amount: 500 }, source: "human", decisionSummary: null, at: now() });
        expect(forged.ok).toBe(false);
        const strike = view.self!.legalActions.find((a) => a.action === "strike" && a.affordable);
        const proposal = strike && s.round % 2 === 0 ? { action: "strike" as const, targetId: strike.validTargets[0]! } : { action: "guard" as const };
        expect(session.apply({ kind: "commit", playerId: "p1", proposal, source: "human", decisionSummary: null, at: now() }).ok).toBe(true);
        expect(session.apply({ kind: "commit", playerId: "p1", proposal: { action: "recover" }, source: "human", decisionSummary: null, at: now() }).ok).toBe(false);
      } else if (s.phase === "voting") {
        session.apply({ kind: "vote", playerId: "p1", targetId: null, at: now() });
      }
    }
    expect(session.state.phase).toBe("complete");
    expect(session.state.terminal!.placements).toHaveLength(5);
  });

  it("a human who times out receives the documented defaults", async () => {
    const session = humanSession(22);
    const brains = createBrains(session.state, "demo", null);
    await session.runToCompletion(brains, { now });
    expect(session.state.phase).toBe("complete");
    expect(session.state.actionHistory.filter((a) => a.playerId === "p1").every((a) => a.source === "fallback")).toBe(true);
  });
});

describe("replay consistency", () => {
  it("replaying recorded inputs reproduces the exact event log without model calls", async () => {
    const { gateway, transport } = mockGateway(scriptedResponder);
    const session = spectatorSession(31);
    await session.runToCompletion(createBrains(session.state, "live", gateway), { now });
    const callsBefore = transport.calls.length;
    const replayed = replayMatch({ setup: session.snap.setup, inputs: session.snap.inputs });
    expect(transport.calls.length).toBe(callsBefore);
    expect(eventFingerprint(replayed.events)).toBe(eventFingerprint(session.state.events));
    expect(replayed.terminal).toEqual(session.state.terminal);
    const restored = MatchSession.restore(structuredClone(session.snap));
    expect(restored.state.terminal).toEqual(session.state.terminal);
  });

  it("heuristic demo matches are fully deterministic for a seed", async () => {
    const a = spectatorSession(77);
    const b = spectatorSession(77);
    await a.runToCompletion(createBrains(a.state, "demo", null), { now: () => 0 });
    await b.runToCompletion(createBrains(b.state, "demo", null), { now: () => 0 });
    expect(eventFingerprint(a.state.events)).toBe(eventFingerprint(b.state.events));
    expect(new HeuristicBrain().kind).toBe("heuristic");
  });
});
