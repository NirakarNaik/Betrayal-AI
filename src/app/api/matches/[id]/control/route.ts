import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ControlBody } from "@/server/api-schemas";
import { getController } from "@/server/controller";
import { humanCookieName, jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const token = (await cookies()).get(humanCookieName(id))?.value ?? null;
    const body = ControlBody.parse(await req.json());
    await getController().control(id, body.op, body.speed, token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
