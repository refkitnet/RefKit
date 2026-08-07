"use client";

import { Code2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function RevenueSourceSwitch({
  revenueSource,
  switching = false,
  disabled = false,
  label = "How do customers pay you?",
  onSelect,
}: {
  revenueSource: "stripe" | "api" | null;
  switching?: boolean;
  disabled?: boolean;
  label?: string;
  onSelect: (source: "stripe" | "api") => void;
}) {
  const locked = switching || disabled;

  function select(source: "stripe" | "api") {
    if (source === revenueSource) {
      return;
    }

    onSelect(source);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
        <button
          type="button"
          role="radio"
          aria-checked={revenueSource === "stripe"}
          disabled={locked}
          onClick={() => select("stripe")}
          className={cn(
            "rounded-md border p-4 text-left transition-colors",
            revenueSource === "stripe"
              ? "border-foreground/20 bg-accent"
              : "border-border hover:bg-muted/40",
            locked && "opacity-60",
          )}
        >
          <div className="mb-3 flex min-h-10 items-center">
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Stripe
            </span>
          </div>
          <span className="text-sm font-medium">Stripe</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            RefKit reads referred payments and refunds from Stripe.
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={revenueSource === "api"}
          disabled={locked}
          onClick={() => select("api")}
          className={cn(
            "rounded-md border p-4 text-left transition-colors",
            revenueSource === "api"
              ? "border-foreground/20 bg-accent"
              : "border-border hover:bg-muted/40",
            locked && "opacity-60",
          )}
        >
          <div className="mb-3 flex min-h-10 items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md border bg-background">
              <Code2 className="size-5 text-muted-foreground" />
            </span>
            <span className="font-mono text-sm font-medium text-foreground">
              REST API
            </span>
          </div>
          <span className="text-sm font-medium">API reporting</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Report payments and refunds from your backend through the REST API
            or JavaScript SDK.
          </span>
        </button>
      </div>
    </div>
  );
}
