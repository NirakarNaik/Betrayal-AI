import { ClaudeBrain } from "@/agents/claude-brain";
import { HeuristicBrain } from "@/agents/heuristic";
import type { AgentBrain } from "@/agents/types";
import type { MatchState, PlayerId } from "@/game/types";
import type { LlmGateway } from "@/llm/gateway";
import type { AgentMode } from "./session";

export function createBrains(
  state: MatchState,
  mode: AgentMode,
  gateway: LlmGateway | null,
  tournamentId: string | null = null,
): Record<PlayerId, AgentBrain> {
  const brains: Record<PlayerId, AgentBrain> = {};
  for (const p of state.players) {
    if (p.kind !== "ai") continue;
    brains[p.id] = mode === "live" && gateway ? new ClaudeBrain(gateway, { tournamentId }) : new HeuristicBrain();
  }
  return brains;
}
