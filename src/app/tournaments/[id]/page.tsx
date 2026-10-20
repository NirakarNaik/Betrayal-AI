import type { Metadata } from "next";
import { TournamentDashboard } from "@/components/TournamentDashboard";

export const metadata: Metadata = { title: "Tournament — Agent Fight Club" };

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentDashboard id={id} />;
}
