import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UserError } from "./controller";

export const humanCookieName = (matchId: string) => `afc_h_${matchId}`;

export function jsonError(e: unknown): NextResponse {
  if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  console.error("[api] unexpected error", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
