"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useOwnerContext } from "@/components/dashboard/owner-context";
import type { ProgramOption } from "@/components/dashboard/program-filter";
import { apiFetch, apiFetchAllPages } from "@/lib/api-client";
import { canAccessOwnerActivityPages } from "@/lib/dashboard-display";
import { writeStoredProgramId } from "@/lib/dashboard-nav";
import type { SetupStatus } from "@/lib/dashboard-types";

export function useAppProgramScope() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    selectedAppId,
    selectedApp,
    environment,
    testWebsiteUrl,
    loading: meLoading,
  } = useOwnerContext();
  const appId = selectedAppId || selectedApp?.id || "";
  const [programsByApp, setProgramsByApp] = useState<{
    appId: string;
    programs: ProgramOption[];
  } | null>(null);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [setupByApp, setSetupByApp] = useState<{
    appId: string;
    status: SetupStatus;
  } | null>(null);
  const programsRequestGeneration = useRef(0);
  const setupRequestGeneration = useRef(0);

  const programFilter = searchParams.get("program") ?? "";
  const programsResolved = Boolean(appId && programsByApp?.appId === appId);
  const programs = useMemo(
    () => (programsResolved ? (programsByApp?.programs ?? []) : []),
    [programsByApp, programsResolved],
  );
  const setupStatus =
    appId && setupByApp?.appId === appId ? setupByApp.status : null;

  const refreshPrograms = useCallback(async () => {
    const generation = ++programsRequestGeneration.current;

    if (!appId) {
      setProgramsByApp(null);
      setLoadingPrograms(false);
      return;
    }

    setLoadingPrograms(true);

    try {
      const result = await apiFetchAllPages<ProgramOption>(
        `/api/v1/programs?app_id=${appId}&limit=100`,
      );

      if (generation === programsRequestGeneration.current) {
        setProgramsByApp({ appId, programs: result.data });
      }
    } catch (err) {
      if (generation === programsRequestGeneration.current) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load programs",
        );
      }
    } finally {
      if (generation === programsRequestGeneration.current) {
        setLoadingPrograms(false);
      }
    }
  }, [appId]);

  useEffect(() => {
    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPrograms().catch(() => {
      toast.error("Failed to load programs");
    });
  }, [refreshPrograms]);

  const refreshSetup = useCallback(async () => {
    const generation = ++setupRequestGeneration.current;

    if (!appId) {
      setSetupByApp(null);
      setLoadingSetup(false);
      return;
    }

    setLoadingSetup(true);

    try {
      const status = await apiFetch<SetupStatus>(
        `/api/v1/apps/${appId}/setup-status`,
      );

      if (generation === setupRequestGeneration.current) {
        setSetupByApp({ appId, status });
      }
    } catch {
      if (generation === setupRequestGeneration.current) {
        setSetupByApp(null);
      }
    } finally {
      if (generation === setupRequestGeneration.current) {
        setLoadingSetup(false);
      }
    }
  }, [appId]);

  useEffect(() => {
    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshSetup().catch(() => {
      setSetupByApp(null);
    });
  }, [refreshSetup]);

  const setProgramFilter = useCallback(
    (programId: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (programId) {
        params.set("program", programId);
        writeStoredProgramId(programId);
      } else {
        params.delete("program");
      }

      const query = params.toString();
      router.replace(query ? `?${query}` : "?");
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (
      !programFilter ||
      !programsResolved ||
      programs.some((program) => program.id === programFilter)
    ) {
      return;
    }

    setProgramFilter("");
  }, [programFilter, programs, programsResolved, setProgramFilter]);

  const validatedProgramFilter =
    programsResolved && programs.some((program) => program.id === programFilter)
      ? programFilter
      : "";

  const scopeQuery = useMemo(() => {
    if (!appId) {
      return null;
    }

    if (programFilter && !programsResolved) {
      return null;
    }

    if (validatedProgramFilter) {
      return `program_id=${validatedProgramFilter}`;
    }

    return `app_id=${appId}`;
  }, [appId, programFilter, programsResolved, validatedProgramFilter]);
  const listQuery = scopeQuery
    ? `${scopeQuery}&environment=${environment}`
    : null;
  const liveListQuery = scopeQuery ? `${scopeQuery}&environment=live` : "";

  const activityReady = canAccessOwnerActivityPages({
    hasApp: Boolean(appId),
    programCount: programs.length,
  });

  return {
    appId,
    appName: selectedApp?.name ?? null,
    defaultProgramId: selectedApp?.default_program_id ?? null,
    environment,
    testWebsiteUrl,
    hasApp: Boolean(appId),
    setupComplete: Boolean(
      setupStatus?.first_click && setupStatus.first_identify,
    ),
    setupReady: activityReady,
    setupStatus,
    meLoading,
    programs,
    loadingPrograms: loadingPrograms || Boolean(appId && !programsResolved),
    loadingSetup: loadingSetup || Boolean(appId && setupByApp?.appId !== appId),
    programFilter: validatedProgramFilter,
    setProgramFilter,
    scopeQuery,
    listQuery,
    liveListQuery,
    refreshPrograms,
    refreshSetup,
  };
}
