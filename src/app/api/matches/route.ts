import { NextResponse } from "next/server";
import { CreateMatchBody } from "@/server/api-schemas";
import { getController } from "@/server/controller";
import { humanCookieName, jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ matches: await getController().listMatches(12) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateMatchBody.parse(await req.json());
    const { matchId, humanToken } = await getController().createMatch({
      mode: body.mode,
      rulesetId: body.rulesetId,
      seed: body.seed ?? null,
      speed: body.speed,
      humanName: body.humanName,
    });
    const res = NextResponse.json({ matchId, isParticipant: Boolean(humanToken) });
    if (humanToken) {
      // The token is the participant's credential; it never appears in a response body.
      res.cookies.set(humanCookieName(matchId), humanToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    }
    return res;
  } catch (e) {
    return jsonError(e);
  }
}
