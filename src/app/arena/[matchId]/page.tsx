import type { Metadata } from "next";
import { ArenaView } from "@/components/ArenaView";

export const metadata: Metadata = { title: "Live Arena — Agent Fight Club" };

export default async function ArenaPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <ArenaView matchId={matchId} />;
}
