import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getController } from "@/server/controller";
import { humanCookieName, jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const token = (await cookies()).get(humanCookieName(id))?.value ?? null;
    // Omniscience is only ever granted by the server for all-AI matches.
    const omniscient = new URL(req.url).searchParams.get("omniscient") !== "0";
    const payload = await getController().getArena(id, token, omniscient);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
