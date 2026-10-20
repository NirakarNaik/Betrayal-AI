import { describe, expect, it } from "vitest";
import { STANDARD_RULESET } from "@/game/config";
import { OBJECTIVE_DEFS, evaluateObjective } from "@/game/objectives";
import type { MatchState, ObjectiveKind } from "@/game/types";
import { apply, newMatch, player, playRound, withPlayer } from "./helpers";

const R = STANDARD_RULESET;

function giveObjective(s: MatchState, id: string, kind: ObjectiveKind, rivalId: string | null = null): MatchState {
  const def = OBJECTIVE_DEFS[kind];
  return withPlayer(s, id, { objective: { kind, category: def.category, title: def.title, description: def.describe(null), rivalId } });
}

const status = (s: MatchState, id: string, final = true) => evaluateObjective(s, player(s, id), R, final).status;

describe("secret objectives", () => {
  it("hoarder: survive with the most credits", () => {
    let s = giveObjective(newMatch(), "p1", "hoarder");
    s = withPlayer(s, "p1", { credits: 15 });
    expect(status(s, "p1")).toBe("completed");
    s = withPlayer(s, "p2", { credits: 16 });
    expect(status(s, "p1")).toBe("failed");
    expect(status(s, "p1", false)).toBe("in_progress");
  });

  it("pacifist: fails once a strike resolves, even if blocked", () => {
    let s = giveObjective(newMatch(), "p1", "pacifist");
    expect(status(s, "p1")).toBe("completed");
    s = playRound(s, { p1: { action: "strike", targetId: "p2" }, p2: { action: "guard" } });
    expect(status(s, "p1")).toBe("failed");
  });

  it("dealmaker: two completed trades lock the objective", () => {
    let s = giveObjective(newMatch(), "p1", "dealmaker");
    s = playRound(s, { p1: { action: "trade", targetId: "p2", amount: 1 } });
    expect(status(s, "p1", false)).toBe("in_progress");
    s = apply(s, { kind: "advance", at: 1 });
    s = apply(s, { kind: "message", playerId: "p3", message: { toId: "p1", text: "gift", offerCredits: 1 }, at: 2 });
    s = apply(s, { kind: "respond_offer", playerId: "p1", messageId: s.messages.at(-1)!.id, accept: true, at: 2 });
    expect(status(s, "p1", false)).toBe("completed");
  });

  it("nemesis: rival must fall with your contribution", () => {
    let s = giveObjective(newMatch(), "p1", "nemesis", "p2");
    s = withPlayer(s, "p2", { health: 1 });
    s = playRound(s, { p3: { action: "strike", targetId: "p2" } });
    expect(status(s, "p1")).toBe("failed");

    let t = giveObjective(newMatch(), "p1", "nemesis", "p2");
    t = withPlayer(t, "p2", { health: 1 });
    t = playRound(t, { p1: { action: "strike", targetId: "p2" } });
    expect(status(t, "p1")).toBe("completed");
  });

  it("survivor and iron wall", () => {
    let s = giveObjective(giveObjective(newMatch(), "p1", "survivor"), "p2", "iron_wall");
    expect(status(s, "p1")).toBe("completed");
    expect(status(s, "p2")).toBe("completed");
    s = playRound(s, { p3: { action: "strike", targetId: "p2" } });
    expect(status(s, "p2")).toBe("failed");
    s = withPlayer(s, "p1", { alive: false });
    expect(status(s, "p1")).toBe("failed");
  });

  it("clean hands voter: never vote for a survivor", () => {
    let s = giveObjective(newMatch(), "p1", "clean_hands_voter");
    expect(status(s, "p1")).toBe("failed"); // no votes cast
    s = withPlayer(s, "p1", { stats: { ...player(s, "p1").stats, votesCast: [{ round: 2, targetId: "p2" }] } });
    expect(status(s, "p1")).toBe("failed");
    s = withPlayer(s, "p2", { alive: false });
    expect(status(s, "p1")).toBe("completed");
  });

  it("spymaster: investigate two different players", () => {
    let s = giveObjective(newMatch(), "p1", "spymaster");
    s = withPlayer(s, "p1", { intel: 5 });
    s = playRound(s, { p1: { action: "investigate", targetId: "p2" } });
    expect(status(s, "p1", false)).toBe("in_progress");
    s = apply(s, { kind: "advance", at: 1 });
    s = playRound(s, { p1: { action: "investigate", targetId: "p3" } });
    expect(status(s, "p1", false)).toBe("completed");
  });

  it("influencer: reach 2 influence", () => {
    let s = giveObjective(newMatch(), "p1", "influencer");
    expect(status(s, "p1")).toBe("failed");
    s = withPlayer(s, "p1", { influence: 2 });
    expect(status(s, "p1")).toBe("completed");
  });

  it("every objective kind is feasible to evaluate on a fresh match", () => {
    for (const kind of Object.keys(OBJECTIVE_DEFS) as ObjectiveKind[]) {
      const s = giveObjective(newMatch(), "p1", kind, kind === "nemesis" ? "p2" : null);
      expect(["completed", "failed", "in_progress"]).toContain(status(s, "p1", false));
    }
  });
});
