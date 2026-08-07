"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import type { MeProfile } from "@/lib/dashboard-types";

type MeContextValue = {
  me: MeProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const MeContext = createContext<MeContextValue | null>(null);

function MeProvider({
  children,
  initialMe,
}: {
  children: React.ReactNode;
  initialMe?: MeProfile | null;
}) {
  const [me, setMe] = useState<MeProfile | null>(initialMe ?? null);
  const [loading, setLoading] = useState(initialMe == null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const profile = await apiFetch<MeProfile>("/api/v1/me");
      setMe(profile);
      setError(null);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialMe != null) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- load session profile on mount
    refresh();
  }, [initialMe, refresh]);

  return (
    <MeContext.Provider value={{ me, loading, error, refresh }}>
      {children}
    </MeContext.Provider>
  );
}

export function useMe() {
  const context = useContext(MeContext);

  if (!context) {
    throw new Error("useMe must be used within AuthGuard");
  }

  return context;
}

function AuthGuardInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { me, loading, error } = useMe();

  useEffect(() => {
    if (!loading && error) {
      router.replace("/sign-in");
    }
  }, [loading, error, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (!me) {
    return null;
  }

  return <>{children}</>;
}

export function AuthGuard({
  children,
  initialMe,
}: {
  children: React.ReactNode;
  initialMe?: MeProfile | null;
}) {
  return (
    <MeProvider initialMe={initialMe}>
      <AuthGuardInner>{children}</AuthGuardInner>
    </MeProvider>
  );
}
