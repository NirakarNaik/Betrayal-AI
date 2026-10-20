/**
 * Legality checks. The engine validates every proposal against authoritative
 * state; a schema-valid proposal is not necessarily a legal one.
 */
import type { RulesetConfig } from "./config";
import type {
  ActionProposal,
  ActionType,
  LegalActionOption,
  MatchState,
  MessageInput,
  PlayerId,
  PlayerState,
  ValidationResult,
} from "./types";

export const ACTION_TYPES: ActionType[] = [
  "strike",
  "guard",
  "scout",
  "investigate",
  "sabotage",
  "trade",
  "mediate",
  "recover",
];

export const TARGETED_ACTIONS: ReadonlySet<ActionType> = new Set([
  "strike",
  "investigate",
  "sabotage",
  "trade",
  "mediate",
]);

const ok: ValidationResult = { ok: true, error: null };
const fail = (error: string): ValidationResult => ({ ok: false, error });

export function getPlayer(state: MatchState, id: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

export function alivePlayers(state: MatchState): PlayerState[] {
  return state.players.filter((p) => p.alive);
}

function canAfford(p: PlayerState, cost: { credits: number; intel: number; influence: number }): boolean {
  return p.credits >= cost.credits && p.intel >= cost.intel && p.influence >= cost.influence;
}

export function actionCost(
  rules: RulesetConfig,
  proposal: ActionProposal,
): { credits: number; intel: number; influence: number } {
  const base = rules.actions[proposal.action];
  if (proposal.action === "trade") {
    return { credits: base.credits + proposal.amount, intel: base.intel, influence: base.influence };
  }
  return base;
}

/** List all primary actions with availability for a player (used for UI and AI prompts). */
export function getLegalActions(state: MatchState, playerId: PlayerId, rules: RulesetConfig): LegalActionOption[] {
  const p = getPlayer(state, playerId);
  if (!p || !p.alive) return [];
  const others = alivePlayers(state)
    .filter((o) => o.id !== playerId)
    .map((o) => o.id);
  return ACTION_TYPES.map((action) => {
    const cost = rules.actions[action];
    const requiresTarget = TARGETED_ACTIONS.has(action);
    const requiresAmount = action === "trade";
    const maxAmount = requiresAmount ? p.credits : 0;
    let affordable = canAfford(p, cost);
    let reason: string | null = null;
    if (requiresAmount && p.credits < 1) {
      affordable = false;
      reason = "No credits to transfer";
    } else if (!affordable) {
      reason = "Insufficient resources";
    } else if (requiresTarget && others.length === 0) {
      affordable = false;
      reason = "No valid targets";
    }
    return {
      action,
      cost,
      requiresTarget,
      validTargets: requiresTarget ? others : [],
      requiresAmount,
      maxAmount,
      affordable,
      reasonUnavailable: reason,
    };
  });
}

/** Validate an action proposal against the authoritative state during commitment. */
export function validateProposal(
  state: MatchState,
  playerId: PlayerId,
  proposal: ActionProposal,
  rules: RulesetConfig,
): ValidationResult {
  if (state.phase !== "commitment") return fail(`Cannot commit during ${state.phase}`);
  const p = getPlayer(state, playerId);
  if (!p) return fail("Unknown player");
  if (!p.alive) return fail("Eliminated players cannot act");
  if (state.commitments[playerId]) return fail("Action already committed this round");
  if (!ACTION_TYPES.includes(proposal.action)) return fail("Unknown action");

  if ("targetId" in proposal) {
    if (proposal.targetId === playerId) return fail("Cannot target yourself");
    const t = getPlayer(state, proposal.targetId);
    if (!t) return fail("Unknown target");
    if (!t.alive) return fail("Target is eliminated");
  }
  if (proposal.action === "trade") {
    if (!Number.isInteger(proposal.amount) || proposal.amount < 1) return fail("Trade amount must be a positive integer");
  }
  const cost = actionCost(rules, proposal);
  if (!canAfford(p, cost)) {
    return fail(
      `Insufficient resources: needs ${cost.credits} credits, ${cost.intel} intel, ${cost.influence} influence`,
    );
  }
  return ok;
}

export function validateMessage(
  state: MatchState,
  playerId: PlayerId,
  msg: MessageInput,
  rules: RulesetConfig,
): ValidationResult {
  if (state.phase !== "negotiation") return fail(`Cannot message during ${state.phase}`);
  const p = getPlayer(state, playerId);
  if (!p) return fail("Unknown player");
  if (!p.alive) return fail("Eliminated players cannot negotiate");
  if (state.negotiationDone.includes(playerId)) return fail("You already ended negotiation this round");
  const sent = state.messages.filter((m) => m.round === state.round && m.fromId === playerId).length;
  if (sent >= rules.negotiation.maxMessagesPerRound) {
    return fail(`Message limit reached (${rules.negotiation.maxMessagesPerRound} per round)`);
  }
  const text = msg.text.trim();
  if (text.length === 0) return fail("Message is empty");
  if (text.length > rules.negotiation.maxMessageLength) {
    return fail(`Message exceeds ${rules.negotiation.maxMessageLength} characters`);
  }
  const offer = msg.offerCredits ?? 0;
  const pact = msg.proposePact ?? false;
  if (msg.toId !== null) {
    if (msg.toId === playerId) return fail("Cannot message yourself");
    const t = getPlayer(state, msg.toId);
    if (!t) return fail("Unknown recipient");
    if (!t.alive) return fail("Recipient is eliminated");
  } else if (offer > 0 || pact) {
    return fail("Offers and pacts must be private");
  }
  if (!Number.isInteger(offer) || offer < 0) return fail("Offer must be a non-negative integer");
  if (offer > rules.negotiation.maxOfferCredits) {
    return fail(`Offer exceeds the ${rules.negotiation.maxOfferCredits}-credit limit`);
  }
  if (offer > p.credits) return fail("Cannot offer more credits than you hold");
  return ok;
}

export function validateVote(state: MatchState, playerId: PlayerId, targetId: PlayerId | null): ValidationResult {
  if (state.phase !== "voting") return fail(`Cannot vote during ${state.phase}`);
  const p = getPlayer(state, playerId);
  if (!p) return fail("Unknown player");
  if (!p.alive) return fail("Eliminated players cannot vote");
  if (playerId in state.votes) return fail("Vote already cast");
  if (targetId !== null) {
    const t = getPlayer(state, targetId);
    if (!t) return fail("Unknown vote target");
    if (!t.alive) return fail("Cannot vote for an eliminated player");
  }
  return ok;
}

/**
 * Deterministic legal fallback used when a decision is missing or invalid.
 * Preference: RECOVER (always legal and free).
 */
export function fallbackProposal(): ActionProposal {
  return { action: "recover" };
}
