/**
 * Run local demo matches (heuristic agents, no API calls) and print results.
 * Usage: npm run simulate -- [matches=1] [seed=1]
 */
import { PERSONALITY_IDS, PERSONALITIES } from "@/agents/personalities";
import { createBrains } from "@/server/brains";
import { MatchSession } from "@/server/session";

async function main() {
  const count = Number(process.argv[2] ?? 1);
  const seed0 = Number(process.argv[3] ?? 1);
  for (let i = 0; i < count; i++) {
    const seed = seed0 + i;
    const players = PERSONALITY_IDS.map((pid, seat) => ({ id: `p${seat + 1}`, name: PERSONALITIES[pid].name, kind: "ai" as const, personalityId: pid }));
    const session = MatchSession.create({
      setup: { id: `sim_${seed}`, seed, rulesetId: "standard-v1", mode: "spectator", players, at: 0 },
      agentMode: "demo", speed: "accelerated", humanTokenHash: null, tournamentId: null, now: 0,
    });
    await session.runToCompletion(createBrains(session.state, "demo", null), { now: () => 0 });
    const s = session.state;
    if (count === 1) for (const e of s.events.filter((e) => e.visibility.scope === "public")) console.log(`R${e.round} ${e.phase.padEnd(11)} ${e.type.padEnd(22)} ${e.summary}`);
    const t = s.terminal!;
    console.log(`seed ${seed}: ${t.reason} after R${t.round}; ` + t.placements.map((p) => `${p.place}.${s.players.find((x) => x.id === p.playerId)!.name}(${p.protocolScore}${p.objectiveCompleted ? "★" : ""})`).join(" "));
  }
}
void main();
