import { NextResponse } from "next/server";
import { getController } from "@/server/controller";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recorded setup + inputs. Replays are rebuilt by the engine with no model calls. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await getController().getReplay(id));
  } catch (e) {
    return jsonError(e);
  }
}
