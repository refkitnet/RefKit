"use client";

import { AppWindow } from "lucide-react";
import { cn } from "@/lib/utils";

function getInitial(name: string | null | undefined) {
  const trimmed = name?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed[0]?.toUpperCase() ?? null;
}

export function AppIcon({
  name,
  logoUrl,
  className,
}: {
  name?: string | null;
  logoUrl?: string | null;
  className?: string;
}) {
  const initial = getInitial(name);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-sm font-semibold text-foreground",
        className
      )}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user logos are public Blob URLs with dynamic hostnames
        <img
          src={logoUrl}
          alt=""
          className="size-full rounded-[inherit] object-cover"
        />
      ) : (
        initial ?? <AppWindow className="size-4" />
      )}
    </span>
  );
}
