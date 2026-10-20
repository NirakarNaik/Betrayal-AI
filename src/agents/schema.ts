/**
 * Runtime schemas for model output. Parsing is a two-step process:
 *  1. Validate the raw JSON shape (all fields present, nullable where allowed).
 *  2. Convert to a discriminated-union ActionProposal so action-specific fields
 *     (target, amount) are validated per action.
 * Legality against game state is checked afterwards by the engine.
 */
import { z } from "zod";
import type { ActionProposal } from "@/game/types";

export const ACTION_ENUM = ["strike", "guard", "scout", "investigate", "sabotage", "trade", "mediate", "recover"] as const;

const BeliefSchema = z.object({
  playerId: z.string(),
  trustDelta: z.number(),
  note: z.string().nullable(),
});

export const RawNegotiationSchema = z.object({
  messages: z.array(
    z.object({
      toId: z.string().nullable(),
      text: z.string(),
      offerCredits: z.number().int().min(0),
      proposePact: z.boolean(),
    }),
  ),
  decisionSummary: z.string(),
  beliefs: z.array(BeliefSchema),
});

export const RawCommitSchema = z.object({
  offerResponses: z.array(z.object({ messageId: z.string(), accept: z.boolean() })),
  action: z.enum(ACTION_ENUM),
  targetId: z.string().nullable(),
  amount: z.number().int().nullable(),
  /** Optional statement; not used as game input (messages belong to negotiation). */
  message: z.string().nullable(),
  decisionSummary: z.string(),
  beliefs: z.array(BeliefSchema),
});

export const RawVoteSchema = z.object({
  targetId: z.string().nullable(),
  decisionSummary: z.string(),
});

const target = z.string().min(1);
export const ActionProposalSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("strike"), targetId: target }),
  z.object({ action: z.literal("guard") }),
  z.object({ action: z.literal("scout") }),
  z.object({ action: z.literal("investigate"), targetId: target }),
  z.object({ action: z.literal("sabotage"), targetId: target }),
  z.object({ action: z.literal("trade"), targetId: target, amount: z.number().int().positive() }),
  z.object({ action: z.literal("mediate"), targetId: target }),
  z.object({ action: z.literal("recover") }),
]);

export function toProposal(raw: { action: string; targetId: string | null; amount: number | null }):
  | { ok: true; proposal: ActionProposal }
  | { ok: false; error: string } {
  const candidate: Record<string, unknown> = { action: raw.action };
  if (raw.targetId !== null) candidate.targetId = raw.targetId;
  if (raw.amount !== null) candidate.amount = raw.amount;
  const parsed = ActionProposalSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "action"}: ${i.message}`).join("; ") };
  }
  return { ok: true, proposal: parsed.data as ActionProposal };
}

/** Extract the first JSON object from model text (tolerates surrounding prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("No JSON object found in model output");
  }
}

// ---------------------------------------------------------------------------
// JSON Schemas sent to the API as structured-output formats.
// ---------------------------------------------------------------------------

const nullable = (t: "string" | "integer") => ({ anyOf: [{ type: t }, { type: "null" }] });

const beliefJson = {
  type: "array",
  items: {
    type: "object",
    properties: { playerId: { type: "string" }, trustDelta: { type: "number" }, note: nullable("string") },
    required: ["playerId", "trustDelta", "note"],
    additionalProperties: false,
  },
} as const;

export const NEGOTIATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          toId: nullable("string"),
          text: { type: "string" },
          offerCredits: { type: "integer" },
          proposePact: { type: "boolean" },
        },
        required: ["toId", "text", "offerCredits", "proposePact"],
        additionalProperties: false,
      },
    },
    decisionSummary: { type: "string" },
    beliefs: beliefJson,
  },
  required: ["messages", "decisionSummary", "beliefs"],
  additionalProperties: false,
} as const;

export const COMMIT_JSON_SCHEMA = {
  type: "object",
  properties: {
    offerResponses: {
      type: "array",
      items: {
        type: "object",
        properties: { messageId: { type: "string" }, accept: { type: "boolean" } },
        required: ["messageId", "accept"],
        additionalProperties: false,
      },
    },
    action: { type: "string", enum: [...ACTION_ENUM] },
    targetId: nullable("string"),
    amount: nullable("integer"),
    message: nullable("string"),
    decisionSummary: { type: "string" },
    beliefs: beliefJson,
  },
  required: ["offerResponses", "action", "targetId", "amount", "message", "decisionSummary", "beliefs"],
  additionalProperties: false,
} as const;

export const VOTE_JSON_SCHEMA = {
  type: "object",
  properties: { targetId: nullable("string"), decisionSummary: { type: "string" } },
  required: ["targetId", "decisionSummary"],
  additionalProperties: false,
} as const;
