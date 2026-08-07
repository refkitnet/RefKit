"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AffiliateCommissionsTable } from "@/components/dashboard/affiliate-commissions-table";
import { useMe } from "@/components/dashboard/auth-guard";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ProgramFilter,
  programNameMap,
} from "@/components/dashboard/program-filter";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchAllPages } from "@/lib/api-client";
import {
  affiliateProgramOptions,
  filterByProgram,
  type AffiliateCommission,
} from "@/lib/affiliate-dashboard";

export default function AffiliateCommissionsPage() {
  const { me } = useMe();
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [programFilter, setProgramFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const programs = useMemo(
    () => (me ? affiliateProgramOptions(me) : []),
    [me]
  );
  const programNames = useMemo(() => programNameMap(programs), [programs]);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const result = await apiFetchAllPages<AffiliateCommission>(
        "/api/v1/commissions?limit=100"
      );
      setCommissions(result.data);
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load commissions"
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => undefined);
  }, [refresh]);

  if (!me) {
    return null;
  }

  const visibleCommissions = filterByProgram(commissions, programFilter)
    .slice()
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Commissions">
        <ProgramFilter
          programs={programs}
          value={programFilter}
          onChange={setProgramFilter}
        />
      </PageHeader>

      <Card className="border-border/70 py-5">
        <CardContent className="px-5">
          {loading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : (
            <AffiliateCommissionsTable
              commissions={visibleCommissions}
              programNames={programNames}
              showProgram={!programFilter && programs.length > 1}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
