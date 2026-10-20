import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { ActionProposal } from "@/game/types";
import { HumanActionBody } from "@/server/api-schemas";
import { getController } from "@/server/controller";
import { humanCookieName, jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const token = (await cookies()).get(humanCookieName(id))?.value ?? null;
    const body = HumanActionBody.parse(await req.json());
    const action = body.type === "commit" ? { type: "commit" as const, proposal: body.proposal as ActionProposal } : body;
    await getController().humanAction(id, token, action);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
