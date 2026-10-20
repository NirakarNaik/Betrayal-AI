/**
 * Secret objectives with explicit, code-evaluated completion predicates.
 * Objectives are assigned with the seeded PRNG and never changed mid-match.
 */
import type { RulesetConfig } from "./config";
import { pick, shuffle, type Rng } from "./random";
import type {
  MatchState,
  ObjectiveCategory,
  ObjectiveKind,
  PlayerId,
  PlayerState,
  SecretObjective,
} from "./types";

interface ObjectiveDef {
  kind: ObjectiveKind;
  category: ObjectiveCategory;
  title: string;
  describe: (rivalName: string | null) => string;
  needsRival: boolean;
}

export const OBJECTIVE_DEFS: Record<ObjectiveKind, ObjectiveDef> = {
  hoarder: {
    kind: "hoarder",
    category: "economic",
    title: "Hoarder",
    describe: () => "Survive and finish with at least as many credits as every other survivor.",
    needsRival: false,
  },
  pacifist: {
    kind: "pacifist",
    category: "survival",
    title: "Pacifist",
    describe: () => "Survive to the end without ever using STRIKE (a resolved strike counts even if it was blocked).",
    needsRival: false,
  },
  dealmaker: {
    kind: "dealmaker",
    category: "economic",
    title: "Dealmaker",
    describe: () =>
      "Complete at least two credit trades (accepted offers or resolved TRADE actions, as giver or receiver).",
    needsRival: false,
  },
  nemesis: {
    kind: "nemesis",
    category: "combat",
    title: "Nemesis",
    describe: (rival) =>
      `${rival ?? "Your rival"} must be eliminated, and you must have damaged them or voted in the vote that removed them.`,
    needsRival: true,
  },
  survivor: {
    kind: "survivor",
    category: "survival",
    title: "Survivor",
    describe: () => "Still be standing when the match ends.",
    needsRival: false,
  },
  iron_wall: {
    kind: "iron_wall",
    category: "survival",
    title: "Iron Wall",
    describe: () => "Survive and finish at full health.",
    needsRival: false,
  },
  clean_hands_voter: {
    kind: "clean_hands_voter",
    category: "social",
    title: "Clean Hands",
    describe: () =>
      "Survive, cast at least one vote, and never vote for a player who is still alive at the end.",
    needsRival: false,
  },
  spymaster: {
    kind: "spymaster",
    category: "intel",
    title: "Spymaster",
    describe: () => "Successfully INVESTIGATE at least two different players.",
    needsRival: false,
  },
  influencer: {
    kind: "influencer",
    category: "social",
    title: "Influencer",
    describe: () => "Finish with at least 2 influence (gained only through successful mediation).",
    needsRival: false,
  },
};

export const ALL_OBJECTIVE_KINDS = Object.keys(OBJECTIVE_DEFS) as ObjectiveKind[];

export function assignObjectives(
  rng: Rng,
  players: { id: PlayerId; name: string }[],
): Record<PlayerId, SecretObjective> {
  const kinds = shuffle(rng, ALL_OBJECTIVE_KINDS).slice(0, players.length);
  const out: Record<PlayerId, SecretObjective> = {};
  players.forEach((p, i) => {
    const def = OBJECTIVE_DEFS[kinds[i] as ObjectiveKind];
    let rivalId: PlayerId | null = null;
    let rivalName: string | null = null;
    if (def.needsRival) {
      const rival = pick(
        rng,
        players.filter((o) => o.id !== p.id),
      );
      rivalId = rival.id;
      rivalName = rival.name;
    }
    out[p.id] = {
      kind: def.kind,
      category: def.category,
      title: def.title,
      description: def.describe(rivalName),
      rivalId,
    };
  });
  return out;
}

export type ObjectiveStatus = "completed" | "failed" | "in_progress";

export interface ObjectiveProgress {
  status: ObjectiveStatus;
  detail: string;
}

/** Whether the rival's elimination was "earned" by this player per the nemesis rule. */
function contributedToElimination(state: MatchState, playerId: PlayerId, rivalId: PlayerId): boolean {
  const rival = state.players.find((p) => p.id === rivalId);
  if (!rival || rival.alive) return false;
  for (const e of state.events) {
    if (e.type === "ATTACK_RESOLVED" && e.data.attackerId === playerId && e.data.targetId === rivalId) {
      if (typeof e.data.damage === "number" && e.data.damage > 0) return true;
    }
    if (
      e.type === "VOTE_RESOLVED" &&
      e.data.eliminatedId === rivalId &&
      Array.isArray(e.data.votersForEliminated) &&
      (e.data.votersForEliminated as string[]).includes(playerId)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluate objective progress from recorded state and events.
 * `final` = true means the match is over, so conditional objectives are settled.
 */
export function evaluateObjective(
  state: MatchState,
  player: PlayerState,
  rules: RulesetConfig,
  final: boolean,
): ObjectiveProgress {
  const o = player.objective;
  const survivors = state.players.filter((p) => p.alive);
  const pending = (detail: string): ObjectiveProgress => ({
    status: final ? "failed" : "in_progress",
    detail,
  });
  switch (o.kind) {
    case "hoarder": {
      if (!player.alive) return { status: "failed", detail: "Eliminated." };
      const max = Math.max(...survivors.map((p) => p.credits));
      return player.credits >= max
        ? { status: final ? "completed" : "in_progress", detail: `Leading with ${player.credits} credits.` }
        : pending(`Trailing: ${player.credits} vs top ${max}.`);
    }
    case "pacifist": {
      if (player.stats.strikesUsed > 0) return { status: "failed", detail: "Used STRIKE." };
      if (!player.alive) return { status: "failed", detail: "Eliminated." };
      return { status: final ? "completed" : "in_progress", detail: "No strikes so far." };
    }
    case "dealmaker": {
      const n = player.stats.tradesCompleted;
      return n >= 2
        ? { status: "completed", detail: `${n} trades completed.` }
        : pending(`${n}/2 trades completed.`);
    }
    case "nemesis": {
      if (!o.rivalId) return { status: "failed", detail: "No rival assigned." };
      if (contributedToElimination(state, player.id, o.rivalId)) {
        return { status: "completed", detail: "Rival eliminated with your help." };
      }
      const rival = state.players.find((p) => p.id === o.rivalId);
      if (rival && !rival.alive) return { status: "failed", detail: "Rival fell without your help." };
      return pending("Rival still standing.");
    }
    case "survivor": {
      if (!player.alive) return { status: "failed", detail: "Eliminated." };
      return { status: final ? "completed" : "in_progress", detail: "Still standing." };
    }
    case "iron_wall": {
      if (!player.alive) return { status: "failed", detail: "Eliminated." };
      if (player.health < rules.caps.health) return { status: "failed", detail: "Took damage." };
      return { status: final ? "completed" : "in_progress", detail: "Full health." };
    }
    case "clean_hands_voter": {
      if (!player.alive) return { status: "failed", detail: "Eliminated." };
      const votes = player.stats.votesCast.filter((v) => v.targetId !== null);
      const badVote = votes.find((v) => {
        const t = state.players.find((p) => p.id === v.targetId);
        return t?.alive;
      });
      if (votes.length === 0) return pending("No votes cast yet.");
      if (badVote) return pending("A player you voted for is still alive.");
      return { status: final ? "completed" : "in_progress", detail: "All your votes hit eliminated players." };
    }
    case "spymaster": {
      const distinct = Object.keys(player.stats.investigationsByTarget).length;
      return distinct >= 2
        ? { status: "completed", detail: `Investigated ${distinct} players.` }
        : pending(`${distinct}/2 players investigated.`);
    }
    case "influencer": {
      return player.influence >= 2
        ? { status: final ? "completed" : "in_progress", detail: `${player.influence} influence.` }
        : pending(`${player.influence}/2 influence.`);
    }
  }
}
