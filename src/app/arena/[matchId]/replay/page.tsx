import type { Metadata } from "next";
import { ReplayView } from "@/components/ReplayView";

export const metadata: Metadata = { title: "Replay — Agent Fight Club" };

export default async function ReplayPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <ReplayView matchId={matchId} />;
}
