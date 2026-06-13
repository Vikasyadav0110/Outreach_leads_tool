"use client";

import { useEffect, useState } from "react";
import OnboardingWizard from "./OnboardingWizard";
import NewCampaignCard from "./NewCampaignCard";

// Shown when there are no campaigns yet. New users get the onboarding wizard;
// anyone who skipped before (persisted in localStorage) gets the plain creator.
export default function EmptyDashboard({ mock }) {
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("op_onboarded") === "1") setSkipped(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (skipped) return <NewCampaignCard />;

  return (
    <OnboardingWizard
      mock={mock}
      onSkip={() => {
        try {
          localStorage.setItem("op_onboarded", "1");
        } catch {
          /* ignore */
        }
        setSkipped(true);
      }}
    />
  );
}
