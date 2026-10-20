import type { Metadata } from "next";
import { Suspense } from "react";
import { MatchSetupForm } from "@/components/MatchSetupForm";

export const metadata: Metadata = { title: "New Match — Agent Fight Club" };

export default function NewMatchPage() {
  return (
    <Suspense>
      <MatchSetupForm />
    </Suspense>
  );
}
