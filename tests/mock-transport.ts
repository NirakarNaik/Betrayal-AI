import { COMMIT_JSON_SCHEMA, NEGOTIATION_JSON_SCHEMA } from "@/agents/schema";
import { getLlmConfig, type LlmConfig } from "@/llm/env";
import { LlmGateway, TransportError, type ModelTransport, type TransportRequest, type TransportResponse } from "@/llm/gateway";

export type Responder = (req: TransportRequest, call: number) => string | TransportError | TransportResponse;

/** Deterministic mock transport: never touches the network. */
export class MockTransport implements ModelTransport {
  calls: TransportRequest[] = [];
  constructor(private responder: Responder) {}
  async send(req: TransportRequest): Promise<TransportResponse> {
    this.calls.push(req);
    const r = this.responder(req, this.calls.length);
    if (r instanceof TransportError) throw r;
    if (typeof r !== "string") return r;
    return { text: r, model: req.model, stopReason: "end_turn", usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheCreationTokens: 0 } };
  }
}

/**
 * A sensible scripted agent: reads its own prompt (which only contains its
 * filtered view) and picks the first affordable legal action with a target.
 */
export const scriptedResponder: Responder = (req) => {
  const me = /YOU ARE (p\d)/.exec(req.user)?.[1] ?? "p1";
  if (req.schema === NEGOTIATION_JSON_SCHEMA) {
    const other = me === "p1" ? "p2" : "p1";
    return JSON.stringify({
      messages: [{ toId: other, text: `Pact, ${other}?`, offerCredits: 1, proposePact: true }],
      decisionSummary: "Seeking an ally.",
      beliefs: [{ playerId: other, trustDelta: 0.05, note: "potential ally" }],
    });
  }
  if (req.schema === COMMIT_JSON_SCHEMA) {
    const offers = [...req.user.matchAll(/- (msg_\w+) from/g)].map((m) => ({ messageId: m[1]!, accept: true }));
    const strike = /- strike \(3cr; targets ([\w,]+)\)\n/.exec(req.user);
    const round = Number(/ROUND (\d+)/.exec(req.user)?.[1] ?? 1);
    if (strike && round % 2 === 0) {
      return JSON.stringify({ offerResponses: offers, action: "strike", targetId: strike[1]!.split(",")[0], amount: null, message: null, decisionSummary: "Pressing.", beliefs: [] });
    }
    return JSON.stringify({ offerResponses: offers, action: round % 3 === 0 ? "guard" : "recover", targetId: null, amount: null, message: null, decisionSummary: "Building.", beliefs: [] });
  }
  const alive = /Choose targetId from ([\w, ]+) or null/.exec(req.user)?.[1]?.split(", ") ?? [];
  const target = alive.find((id) => id !== me) ?? null;
  return JSON.stringify({ targetId: target, decisionSummary: "Voting." });
};

export function testConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    ...getLlmConfig(),
    apiKeyPresent: true,
    modelCheap: "claude-haiku-4-5",
    modelStrategic: "claude-opus-5-5",
    matchBudgetUsd: 5,
    globalBudgetUsd: 50,
    maxRetries: 2,
    requestsPerMinute: 10_000,
    globalConcurrency: 8,
    perMatchConcurrency: 5,
    ...overrides,
  };
}

export function mockGateway(responder: Responder, overrides: Partial<LlmConfig> = {}) {
  const transport = new MockTransport(responder);
  const gateway = new LlmGateway(transport, testConfig(overrides), () => 0);
  return { transport, gateway };
}
