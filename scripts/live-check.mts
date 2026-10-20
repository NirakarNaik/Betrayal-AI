/** Live smoke test: one real Claude decision per purpose on each model. Costs well under $0.10. */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#") && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
}
const { ClaudeBrain } = await import("@/agents/claude-brain");
const { PERSONALITY_IDS, PERSONALITIES } = await import("@/agents/personalities");
const { AnthropicTransport, LlmGateway } = await import("@/llm/gateway");
const { getLlmConfig } = await import("@/llm/env");
const { MatchSession } = await import("@/server/session");

const base = getLlmConfig();
for (const model of [base.modelCheap, base.modelStrategic]) {
  const gw = new LlmGateway(new AnthropicTransport(), { ...base, modelCheap: model, modelStrategic: model });
  const brain = new ClaudeBrain(gw);
  const s = MatchSession.create({
    setup: { id: "live_check", seed: 9, rulesetId: "blitz-v1", mode: "spectator", at: 0, players: PERSONALITY_IDS.map((p, i) => ({ id: `p${i + 1}`, name: PERSONALITIES[p].name, kind: "ai" as const, personalityId: p })) },
    agentMode: "live", speed: "accelerated", humanTokenHash: null, tournamentId: null, now: 0,
  });
  const n = await brain.negotiate(s.observation("p2"));
  console.log(`[${model}] negotiate:`, n.meta.source, n.meta.errors, JSON.stringify(n.decision.messages).slice(0, 220));
  s.apply({ kind: "advance", at: 1, force: true });
  const c = await brain.commit(s.observation("p2"));
  console.log(`[${model}] commit:`, c.meta.source, c.meta.errors, JSON.stringify(c.decision.proposal), c.decision.summary);
  const u = [...n.meta.usage, ...c.meta.usage];
  console.log(`[${model}] usage:`, u.map((r) => `${r.outcome} in=${r.inputTokens} out=${r.outputTokens} cacheR=${r.cacheReadTokens} ${r.durationMs}ms $${r.estimatedCostUsd.toFixed(5)}`).join(" | "));
}
