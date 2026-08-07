"use client";

import { useEffect, useState } from "react";
import { useOptionalOwnerContext } from "@/components/dashboard/owner-context";
import { dashboardHomeNavLabel } from "@/lib/dashboard-nav";
import {
  ONBOARDING_CHANGE_EVENT,
  readOnboardingAcknowledgedAppId,
} from "@/lib/onboarding";

export function useDashboardHomeNavLabel() {
  const owner = useOptionalOwnerContext();
  const [acknowledgedAppId, setAcknowledgedAppId] = useState(() =>
    readOnboardingAcknowledgedAppId(),
  );

  useEffect(() => {
    function syncAcknowledged() {
      setAcknowledgedAppId(readOnboardingAcknowledgedAppId());
    }

    window.addEventListener(ONBOARDING_CHANGE_EVENT, syncAcknowledged);
    return () => {
      window.removeEventListener(ONBOARDING_CHANGE_EVENT, syncAcknowledged);
    };
  }, []);

  return dashboardHomeNavLabel({
    hasApps: Boolean(owner?.me?.apps.length),
    appId: owner?.selectedAppId ?? "",
    acknowledgedAppId,
  });
}
