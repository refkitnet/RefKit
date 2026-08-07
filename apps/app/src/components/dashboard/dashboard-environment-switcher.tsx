"use client";

import { FlaskConical, Rocket } from "lucide-react";
import { useOwnerContext } from "@/components/dashboard/owner-context";
import { Button } from "@/components/ui/button";
import type { AppEnvironment } from "@/lib/app-environment";
import { hasLiveDashboardInfo } from "@/lib/dashboard-display";
import type { SetupStatus } from "@/lib/dashboard-types";
import { cn } from "@/lib/utils";

export function DashboardEnvironmentSwitcher({
  className,
  onEnvironmentChange,
  setupStatus,
}: {
  className?: string;
  onEnvironmentChange?: (environment: AppEnvironment) => void;
  setupStatus?: SetupStatus | null;
}) {
  const { selectedAppId, environment, setEnvironment } = useOwnerContext();

  if (
    !selectedAppId
    || (setupStatus && hasLiveDashboardInfo(setupStatus))
  ) {
    return null;
  }

  function selectEnvironment(nextEnvironment: AppEnvironment) {
    if (nextEnvironment === environment) {
      return;
    }

    onEnvironmentChange?.(nextEnvironment);
    setEnvironment(nextEnvironment);
  }

  return (
    <div
      className={cn(
        "flex w-full shrink-0 items-center rounded-md border bg-background p-0.5 sm:w-auto",
        className,
      )}
      role="group"
      aria-label="Data environment"
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={environment === "test"}
        onClick={() => selectEnvironment("test")}
        className={cn(
          "h-7 flex-1 gap-1.5 px-2 text-xs sm:flex-none",
          environment === "test"
            && "bg-amber-100 text-amber-950 hover:bg-amber-100 hover:text-amber-950 dark:bg-amber-950/60 dark:text-amber-100",
        )}
      >
        <FlaskConical className="size-3.5" />
        Test
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={environment === "live"}
        onClick={() => selectEnvironment("live")}
        className={cn(
          "h-7 flex-1 gap-1.5 px-2 text-xs sm:flex-none",
          environment === "live" && "bg-primary text-primary-foreground",
        )}
      >
        <Rocket className="size-3.5" />
        Live
      </Button>
    </div>
  );
}
