import { NextResponse } from "next/server";
import { CreateTournamentBody } from "@/server/api-schemas";
import { getController } from "@/server/controller";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ tournaments: await getController().listTournaments() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateTournamentBody.parse(await req.json());
    const record = await getController().createTournament(body);
    return NextResponse.json({ id: record.id });
  } catch (e) {
    return jsonError(e);
  }
}
