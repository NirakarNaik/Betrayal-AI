import type { Metadata } from "next";
import { TournamentLab } from "@/components/TournamentLab";

export const metadata: Metadata = { title: "Tournament Lab — Agent Fight Club" };

export default function TournamentsPage() {
  return <TournamentLab />;
}
