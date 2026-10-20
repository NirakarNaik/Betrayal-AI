/**
 * Central, tunable ruleset for Betrayal Protocol.
 *
 * Every number the engine uses lives here. Rulesets are plain data so they can
 * be persisted with a match and replayed exactly.
 */
import type { ActionType } from "./types";

export interface ActionCost {
  credits: number;
  intel: number;
  influence: number;
}

export interface RulesetConfig {
  id: string;
  name: string;
  description: string;
  maxRounds: number;
  start: { health: number; credits: number; intel: number; influence: number };
  caps: { health: number; credits: number; intel: number; influence: number };
  negotiation: {
    maxMessagesPerRound: number;
    maxMessageLength: number;
    /** Offers not answered by the end of the commitment phase expire and are refunded. */
    offersExpireAtCommitmentEnd: true;
    maxOfferCredits: number;
  };
  pact: {
    /** A pact formed in round r lasts through round r + extraRounds (inclusive). */
    extraRounds: number;
  };
  actions: Record<ActionType, ActionCost>;
  effects: {
    strikeDamage: number;
    guardAbsorb: number;
    scoutIntel: number;
    sabotageCredits: number;
    recoverCredits: number;
    mediateSuccessInfluence: number;
    mediateTargetInfluence: number;
    investigateIntelCost: number;
  };
  voting: {
    /** Voting happens after the reveal phase of these rounds. */
    afterRounds: number[];
  };
  scoring: {
    placementPoints: number[];
    objectiveBonus: number;
    influenceWeight: number;
    healthWeight: number;
    creditsPerPoint: number;
  };
}

export const STANDARD_RULESET: RulesetConfig = {
  id: "standard-v1",
  name: "Standard Protocol",
  description: "Six rounds, votes after rounds 2, 4 and 6. The reference ruleset.",
  maxRounds: 6,
  start: { health: 3, credits: 10, intel: 2, influence: 1 },
  caps: { health: 3, credits: 20, intel: 5, influence: 3 },
  negotiation: {
    maxMessagesPerRound: 2,
    maxMessageLength: 280,
    offersExpireAtCommitmentEnd: true,
    maxOfferCredits: 5,
  },
  pact: { extraRounds: 1 },
  actions: {
    strike: { credits: 3, intel: 0, influence: 0 },
    guard: { credits: 1, intel: 0, influence: 0 },
    scout: { credits: 1, intel: 0, influence: 0 },
    investigate: { credits: 0, intel: 2, influence: 0 },
    sabotage: { credits: 2, intel: 0, influence: 0 },
    // Trade has no fee; the transferred amount is specified per action.
    trade: { credits: 0, intel: 0, influence: 0 },
    mediate: { credits: 0, intel: 0, influence: 1 },
    recover: { credits: 0, intel: 0, influence: 0 },
  },
  effects: {
    strikeDamage: 1,
    guardAbsorb: 1,
    scoutIntel: 1,
    sabotageCredits: 2,
    recoverCredits: 2,
    mediateSuccessInfluence: 2,
    mediateTargetInfluence: 1,
    investigateIntelCost: 2,
  },
  voting: { afterRounds: [2, 4, 6] },
  scoring: {
    placementPoints: [5, 3, 2, 1, 0],
    objectiveBonus: 4,
    influenceWeight: 1,
    healthWeight: 1,
    creditsPerPoint: 3,
  },
};

export const BLITZ_RULESET: RulesetConfig = {
  ...STANDARD_RULESET,
  id: "blitz-v1",
  name: "Blitz Protocol",
  description: "Four rounds, votes after rounds 2 and 4. Cheaper and faster.",
  maxRounds: 4,
  voting: { afterRounds: [2, 4] },
};

export const RULESETS: Record<string, RulesetConfig> = {
  [STANDARD_RULESET.id]: STANDARD_RULESET,
  [BLITZ_RULESET.id]: BLITZ_RULESET,
};

export function getRuleset(id: string): RulesetConfig {
  const r = RULESETS[id];
  if (!r) throw new Error(`Unknown ruleset: ${id}`);
  return r;
}

export const PLAYER_COUNT = 5;
