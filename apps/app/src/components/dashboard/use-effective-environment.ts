"use client";

import { useEffect } from "react";
import { useOwnerContext } from "@/components/dashboard/owner-context";
import type { AppEnvironment } from "@/lib/app-environment";
import { hasLiveDashboardInfo } from "@/lib/dashboard-display";
import type { SetupStatus } from "@/lib/dashboard-types";

export function useEffectiveEnvironment(
  setupStatus: SetupStatus | null | undefined,
): AppEnvironment {
  const { environment, setEnvironment } = useOwnerContext();
  const lockLive = setupStatus ? hasLiveDashboardInfo(setupStatus) : false;

  useEffect(() => {
    if (lockLive && environment !== "live") {
      setEnvironment("live");
    }
  }, [lockLive, environment, setEnvironment]);

  return lockLive ? "live" : environment;
}
