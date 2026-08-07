"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { AppEnvironment } from "@/lib/app-environment";
import type { ProgramOverview } from "@/lib/dashboard-types";

export function useActivityOverview(
  appId: string,
  programFilter: string,
  environment: AppEnvironment,
) {
  const [overview, setOverview] = useState<ProgramOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const refreshOverview = useCallback(async () => {
    if (!appId) {
      setOverview(null);
      return;
    }

    setOverview(null);
    setLoadingOverview(true);

    try {
      const path = programFilter
        ? `/api/v1/programs/${programFilter}/overview?environment=${environment}`
        : `/api/v1/apps/${appId}/overview?environment=${environment}`;
      const result = await apiFetch<ProgramOverview>(path);
      setOverview(result);
    }
    catch {
      setOverview(null);
    }
    finally {
      setLoadingOverview(false);
    }
  }, [appId, environment, programFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshOverview().catch(() => {
      setOverview(null);
    });
  }, [refreshOverview]);

  return {
    overview,
    loadingOverview,
    refreshOverview,
  };
}
