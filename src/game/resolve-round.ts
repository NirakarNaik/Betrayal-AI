/**
 * Deterministic round resolution.
 *
 * RESOLUTION ORDER (documented in docs/RULES.md):
 *  0. Reveal   – every committed action is revealed (ACTION_REVEALED).
 *  1. Costs    – in seat order, each action's cost is checked against the actor's
 *                resources at the start of resolution and paid. Unaffordable
 *                actions, or actions whose target is no longer active, FIZZLE:
 *                no cost is paid and no effect occurs.
 *  2. Defense  – GUARD activates (absorbs the first point of damage this round).
 *  3. Intel    – SCOUT gains intel; INVESTIGATE produces a private clue.
 *  4. Economy  – SABOTAGE drains credits first, then RECOVER and TRADE inflows are
 *                credited. Inflows never fund outflows in the same round (all
 *                outflows were paid in step 1). Credits above the cap are returned
 *                to the sender (trade) or lost (recover).
 *  5. Combat   – all STRIKEs land simultaneously. For each target, attackers are
 *                processed in seat order; a guard absorbs exactly one damage point
 *                in total; remaining strikes each deal damage. Attackers who die
 *                this round still deal their damage.
 *  6. Diplomacy– MEDIATE succeeds only if a verified agreement (accepted offer or
 *                resolved TRADE) exists between mediator and target this round and
 *                neither struck nor sabotaged the other this round.
 *  7. Pacts    – a STRIKE or SABOTAGE against an active pact partner breaks the pact.
 *  8. Eliminations – players at 0 health are eliminated simultaneously.
 */
import type { RulesetConfig } from "./config";
import { emit, PUBLIC, privateTo } from "./events";
import { actionCost, getPlayer } from "./legal-actions";
import { buildClue } from "./clues";
import type { ActionProposal, CommittedAction, GameEvent, MatchState, Pact, PlayerId } from "./types";

const clamp = (v: number, max: number) => Math.min(v, max);

export function activePact(state: MatchState, a: PlayerId, b: PlayerId): Pact | undefined {
  return state.pacts.find(
    (p) =>
      p.brokenBy === null &&
      p.formedRound <= state.round &&
      state.round <= p.expiresAfterRound &&
      ((p.aId === a && p.bId === b) || (p.aId === b && p.bId === a)),
  );
}

export function breakPactIfAny(
  state: MatchState,
  out: GameEvent[],
  at: number,
  betrayerId: PlayerId,
  victimId: PlayerId,
  how: string,
): void {
  const pact = activePact(state, betrayerId, victimId);
  if (!pact) return;
  pact.brokenBy = betrayerId;
  pact.brokenRound = state.round;
  const betrayer = getPlayer(state, betrayerId)!;
  const victim = getPlayer(state, victimId)!;
  betrayer.stats.betrayals += 1;
  emit(state, out, "PACT_BROKEN", at, PUBLIC, `${betrayer.name} broke their pact with ${victim.name} (${how}).`, {
    pactId: pact.id,
    betrayerId,
    victimId,
    how,
  });
}

function describe(state: MatchState, p: ActionProposal): string {
  const name = (id: string) => getPlayer(state, id)?.name ?? id;
  switch (p.action) {
    case "strike":
      return `STRIKE → ${name(p.targetId)}`;
    case "investigate":
      return `INVESTIGATE → ${name(p.targetId)}`;
    case "sabotage":
      return `SABOTAGE → ${name(p.targetId)}`;
    case "trade":
      return `TRADE ${p.amount}cr → ${name(p.targetId)}`;
    case "mediate":
      return `MEDIATE with ${name(p.targetId)}`;
    default:
      return p.action.toUpperCase();
  }
}

export function resolveRound(state: MatchState, rules: RulesetConfig, at: number, out: GameEvent[]): void {
  const actors = state.players.filter((p) => p.alive).sort((a, b) => a.seat - b.seat);
  const commits: CommittedAction[] = actors
    .map((p) => state.commitments[p.id])
    .filter((c): c is CommittedAction => Boolean(c));

  // 0. Reveal
  for (const c of commits) {
    const actor = getPlayer(state, c.playerId)!;
    emit(state, out, "ACTION_REVEALED", at, PUBLIC, `${actor.name}: ${describe(state, c.proposal)}`, {
      playerId: c.playerId,
      action: c.proposal.action,
      targetId: "targetId" in c.proposal ? c.proposal.targetId : null,
      amount: c.proposal.action === "trade" ? c.proposal.amount : null,
      source: c.source,
    });
  }

  // 1. Costs
  const resolved: CommittedAction[] = [];
  for (const c of commits) {
    const actor = getPlayer(state, c.playerId)!;
    const p = c.proposal;
    if ("targetId" in p) {
      const t = getPlayer(state, p.targetId);
      if (!t || !t.alive || t.id === actor.id) {
        emit(state, out, "ACTION_FIZZLED", at, PUBLIC, `${actor.name}'s ${p.action.toUpperCase()} fizzled: invalid target.`, {
          playerId: actor.id,
          action: p.action,
          reason: "invalid_target",
        });
        continue;
      }
    }
    const cost = actionCost(rules, p);
    if (actor.credits < cost.credits || actor.intel < cost.intel || actor.influence < cost.influence) {
      emit(state, out, "ACTION_FIZZLED", at, PUBLIC, `${actor.name}'s ${p.action.toUpperCase()} fizzled: unaffordable.`, {
        playerId: actor.id,
        action: p.action,
        reason: "unaffordable",
      });
      continue;
    }
    actor.credits -= cost.credits;
    actor.intel -= cost.intel;
    actor.influence -= cost.influence;
    resolved.push(c);
  }

  const of = (type: ActionProposal["action"]) => resolved.filter((c) => c.proposal.action === type);

  // 2. Defense
  const guardPoints: Record<PlayerId, number> = {};
  for (const c of of("guard")) guardPoints[c.playerId] = rules.effects.guardAbsorb;

  // 3. Intel
  for (const c of of("scout")) {
    const actor = getPlayer(state, c.playerId)!;
    const before = actor.intel;
    actor.intel = clamp(actor.intel + rules.effects.scoutIntel, rules.caps.intel);
    emit(state, out, "SCOUT_RESOLVED", at, PUBLIC, `${actor.name} scouted (+${actor.intel - before} intel).`, {
      playerId: actor.id,
      gained: actor.intel - before,
    });
  }
  for (const c of of("investigate")) {
    if (c.proposal.action !== "investigate") continue;
    const actor = getPlayer(state, c.playerId)!;
    const target = getPlayer(state, c.proposal.targetId)!;
    const prior = actor.stats.investigationsByTarget[target.id] ?? 0;
    const clue = buildClue(state, rules, target, prior);
    actor.clues.push(clue);
    actor.stats.investigationsByTarget[target.id] = prior + 1;
    emit(state, out, "INVESTIGATION_RESOLVED", at, PUBLIC, `${actor.name} investigated ${target.name}.`, {
      playerId: actor.id,
      targetId: target.id,
    });
    emit(state, out, "INVESTIGATION_RESOLVED", at, privateTo(actor.id), `Clue on ${target.name}: ${clue.text}`, {
      playerId: actor.id,
      targetId: target.id,
      tier: clue.tier,
      clue: clue.text,
      private: true,
    });
  }

  // 4. Economy
  const hostile: { from: PlayerId; to: PlayerId }[] = [];
  for (const c of of("sabotage")) {
    if (c.proposal.action !== "sabotage") continue;
    const actor = getPlayer(state, c.playerId)!;
    const target = getPlayer(state, c.proposal.targetId)!;
    const drained = Math.min(rules.effects.sabotageCredits, target.credits);
    target.credits -= drained;
    hostile.push({ from: actor.id, to: target.id });
    emit(state, out, "SABOTAGE_RESOLVED", at, PUBLIC, `${actor.name} sabotaged ${target.name} (-${drained} credits).`, {
      playerId: actor.id,
      targetId: target.id,
      drained,
    });
  }
  for (const c of of("recover")) {
    const actor = getPlayer(state, c.playerId)!;
    const before = actor.credits;
    actor.credits = clamp(actor.credits + rules.effects.recoverCredits, rules.caps.credits);
    emit(state, out, "RECOVER_RESOLVED", at, PUBLIC, `${actor.name} recovered (+${actor.credits - before} credits).`, {
      playerId: actor.id,
      gained: actor.credits - before,
    });
  }
  const tradesThisRound: { from: PlayerId; to: PlayerId }[] = [];
  for (const c of of("trade")) {
    if (c.proposal.action !== "trade") continue;
    const actor = getPlayer(state, c.playerId)!;
    const target = getPlayer(state, c.proposal.targetId)!;
    const room = rules.caps.credits - target.credits;
    const delivered = Math.max(0, Math.min(room, c.proposal.amount));
    const returned = c.proposal.amount - delivered;
    target.credits += delivered;
    actor.credits = clamp(actor.credits + returned, rules.caps.credits);
    if (delivered > 0) {
      actor.stats.tradesCompleted += 1;
      target.stats.tradesCompleted += 1;
      tradesThisRound.push({ from: actor.id, to: target.id });
    }
    emit(
      state,
      out,
      "RESOURCE_TRANSFERRED",
      at,
      PUBLIC,
      `${actor.name} traded ${delivered} credits to ${target.name}${returned ? ` (${returned} returned: cap)` : ""}.`,
      { fromId: actor.id, toId: target.id, amount: delivered, returned, via: "trade_action" },
    );
  }

  // 5. Combat
  const damage: Record<PlayerId, number> = {};
  const strikes = of("strike");
  const targets = Array.from(
    new Set(strikes.map((c) => (c.proposal.action === "strike" ? c.proposal.targetId : ""))),
  )
    .map((id) => getPlayer(state, id)!)
    .sort((a, b) => a.seat - b.seat);
  for (const target of targets) {
    const incoming = strikes
      .filter((c) => c.proposal.action === "strike" && c.proposal.targetId === target.id)
      .map((c) => getPlayer(state, c.playerId)!)
      .sort((a, b) => a.seat - b.seat);
    for (const attacker of incoming) {
      attacker.stats.strikesUsed += 1;
      hostile.push({ from: attacker.id, to: target.id });
      if ((guardPoints[target.id] ?? 0) > 0) {
        guardPoints[target.id]! -= 1;
        emit(state, out, "GUARD_TRIGGERED", at, PUBLIC, `${target.name}'s guard absorbed ${attacker.name}'s strike.`, {
          playerId: target.id,
          attackerId: attacker.id,
        });
        emit(state, out, "ATTACK_RESOLVED", at, PUBLIC, `${attacker.name} struck ${target.name}: blocked.`, {
          attackerId: attacker.id,
          targetId: target.id,
          damage: 0,
          blocked: true,
        });
        continue;
      }
      damage[target.id] = (damage[target.id] ?? 0) + rules.effects.strikeDamage;
      attacker.stats.damageDealt += rules.effects.strikeDamage;
      target.stats.damageReceived += rules.effects.strikeDamage;
      emit(state, out, "ATTACK_RESOLVED", at, PUBLIC, `${attacker.name} struck ${target.name} for ${rules.effects.strikeDamage} damage.`, {
        attackerId: attacker.id,
        targetId: target.id,
        damage: rules.effects.strikeDamage,
        blocked: false,
      });
    }
  }
  // Apply all damage simultaneously.
  for (const [id, dmg] of Object.entries(damage)) {
    const p = getPlayer(state, id)!;
    p.health = Math.max(0, p.health - dmg);
  }

  // 6. Diplomacy
  for (const c of of("mediate")) {
    if (c.proposal.action !== "mediate") continue;
    const actor = getPlayer(state, c.playerId)!;
    const target = getPlayer(state, c.proposal.targetId)!;
    const pair = (x: { from: PlayerId; to: PlayerId }) =>
      (x.from === actor.id && x.to === target.id) || (x.from === target.id && x.to === actor.id);
    const acceptedOffer = state.messages.some(
      (m) =>
        m.round === state.round &&
        m.offerStatus === "accepted" &&
        ((m.fromId === actor.id && m.toId === target.id) || (m.fromId === target.id && m.toId === actor.id)),
    );
    const verifiedAgreement = acceptedOffer || tradesThisRound.some(pair);
    const conflict = hostile.some(pair);
    const success = verifiedAgreement && !conflict;
    if (success) {
      actor.influence = clamp(actor.influence + rules.effects.mediateSuccessInfluence, rules.caps.influence);
      target.influence = clamp(target.influence + rules.effects.mediateTargetInfluence, rules.caps.influence);
      actor.stats.mediationsSucceeded += 1;
    }
    emit(
      state,
      out,
      "MEDIATION_RESOLVED",
      at,
      PUBLIC,
      success
        ? `${actor.name} mediated with ${target.name}: verified agreement, influence gained.`
        : `${actor.name}'s mediation with ${target.name} failed (${conflict ? "hostilities" : "no verified agreement"}).`,
      { playerId: actor.id, targetId: target.id, success, reason: success ? null : conflict ? "conflict" : "no_agreement" },
    );
  }

  // 7. Pact betrayals (strike or sabotage on an active pact partner)
  const seen = new Set<string>();
  for (const h of hostile) {
    const key = `${h.from}>${h.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const how = strikes.some((c) => c.playerId === h.from && c.proposal.action === "strike" && c.proposal.targetId === h.to)
      ? "strike"
      : "sabotage";
    breakPactIfAny(state, out, at, h.from, h.to, how);
  }

  // 8. Eliminations (simultaneous)
  for (const p of state.players.filter((x) => x.alive && x.health <= 0).sort((a, b) => a.seat - b.seat)) {
    p.alive = false;
    p.eliminatedRound = state.round;
    p.eliminationCause = "damage";
    const by = strikes
      .filter((c) => c.proposal.action === "strike" && c.proposal.targetId === p.id)
      .map((c) => c.playerId);
    emit(state, out, "PLAYER_ELIMINATED", at, PUBLIC, `${p.name} has been eliminated.`, {
      playerId: p.id,
      cause: "damage",
      by,
    });
  }

  state.actionHistory.push(...commits);
  state.commitments = {};
}
