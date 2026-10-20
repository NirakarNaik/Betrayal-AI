/**
 * The Betrayal Protocol state machine.
 *
 * `applyInput(state, input)` is a pure function: it deep-clones the state,
 * applies one recorded input, and returns the new state plus emitted events.
 * Every input is recorded so the full match can be replayed exactly.
 *
 * Phase flow per round:
 *   negotiation -> commitment -> (resolution) -> reveal -> [voting] -> next round
 * The `advance` input moves to the next phase. When `force` is true, missing
 * participants receive documented defaults (end negotiation / RECOVER / abstain).
 */
import { getRuleset, type RulesetConfig } from "./config";
import { emit, PUBLIC, privateTo } from "./events";
import { fallbackProposal, getPlayer, validateMessage, validateProposal, validateVote } from "./legal-actions";
import { evaluateObjective } from "./objectives";
import { breakPactIfAny, resolveRound } from "./resolve-round";
import { rankPlayers } from "./scoring";
import type { EngineInput, EngineResult, GameEvent, MatchState, Phase, PlayerId, TerminalReason } from "./types";

const clone = <T,>(v: T): T => structuredClone(v);

function err(state: MatchState, error: string): EngineResult {
  return { ok: false, state, events: [], error };
}

export function alivePlayerIds(state: MatchState): PlayerId[] {
  return state.players.filter((p) => p.alive).map((p) => p.id);
}

/** Which alive players still owe an input in the current phase. */
export function pendingPlayers(state: MatchState): PlayerId[] {
  const alive = alivePlayerIds(state);
  switch (state.phase) {
    case "negotiation":
      return alive.filter((id) => !state.negotiationDone.includes(id));
    case "commitment":
      return alive.filter((id) => !state.commitments[id]);
    case "voting":
      return alive.filter((id) => !(id in state.votes));
    default:
      return [];
  }
}

export function isPhaseReady(state: MatchState): boolean {
  if (state.phase === "complete") return false;
  return pendingPlayers(state).length === 0;
}

export function isVotingRound(rules: RulesetConfig, round: number): boolean {
  return rules.voting.afterRounds.includes(round);
}

function setPhase(state: MatchState, out: GameEvent[], at: number, phase: Phase, summary: string): void {
  state.phase = phase;
  emit(state, out, "PHASE_CHANGED", at, PUBLIC, summary, { phase });
}

/** Refund and expire offers still pending in this round. */
function expirePendingOffers(state: MatchState, out: GameEvent[], at: number): void {
  for (const m of state.messages) {
    if (m.round !== state.round || m.offerStatus !== "pending") continue;
    const from = getPlayer(state, m.fromId)!;
    from.credits += m.offerCredits;
    from.escrow -= m.offerCredits;
    m.offerStatus = "expired";
    emit(state, out, "OFFER_EXPIRED", at, privateTo(m.fromId, m.toId!), `Offer from ${from.name} expired unanswered.`, {
      messageId: m.id,
      fromId: m.fromId,
      toId: m.toId,
      refunded: m.offerCredits,
    });
  }
}

function completeMatch(state: MatchState, rules: RulesetConfig, out: GameEvent[], at: number, reason: TerminalReason): void {
  state.phase = "complete";
  const placements = rankPlayers(state, rules, true);
  for (const p of state.players) {
    const prog = evaluateObjective(state, p, rules, true);
    if (prog.status === "completed") {
      emit(state, out, "OBJECTIVE_COMPLETED", at, PUBLIC, `${p.name} completed their objective: ${p.objective.title}.`, {
        playerId: p.id,
        objective: p.objective.kind,
        final: true,
      });
    }
  }
  const winnerId = placements[0]?.playerId ?? null;
  state.terminal = { reason, winnerId, placements, round: state.round };
  const winner = winnerId ? getPlayer(state, winnerId) : undefined;
  emit(state, out, "MATCH_COMPLETED", at, PUBLIC, `Match complete (${reason.replaceAll("_", " ")}). Winner: ${winner?.name ?? "none"}.`, {
    reason,
    winnerId,
    placements,
    objectives: state.players.map((p) => ({ playerId: p.id, ...p.objective })),
  });
}

/** Emit private notices for objectives that became irreversibly complete. */
function announceLockedObjectives(state: MatchState, rules: RulesetConfig, out: GameEvent[], at: number): void {
  for (const p of state.players) {
    const already = state.events.some((e) => e.type === "OBJECTIVE_COMPLETED" && e.data.playerId === p.id);
    if (already) continue;
    const locked = ["dealmaker", "nemesis", "spymaster"].includes(p.objective.kind);
    if (!locked) continue;
    if (evaluateObjective(state, p, rules, false).status === "completed") {
      emit(state, out, "OBJECTIVE_COMPLETED", at, privateTo(p.id), `Objective secured: ${p.objective.title}.`, {
        playerId: p.id,
        objective: p.objective.kind,
        final: false,
      });
    }
  }
}

/** End the current round: expire pacts, check termination, start the next round. */
function endRound(state: MatchState, rules: RulesetConfig, out: GameEvent[], at: number): void {
  for (const pact of state.pacts) {
    if (pact.brokenBy === null && pact.expiresAfterRound === state.round) {
      emit(state, out, "PACT_EXPIRED", at, privateTo(pact.aId, pact.bId), "A pact expired with both sides honoring it.", {
        pactId: pact.id,
        aId: pact.aId,
        bId: pact.bId,
        honored: true,
      });
    }
  }
  emit(state, out, "ROUND_COMPLETED", at, PUBLIC, `Round ${state.round} complete.`, {
    alive: alivePlayerIds(state),
  });
  const alive = alivePlayerIds(state);
  if (alive.length <= 1) {
    completeMatch(state, rules, out, at, alive.length === 1 ? "last_player_standing" : "mutual_destruction");
    return;
  }
  if (state.round >= rules.maxRounds) {
    completeMatch(state, rules, out, at, "final_round_complete");
    return;
  }
  state.round += 1;
  state.negotiationDone = [];
  state.votes = {};
  state.commitments = {};
  state.phase = "negotiation";
  emit(state, out, "ROUND_STARTED", at, PUBLIC, `Round ${state.round} begins. Negotiation is open.`, {});
}

function resolveVotes(state: MatchState, out: GameEvent[], at: number): void {
  const voters = alivePlayerIds(state);
  const tally: Record<PlayerId, number> = {};
  for (const id of voters) {
    const t = state.votes[id] ?? null;
    if (t) tally[t] = (tally[t] ?? 0) + 1;
  }
  const majority = Math.floor(voters.length / 2) + 1;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const [leaderId, leaderVotes] = top[0] ?? [null, 0];
  const tiedAtTop = top.length > 1 && top[1]![1] === leaderVotes;
  const eliminatedId = leaderId && leaderVotes >= majority && !tiedAtTop ? leaderId : null;
  const ballots = voters.map((id) => ({ voterId: id, targetId: state.votes[id] ?? null }));
  for (const b of ballots) {
    getPlayer(state, b.voterId)!.stats.votesCast.push({ round: state.round, targetId: b.targetId });
  }
  const votersForEliminated = eliminatedId ? ballots.filter((b) => b.targetId === eliminatedId).map((b) => b.voterId) : [];
  const elim = eliminatedId ? getPlayer(state, eliminatedId)! : null;
  emit(
    state,
    out,
    "VOTE_RESOLVED",
    at,
    PUBLIC,
    elim
      ? `The vote eliminates ${elim.name} (${leaderVotes}/${voters.length}).`
      : tiedAtTop
        ? "The vote is tied. No elimination."
        : `No majority (${majority} needed). No elimination.`,
    { ballots, tally, majority, eliminatedId, tied: tiedAtTop, votersForEliminated },
  );
  // Voting against an active pact partner counts as betrayal.
  for (const b of ballots) {
    if (b.targetId && b.targetId !== b.voterId) breakPactIfAny(state, out, at, b.voterId, b.targetId, "vote");
  }
  if (elim) {
    elim.alive = false;
    elim.eliminatedRound = state.round;
    elim.eliminationCause = "vote";
    emit(state, out, "PLAYER_ELIMINATED", at, PUBLIC, `${elim.name} has been voted out.`, {
      playerId: elim.id,
      cause: "vote",
      by: votersForEliminated,
    });
  }
  state.votes = {};
}

export function applyInput(input0: MatchState, input: EngineInput): EngineResult {
  if (input0.phase === "complete") return err(input0, "Match is complete");
  const rules = getRuleset(input0.rulesetId);
  const state = clone(input0);
  const out: GameEvent[] = [];
  const at = input.at;

  switch (input.kind) {
    case "message": {
      const v = validateMessage(state, input.playerId, input.message, rules);
      if (!v.ok) return err(input0, v.error!);
      const from = getPlayer(state, input.playerId)!;
      const offerCredits = input.message.offerCredits ?? 0;
      const proposePact = input.message.proposePact ?? false;
      const isOffer = offerCredits > 0 || proposePact;
      const id = `msg_${state.nextId.toString(36)}`;
      state.nextId += 1;
      state.messages.push({
        id,
        round: state.round,
        fromId: from.id,
        toId: input.message.toId,
        text: input.message.text.trim(),
        offerCredits,
        proposePact,
        offerStatus: isOffer ? "pending" : "none",
        createdAt: at,
      });
      if (offerCredits > 0) {
        from.credits -= offerCredits;
        from.escrow += offerCredits;
      }
      const to = input.message.toId ? getPlayer(state, input.message.toId)! : null;
      const text = input.message.text.trim();
      if (!to) {
        emit(state, out, "MESSAGE_SENT", at, PUBLIC, `${from.name}: "${text}"`, { messageId: id, fromId: from.id, toId: null, text });
      } else {
        emit(
          state,
          out,
          isOffer ? "OFFER_SENT" : "MESSAGE_SENT",
          at,
          privateTo(from.id, to.id),
          isOffer
            ? `${from.name} → ${to.name}: offer${offerCredits ? ` of ${offerCredits} credits` : ""}${proposePact ? " + non-aggression pact" : ""}.`
            : `${from.name} → ${to.name} (private): "${text}"`,
          { messageId: id, fromId: from.id, toId: to.id, text, offerCredits, proposePact },
        );
      }
      return { ok: true, state, events: out };
    }

    case "end_negotiation": {
      if (state.phase !== "negotiation") return err(input0, "Not in negotiation");
      const p = getPlayer(state, input.playerId);
      if (!p || !p.alive) return err(input0, "Player cannot negotiate");
      if (state.negotiationDone.includes(p.id)) return err(input0, "Already done negotiating");
      state.negotiationDone.push(p.id);
      return { ok: true, state, events: out };
    }

    case "respond_offer": {
      if (state.phase !== "negotiation" && state.phase !== "commitment") return err(input0, "Offers can only be answered before resolution");
      const m = state.messages.find((x) => x.id === input.messageId);
      if (!m || m.offerStatus !== "pending") return err(input0, "No pending offer with that id");
      if (m.toId !== input.playerId) return err(input0, "That offer was not addressed to you");
      if (state.commitments[input.playerId]) return err(input0, "You already committed this round");
      const from = getPlayer(state, m.fromId)!;
      const to = getPlayer(state, m.toId)!;
      if (!to.alive) return err(input0, "Eliminated players cannot answer offers");
      if (!input.accept) {
        from.credits += m.offerCredits;
        from.escrow -= m.offerCredits;
        m.offerStatus = "declined";
        emit(state, out, "OFFER_DECLINED", at, privateTo(from.id, to.id), `${to.name} declined ${from.name}'s offer.`, {
          messageId: m.id,
          fromId: from.id,
          toId: to.id,
        });
        return { ok: true, state, events: out };
      }
      m.offerStatus = "accepted";
      from.escrow -= m.offerCredits;
      const room = rules.caps.credits - to.credits;
      const delivered = Math.max(0, Math.min(room, m.offerCredits));
      to.credits += delivered;
      from.credits += m.offerCredits - delivered;
      emit(state, out, "OFFER_ACCEPTED", at, privateTo(from.id, to.id), `${to.name} accepted ${from.name}'s offer.`, {
        messageId: m.id,
        fromId: from.id,
        toId: to.id,
        offerCredits: m.offerCredits,
        proposePact: m.proposePact,
      });
      if (delivered > 0) {
        from.stats.tradesCompleted += 1;
        to.stats.tradesCompleted += 1;
        emit(state, out, "RESOURCE_TRANSFERRED", at, privateTo(from.id, to.id), `${from.name} transferred ${delivered} credits to ${to.name}.`, {
          fromId: from.id,
          toId: to.id,
          amount: delivered,
          returned: m.offerCredits - delivered,
          via: "offer",
        });
      }
      if (m.proposePact) {
        const pactId = `pact_${state.nextId.toString(36)}`;
        state.nextId += 1;
        state.pacts.push({
          id: pactId,
          aId: from.id,
          bId: to.id,
          formedRound: state.round,
          expiresAfterRound: state.round + rules.pact.extraRounds,
          brokenBy: null,
          brokenRound: null,
        });
        emit(state, out, "PACT_FORMED", at, privateTo(from.id, to.id), `${from.name} and ${to.name} formed a non-aggression pact.`, {
          pactId,
          aId: from.id,
          bId: to.id,
          expiresAfterRound: state.round + rules.pact.extraRounds,
        });
      }
      return { ok: true, state, events: out };
    }

    case "commit": {
      // Idempotency: a repeated commit for the same player never creates a duplicate.
      if (state.phase === "commitment" && state.commitments[input.playerId]) {
        return err(input0, "Action already committed this round");
      }
      const v = validateProposal(state, input.playerId, input.proposal, rules);
      if (!v.ok) {
        const p = getPlayer(state, input.playerId);
        if (!p || state.phase !== "commitment" || !p.alive) return err(input0, v.error!);
        p.stats.invalidActions += 1;
        emit(state, out, "ACTION_REJECTED", at, privateTo(p.id), `Action rejected: ${v.error}`, {
          playerId: p.id,
          proposal: input.proposal,
          source: input.source,
          error: v.error,
        });
        return { ok: false, state, events: out, error: v.error! };
      }
      const p = getPlayer(state, input.playerId)!;
      if (input.source === "fallback") p.stats.fallbackActions += 1;
      state.commitments[p.id] = {
        playerId: p.id,
        round: state.round,
        proposal: input.proposal,
        source: input.source,
        decisionSummary: input.decisionSummary,
        committedAt: at,
      };
      emit(state, out, "ACTION_COMMITTED", at, PUBLIC, `${p.name} locked in an action.`, { playerId: p.id });
      if (input.source === "fallback") {
        emit(state, out, "ACTION_FALLBACK", at, PUBLIC, `${p.name} received the default fallback action.`, {
          playerId: p.id,
        });
      }
      return { ok: true, state, events: out };
    }

    case "vote": {
      const v = validateVote(state, input.playerId, input.targetId);
      if (!v.ok) return err(input0, v.error!);
      state.votes[input.playerId] = input.targetId;
      const p = getPlayer(state, input.playerId)!;
      emit(state, out, "VOTE_CAST", at, PUBLIC, `${p.name} cast a sealed vote.`, { playerId: p.id });
      return { ok: true, state, events: out };
    }

    case "advance": {
      const force = input.force ?? false;
      if (!force && !isPhaseReady(state)) {
        return err(input0, `Waiting for: ${pendingPlayers(state).join(", ")}`);
      }
      switch (state.phase) {
        case "negotiation": {
          for (const id of pendingPlayers(state)) state.negotiationDone.push(id);
          setPhase(state, out, at, "commitment", `Round ${state.round}: secret commitment phase.`);
          return { ok: true, state, events: out };
        }
        case "commitment": {
          for (const id of pendingPlayers(state)) {
            const p = getPlayer(state, id)!;
            p.stats.fallbackActions += 1;
            state.commitments[id] = {
              playerId: id,
              round: state.round,
              proposal: fallbackProposal(),
              source: "fallback",
              decisionSummary: null,
              committedAt: at,
            };
            emit(state, out, "ACTION_FALLBACK", at, PUBLIC, `${p.name} timed out and receives RECOVER.`, { playerId: id, reason: "timeout" });
          }
          expirePendingOffers(state, out, at);
          setPhase(state, out, at, "resolution", `Round ${state.round}: resolving actions.`);
          resolveRound(state, rules, at, out);
          announceLockedObjectives(state, rules, out, at);
          setPhase(state, out, at, "reveal", `Round ${state.round}: reveal.`);
          return { ok: true, state, events: out };
        }
        case "reveal": {
          const alive = alivePlayerIds(state);
          if (alive.length > 1 && isVotingRound(rules, state.round)) {
            setPhase(state, out, at, "voting", `Round ${state.round}: elimination vote.`);
          } else {
            endRound(state, rules, out, at);
          }
          return { ok: true, state, events: out };
        }
        case "voting": {
          for (const id of pendingPlayers(state)) state.votes[id] = null;
          resolveVotes(state, out, at);
          announceLockedObjectives(state, rules, out, at);
          endRound(state, rules, out, at);
          return { ok: true, state, events: out };
        }
        default:
          return err(input0, `Cannot advance from ${state.phase}`);
      }
    }

    case "cancel": {
      state.phase = "complete";
      state.terminal = { reason: input.reason, winnerId: null, placements: [], round: state.round };
      emit(state, out, "MATCH_COMPLETED", at, PUBLIC, `Match ${input.reason}.`, { reason: input.reason, winnerId: null });
      return { ok: true, state, events: out };
    }
  }
}
