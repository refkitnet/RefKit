"use client";

import { Info } from "lucide-react";
import { useOwnerContext } from "@/components/dashboard/owner-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { normalizeWebsiteUrl } from "@refkitnet/validation";

export function isUsableTestWebsiteUrl(url: string) {
  if (!url.trim()) {
    return false;
  }

  try {
    normalizeWebsiteUrl(url);
    return true;
  }
  catch {
    return false;
  }
}

export function TestWebsiteUrlForm({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { testWebsiteUrl, setTestWebsiteUrl } = useOwnerContext();

  return (
    <div className={`flex flex-col ${compact ? "gap-3" : "gap-4"}`}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="dashboard-test-website-url" className="flex items-center gap-1.5">
          Local or staging website URL
          {compact ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="About the Test website URL"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-xs">
                Used only to build test links and prompts in this browser. It does not change the live App or Program destination.
              </TooltipContent>
            </Tooltip>
          ) : null}
        </Label>
        <Input
          id="dashboard-test-website-url"
          placeholder="http://localhost:5173"
          value={testWebsiteUrl}
          onChange={(event) => setTestWebsiteUrl(event.target.value)}
        />
        {!compact ? (
          <p className="text-xs text-muted-foreground">
            Used only to build test links and prompts in this browser. It does
            not change the live App or Program destination.
          </p>
        ) : null}
      </div>
    </div>
  );
}
