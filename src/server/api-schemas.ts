import { z } from "zod";
import { ActionProposalSchema } from "@/agents/schema";

const personality = z.enum(["chessmaster", "snake", "politician", "chaos_gremlin", "quant"]);

export const CreateMatchBody = z.object({
  mode: z.enum(["spectator", "human"]),
  rulesetId: z.string().max(40),
  seed: z.number().int().min(0).max(0xffffffff).nullable().optional(),
  speed: z.enum(["standard", "accelerated"]).default("standard"),
  humanName: z.string().max(24).optional(),
});

export const HumanActionBody = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    message: z.object({
      toId: z.string().max(8).nullable(),
      text: z.string().max(400),
      offerCredits: z.number().int().min(0).max(100).optional(),
      proposePact: z.boolean().optional(),
    }),
  }),
  z.object({ type: z.literal("end_negotiation") }),
  z.object({ type: z.literal("respond_offer"), messageId: z.string().max(40), accept: z.boolean() }),
  z.object({ type: z.literal("commit"), proposal: ActionProposalSchema }),
  z.object({ type: z.literal("vote"), targetId: z.string().max(8).nullable() }),
]);

export const ControlBody = z.object({
  op: z.enum(["pause", "resume", "cancel", "speed"]),
  speed: z.enum(["standard", "accelerated"]).optional(),
});

export const CreateTournamentBody = z.object({
  name: z.string().max(60).optional(),
  matchCount: z.number().int().min(1).max(100),
  seedStart: z.number().int().min(0).max(0xffffffff).nullable().optional(),
  rulesetId: z.string().max(40),
  personalities: z.array(personality).length(5).optional(),
  rotateSeats: z.boolean().optional(),
});
