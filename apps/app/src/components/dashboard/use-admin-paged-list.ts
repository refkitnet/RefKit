"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch, type ListResponse } from "@/lib/api-client";

export function useAdminPagedList<T>(
  path: string,
  fixedParams?: Record<string, string | undefined>
) {
  const [rows, setRows] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (startingAfter?: string) => {
      setLoading(true);

      try {
        const query = new URLSearchParams({ limit: "25" });

        if (fixedParams) {
          for (const [key, value] of Object.entries(fixedParams)) {
            if (value) {
              query.set(key, value);
            }
          }
        }

        if (startingAfter) {
          query.set("starting_after", startingAfter);
        }

        const result = await apiFetch<ListResponse<T>>(
          `${path}?${query.toString()}`
        );

        setRows((current) =>
          startingAfter ? [...current, ...result.data] : result.data
        );
        setHasMore(result.has_more);
        setError(null);
      }
      catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load data";
        setError(message);
        toast.error(message);
      }
      finally {
        setLoading(false);
      }
    },
    [fixedParams, path]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial admin list fetch
    void load();
  }, [load]);

  return {
    rows,
    hasMore,
    loading,
    error,
    setError,
    load,
  };
}
