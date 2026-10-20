import { describe, expect, it } from "vitest";
import { STANDARD_RULESET } from "@/game/config";
import { applyInput } from "@/game/engine";
import { createInitialState } from "@/game/initial-state";
import { getLegalActions, validateProposal } from "@/game/legal-actions";
import { nextFloat, normalizeSeed, shuffle } from "@/game/random";
import { apply, eventsOf, newMatch, player, playRound, setup, toCommitment, withPlayer } from "./helpers";

const R = STANDARD_RULESET;

describe("setup", () => {
  it("creates five players with default resources and distinct objectives", () => {
    const s = newMatch();
    expect(s.players).toHaveLength(5);
    for (const p of s.players) {
      expect(p).toMatchObject({ health: 3, credits: 10, intel: 2, influence: 1, alive: true });
    }
    expect(new Set(s.players.map((p) => p.objective.kind)).size).toBe(5);
    const nemesis = s.players.find((p) => p.objective.kind === "nemesis");
    if (nemesis) expect(nemesis.objective.rivalId).not.toBe(nemesis.id);
  });

  it("rejects invalid player configurations", () => {
    expect(() => createInitialState(setup({ players: setup().players.slice(0, 4) }))).toThrow();
    expect(() => createInitialState(setup({ mode: "human" }))).toThrow(/exactly one human/);
  });
});

describe("seeded reproducibility", () => {
  it("same seed gives same objectives; different seed differs somewhere", () => {
    const a = newMatch({ seed: 99 });
    const b = newMatch({ seed: 99 });
    expect(a.players.map((p) => p.objective)).toEqual(b.players.map((p) => p.objective));
    const outcomes = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(newMatch({ seed }).players.map((p) => p.objective.kind))));
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("PRNG is deterministic", () => {
    const r1 = { state: normalizeSeed(7) };
    const r2 = { state: normalizeSeed(7) };
    expect([nextFloat(r1), nextFloat(r1)]).toEqual([nextFloat(r2), nextFloat(r2)]);
    expect(shuffle({ state: 5 }, [1, 2, 3, 4, 5])).toEqual(shuffle({ state: 5 }, [1, 2, 3, 4, 5]));
  });
});

describe("legal actions", () => {
  it.each([
    ["strike", { action: "strike", targetId: "p2" }],
    ["guard", { action: "guard" }],
    ["scout", { action: "scout" }],
    ["investigate", { action: "investigate", targetId: "p2" }],
    ["sabotage", { action: "sabotage", targetId: "p2" }],
    ["trade", { action: "trade", targetId: "p2", amount: 3 }],
    ["mediate", { action: "mediate", targetId: "p2" }],
    ["recover", { action: "recover" }],
  ] as const)("%s is legal with default resources", (_n, proposal) => {
    const s = toCommitment(newMatch());
    expect(validateProposal(s, "p1", proposal, R)).toEqual({ ok: true, error: null });
  });

  it("rejects self-targeting for every targeted action", () => {
    const s = toCommitment(newMatch());
    for (const action of ["strike", "investigate", "sabotage", "mediate"] as const) {
      expect(validateProposal(s, "p1", { action, targetId: "p1" }, R).error).toMatch(/yourself/);
    }
    expect(validateProposal(s, "p1", { action: "trade", targetId: "p1", amount: 1 }, R).error).toMatch(/yourself/);
  });

  it("rejects unknown and eliminated targets", () => {
    let s = toCommitment(newMatch());
    expect(validateProposal(s, "p1", { action: "strike", targetId: "zz" }, R).error).toMatch(/Unknown target/);
    s = withPlayer(s, "p2", { alive: false });
    expect(validateProposal(s, "p1", { action: "strike", targetId: "p2" }, R).error).toMatch(/eliminated/);
  });

  it("rejects insufficient resources", () => {
    let s = toCommitment(newMatch());
    s = withPlayer(s, "p1", { credits: 2, intel: 1, influence: 0 });
    expect(validateProposal(s, "p1", { action: "strike", targetId: "p2" }, R).ok).toBe(false);
    expect(validateProposal(s, "p1", { action: "sabotage", targetId: "p2" }, R).ok).toBe(true);
    expect(validateProposal(s, "p1", { action: "investigate", targetId: "p2" }, R).ok).toBe(false);
    expect(validateProposal(s, "p1", { action: "mediate", targetId: "p2" }, R).ok).toBe(false);
    expect(validateProposal(s, "p1", { action: "trade", targetId: "p2", amount: 3 }, R).ok).toBe(false);
    expect(validateProposal(s, "p1", { action: "trade", targetId: "p2", amount: 0 }, R).ok).toBe(false);
    expect(validateProposal(s, "p1", { action: "recover" }, R).ok).toBe(true);
    const legal = getLegalActions(s, "p1", R);
    expect(legal.find((a) => a.action === "strike")!.affordable).toBe(false);
  });

  it("rejects actions outside commitment and from eliminated players", () => {
    const s = newMatch();
    expect(validateProposal(s, "p1", { action: "guard" }, R).error).toMatch(/negotiation/);
    const c = withPlayer(toCommitment(s), "p1", { alive: false });
    expect(validateProposal(c, "p1", { action: "guard" }, R).error).toMatch(/Eliminated/);
  });

  it("logs illegal commits as ACTION_REJECTED and counts them", () => {
    const s = toCommitment(newMatch());
    const r = applyInput(s, { kind: "commit", playerId: "p1", proposal: { action: "strike", targetId: "p1" }, source: "model", decisionSummary: null, at: 1 });
    expect(r.ok).toBe(false);
    expect(eventsOf(r.state, "ACTION_REJECTED")).toHaveLength(1);
    expect(player(r.state, "p1").stats.invalidActions).toBe(1);
    expect(r.state.commitments.p1).toBeUndefined();
  });
});

describe("duplicate commitments", () => {
  it("does not create a duplicate action or change the committed action", () => {
    let s = toCommitment(newMatch());
    s = apply(s, { kind: "commit", playerId: "p1", proposal: { action: "guard" }, source: "human", decisionSummary: null, at: 1 });
    const r = applyInput(s, { kind: "commit", playerId: "p1", proposal: { action: "strike", targetId: "p2" }, source: "human", decisionSummary: null, at: 2 });
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
    expect(s.commitments.p1!.proposal).toEqual({ action: "guard" });
    expect(eventsOf(s, "ACTION_COMMITTED")).toHaveLength(1);
  });
});

describe("resolution", () => {
  it("strike deals one damage and costs 3 credits", () => {
    const s = playRound(newMatch(), { p1: { action: "strike", targetId: "p2" } });
    expect(player(s, "p2").health).toBe(2);
    expect(player(s, "p1").credits).toBe(7);
    expect(player(s, "p1").stats.damageDealt).toBe(1);
  });

  it("simultaneous strikes all land and attackers who die still deal damage", () => {
    let s = withPlayer(newMatch(), "p1", { health: 1 });
    s = withPlayer(s, "p2", { health: 1 });
    s = playRound(s, { p1: { action: "strike", targetId: "p2" }, p2: { action: "strike", targetId: "p1" } });
    expect(player(s, "p1").alive).toBe(false);
    expect(player(s, "p2").alive).toBe(false);
    expect(eventsOf(s, "PLAYER_ELIMINATED")).toHaveLength(2);
  });

  it("guard absorbs exactly one point of damage from multiple strikes", () => {
    const s = playRound(newMatch(), {
      p1: { action: "guard" },
      p2: { action: "strike", targetId: "p1" },
      p3: { action: "strike", targetId: "p1" },
    });
    expect(player(s, "p1").health).toBe(2);
    expect(player(s, "p1").credits).toBe(9);
    expect(eventsOf(s, "GUARD_TRIGGERED")).toHaveLength(1);
    const blocked = eventsOf(s, "ATTACK_RESOLVED").filter((e) => e.data.blocked);
    expect(blocked.map((e) => e.data.attackerId)).toEqual(["p2"]); // seat order
  });

  it("scout respects the intel cap", () => {
    let s = withPlayer(newMatch(), "p1", { intel: R.caps.intel });
    s = playRound(s, { p1: { action: "scout" }, p2: { action: "scout" } });
    expect(player(s, "p1").intel).toBe(R.caps.intel);
    expect(player(s, "p2").intel).toBe(3);
    expect(player(s, "p1").credits).toBe(9);
  });

  it("recover respects the credit cap", () => {
    const s = playRound(withPlayer(newMatch(), "p1", { credits: R.caps.credits - 1 }), {});
    expect(player(s, "p1").credits).toBe(R.caps.credits);
    expect(player(s, "p2").credits).toBe(12);
  });

  it("investigate costs 2 intel and stores an escalating private clue", () => {
    let s = playRound(newMatch(), { p1: { action: "investigate", targetId: "p2" } });
    expect(player(s, "p1").intel).toBe(0);
    expect(player(s, "p1").clues[0]!.tier).toBe("category");
    expect(player(s, "p1").clues[0]!.text).toContain(player(s, "p2").objective.category.toUpperCase());
    const priv = eventsOf(s, "INVESTIGATION_RESOLVED").filter((e) => e.visibility.scope === "private");
    expect(priv).toHaveLength(1);
    expect(priv[0]!.visibility).toEqual({ scope: "private", playerIds: ["p1"] });
    s = withPlayer(apply(s, { kind: "advance", at: 4 }), "p1", { intel: 2 });
    s = playRound(s, { p1: { action: "investigate", targetId: "p2" } });
    expect(player(s, "p1").clues[1]!.tier).toBe("objective");
    expect(player(s, "p1").clues[1]!.text).toContain(player(s, "p2").objective.title);
  });

  it("sabotage drains up to 2 credits and never below zero", () => {
    let s = withPlayer(newMatch(), "p2", { credits: 1 });
    s = playRound(s, { p1: { action: "sabotage", targetId: "p2" }, p2: { action: "guard" } });
    // p2 paid 1 for guard at cost step, leaving 0 to drain.
    expect(player(s, "p2").credits).toBe(0);
    expect(eventsOf(s, "SABOTAGE_RESOLVED")[0]!.data.drained).toBe(0);
    expect(player(s, "p1").credits).toBe(8);
  });

  it("trade transfers credits; conflicting transfers resolve independently from pre-round balances", () => {
    const s = playRound(newMatch(), {
      p1: { action: "trade", targetId: "p2", amount: 10 },
      p2: { action: "trade", targetId: "p1", amount: 4 },
    });
    expect(player(s, "p1").credits).toBe(4);
    expect(player(s, "p2").credits).toBe(16);
    expect(player(s, "p1").stats.tradesCompleted).toBe(2);
  });

  it("trade overflow above the cap is returned to the sender", () => {
    const s = playRound(withPlayer(newMatch(), "p2", { credits: 19 }), {
      p1: { action: "trade", targetId: "p2", amount: 5 },
      p2: { action: "guard" },
    });
    // p2: 19 - 1 (guard) = 18, room 2.
    expect(player(s, "p2").credits).toBe(20);
    expect(player(s, "p1").credits).toBe(8); // 10 - 5 sent + 3 returned
  });

  it("unaffordable actions at resolution fizzle without cost", () => {
    let s = toCommitment(newMatch());
    s = apply(s, { kind: "commit", playerId: "p1", proposal: { action: "strike", targetId: "p2" }, source: "human", decisionSummary: null, at: 1 });
    s = withPlayer(s, "p1", { credits: 1 }); // simulate a balance change after commit
    for (const id of ["p2", "p3", "p4", "p5"]) s = apply(s, { kind: "commit", playerId: id, proposal: { action: "recover" }, source: "human", decisionSummary: null, at: 1 });
    s = apply(s, { kind: "advance", at: 2 });
    expect(eventsOf(s, "ACTION_FIZZLED")).toHaveLength(1);
    expect(player(s, "p2").health).toBe(3);
    expect(player(s, "p1").credits).toBe(1);
  });

  it("mediate fails without a verified agreement and succeeds with one", () => {
    let s = playRound(newMatch(), { p1: { action: "mediate", targetId: "p2" } });
    expect(player(s, "p1").influence).toBe(0);
    expect(eventsOf(s, "MEDIATION_RESOLVED")[0]!.data.success).toBe(false);

    s = newMatch();
    s = apply(s, { kind: "message", playerId: "p1", message: { toId: "p2", text: "Deal?", offerCredits: 1 }, at: 1 });
    const msgId = s.messages[0]!.id;
    s = apply(s, { kind: "respond_offer", playerId: "p2", messageId: msgId, accept: true, at: 2 });
    s = playRound(s, { p1: { action: "mediate", targetId: "p2" } });
    expect(player(s, "p1").influence).toBe(2);
    expect(player(s, "p2").influence).toBe(2);
  });

  it("eliminated players cannot act, vote or negotiate", () => {
    let s = withPlayer(newMatch(), "p2", { health: 1 });
    s = playRound(s, { p1: { action: "strike", targetId: "p2" } });
    expect(player(s, "p2").alive).toBe(false);
    s = apply(s, { kind: "advance", at: 5 }); // reveal -> next round (round 1 is not a voting round)
    expect(s.round).toBe(2);
    expect(applyInput(s, { kind: "message", playerId: "p2", message: { toId: null, text: "hi" }, at: 6 }).ok).toBe(false);
    s = toCommitment(s);
    expect(applyInput(s, { kind: "commit", playerId: "p2", proposal: { action: "guard" }, source: "human", decisionSummary: null, at: 6 }).ok).toBe(false);
  });

  it("round resolution happens exactly once", () => {
    let s = toCommitment(newMatch());
    for (const id of ["p1", "p2", "p3", "p4", "p5"]) s = apply(s, { kind: "commit", playerId: id, proposal: { action: "recover" }, source: "human", decisionSummary: null, at: 1 });
    s = apply(s, { kind: "advance", at: 2 });
    const credits = player(s, "p1").credits;
    // A second "resolve" attempt cannot happen: phase is now reveal, and advancing goes forward.
    expect(s.phase).toBe("reveal");
    const again = applyInput(s, { kind: "commit", playerId: "p1", proposal: { action: "recover" }, source: "human", decisionSummary: null, at: 3 });
    expect(again.ok).toBe(false);
    expect(player(again.state, "p1").credits).toBe(credits);
    expect(eventsOf(s, "RECOVER_RESOLVED")).toHaveLength(5);
  });

  it("refuses to advance while players are pending unless forced", () => {
    const s = toCommitment(newMatch());
    expect(applyInput(s, { kind: "advance", at: 1 }).ok).toBe(false);
    const forced = apply(s, { kind: "advance", at: 1, force: true });
    expect(eventsOf(forced, "ACTION_FALLBACK")).toHaveLength(5);
    expect(forced.phase).toBe("reveal");
  });
});

describe("negotiation", () => {
  it("enforces message limits, length and private-only offers", () => {
    let s = newMatch();
    expect(applyInput(s, { kind: "message", playerId: "p1", message: { toId: null, text: "x".repeat(281) }, at: 1 }).ok).toBe(false);
    expect(applyInput(s, { kind: "message", playerId: "p1", message: { toId: null, text: "hi", offerCredits: 1 }, at: 1 }).ok).toBe(false);
    expect(applyInput(s, { kind: "message", playerId: "p1", message: { toId: "p2", text: "hi", offerCredits: 11 }, at: 1 }).ok).toBe(false);
    s = apply(s, { kind: "message", playerId: "p1", message: { toId: null, text: "one" }, at: 1 });
    s = apply(s, { kind: "message", playerId: "p1", message: { toId: "p2", text: "two" }, at: 1 });
    expect(applyInput(s, { kind: "message", playerId: "p1", message: { toId: null, text: "three" }, at: 1 }).error).toMatch(/limit/);
  });

  it("escrows offers, refunds declined/expired ones and forms pacts on acceptance", () => {
    let s = newMatch();
    s = apply(s, { kind: "message", playerId: "p1", message: { toId: "p2", text: "pact?", offerCredits: 2, proposePact: true }, at: 1 });
    s = apply(s, { kind: "message", playerId: "p1", message: { toId: "p3", text: "take it", offerCredits: 3 }, at: 1 });
    expect(player(s, "p1").credits).toBe(5);
    expect(player(s, "p1").escrow).toBe(5);
    const [m1, m2] = s.messages;
    expect(applyInput(s, { kind: "respond_offer", playerId: "p3", messageId: m1!.id, accept: true, at: 2 }).ok).toBe(false);
    s = apply(s, { kind: "respond_offer", playerId: "p2", messageId: m1!.id, accept: true, at: 2 });
    expect(player(s, "p2").credits).toBe(12);
    expect(s.pacts).toHaveLength(1);
    s = toCommitment(s);
    for (const id of ["p1", "p2", "p3", "p4", "p5"]) s = apply(s, { kind: "commit", playerId: id, proposal: { action: "guard" }, source: "human", decisionSummary: null, at: 3 });
    s = apply(s, { kind: "advance", at: 4 });
    expect(s.messages.find((m) => m.id === m2!.id)!.offerStatus).toBe("expired");
    expect(player(s, "p1").credits).toBe(5 + 3 - 1); // refund 3, guard 1
    expect(player(s, "p1").escrow).toBe(0);
  });

  it("striking a pact partner breaks the pact and counts as betrayal", () => {
    let s = newMatch();
    s = apply(s, { kind: "message", playerId: "p1", message: { toId: "p2", text: "pact", proposePact: true }, at: 1 });
    s = apply(s, { kind: "respond_offer", playerId: "p2", messageId: s.messages[0]!.id, accept: true, at: 1 });
    s = playRound(s, { p1: { action: "strike", targetId: "p2" } });
    expect(eventsOf(s, "PACT_BROKEN")).toHaveLength(1);
    expect(player(s, "p1").stats.betrayals).toBe(1);
  });
});

describe("voting", () => {
  function toVoting() {
    let s = playRound(newMatch(), {});
    s = apply(s, { kind: "advance", at: 4 }); // -> round 2
    s = playRound(s, {});
    s = apply(s, { kind: "advance", at: 5 }); // reveal -> voting
    expect(s.phase).toBe("voting");
    return s;
  }

  it("majority eliminates", () => {
    let s = toVoting();
    for (const [v, t] of [["p1", "p5"], ["p2", "p5"], ["p3", "p5"], ["p4", "p1"], ["p5", "p1"]] as const) s = apply(s, { kind: "vote", playerId: v, targetId: t, at: 6 });
    s = apply(s, { kind: "advance", at: 7 });
    expect(player(s, "p5").alive).toBe(false);
    expect(player(s, "p5").eliminationCause).toBe("vote");
    expect(s.round).toBe(3);
  });

  it("a tie causes no elimination", () => {
    let s = toVoting();
    for (const [v, t] of [["p1", "p5"], ["p2", "p5"], ["p3", "p4"], ["p4", "p4"], ["p5", null]] as const) s = apply(s, { kind: "vote", playerId: v, targetId: t, at: 6 });
    s = apply(s, { kind: "advance", at: 7 });
    expect(s.players.every((p) => p.alive)).toBe(true);
    expect(eventsOf(s, "VOTE_RESOLVED")[0]!.data.tied).toBe(true);
  });

  it("plurality without majority causes no elimination; self-votes are allowed", () => {
    let s = toVoting();
    for (const [v, t] of [["p1", "p1"], ["p2", "p5"], ["p3", "p5"], ["p4", null], ["p5", null]] as const) s = apply(s, { kind: "vote", playerId: v, targetId: t, at: 6 });
    s = apply(s, { kind: "advance", at: 7 });
    expect(s.players.every((p) => p.alive)).toBe(true);
  });

  it("rejects duplicate votes and votes for eliminated players", () => {
    let s = toVoting();
    s = apply(s, { kind: "vote", playerId: "p1", targetId: "p2", at: 6 });
    expect(applyInput(s, { kind: "vote", playerId: "p1", targetId: "p3", at: 6 }).ok).toBe(false);
    s = withPlayer(s, "p4", { alive: false });
    expect(applyInput(s, { kind: "vote", playerId: "p2", targetId: "p4", at: 6 }).ok).toBe(false);
    expect(applyInput(s, { kind: "vote", playerId: "p4", targetId: "p2", at: 6 }).ok).toBe(false);
  });
});

describe("termination and scoring", () => {
  it("last player standing wins", () => {
    let s = newMatch();
    for (const id of ["p2", "p3", "p4", "p5"]) s = withPlayer(s, id, { health: 1 });
    s = playRound(s, {
      p1: { action: "strike", targetId: "p2" },
      p2: { action: "strike", targetId: "p3" },
      p3: { action: "strike", targetId: "p4" },
      p4: { action: "strike", targetId: "p5" },
    });
    // p5 survives this round (struck by p4 → eliminated). p1 alive.
    s = apply(s, { kind: "advance", at: 9 });
    expect(s.phase).toBe("complete");
    expect(s.terminal!.reason).toBe("last_player_standing");
    expect(s.terminal!.winnerId).toBe("p1");
    expect(s.terminal!.placements[0]!.points).toBe(5);
  });

  it("mutual destruction ranks by tie-breaks deterministically", () => {
    let s = newMatch();
    for (const id of ["p1", "p2", "p3", "p4", "p5"]) s = withPlayer(s, id, { health: 1 });
    s = playRound(s, {
      p1: { action: "strike", targetId: "p2" },
      p2: { action: "strike", targetId: "p3" },
      p3: { action: "strike", targetId: "p4" },
      p4: { action: "strike", targetId: "p5" },
      p5: { action: "strike", targetId: "p1" },
    });
    s = apply(s, { kind: "advance", at: 9 });
    expect(s.terminal!.reason).toBe("mutual_destruction");
    expect(s.terminal!.placements.map((p) => p.place)).toEqual([1, 2, 3, 4, 5]);
    expect(s.terminal!.winnerId).not.toBeNull();
  });

  it("survival ranks above score; later elimination ranks above earlier", () => {
    let s = withPlayer(newMatch(), "p5", { health: 1 });
    s = playRound(s, { p1: { action: "strike", targetId: "p5" } });
    s = apply(s, { kind: "advance", at: 1 });
    s = withPlayer(s, "p4", { health: 1, credits: 20, influence: 3 });
    s = playRound(s, { p1: { action: "strike", targetId: "p4" } });
    s = apply(s, { kind: "advance", at: 2 }); // to voting
    s = apply(s, { kind: "advance", at: 3, force: true }); // abstain all
    // Play out remaining rounds with recover.
    while (s.phase !== "complete") {
      s = s.phase === "negotiation" ? playRound(s, {}) : apply(s, { kind: "advance", at: 4, force: true });
    }
    expect(s.terminal!.reason).toBe("final_round_complete");
    const places = Object.fromEntries(s.terminal!.placements.map((p) => [p.playerId, p.place]));
    expect(places.p4).toBe(4);
    expect(places.p5).toBe(5);
    expect(s.round).toBe(6);
  });

  it("every terminal state has a recorded reason and MATCH_COMPLETED event", () => {
    let s = newMatch();
    while (s.phase !== "complete") {
      s = s.phase === "negotiation" ? playRound(s, {}) : apply(s, { kind: "advance", at: 4, force: true });
    }
    expect(s.terminal!.reason).toBeTruthy();
    expect(eventsOf(s, "MATCH_COMPLETED")).toHaveLength(1);
    expect(applyInput(s, { kind: "advance", at: 5 }).ok).toBe(false);
  });
});
