"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CopyBlockProps = {
  value: string;
  label?: string;
  className?: string;
  codeClassName?: string;
  ariaLabel?: string;
  monospace?: boolean;
  wrap?: boolean;
  external?: boolean;
};

export function CopyBlock({
  value,
  label,
  className,
  codeClassName,
  ariaLabel = "Copy to clipboard",
  monospace = true,
  wrap = false,
  external = false,
}: CopyBlockProps) {
  const ContentTag = monospace ? "code" : "span";

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
      {label ? <Label className="text-sm font-medium">{label}</Label> : null}
      <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border bg-muted/40 p-2 pl-3">
        <ContentTag
          className={cn(
            "min-w-0 flex-1 text-xs text-foreground",
            wrap
              ? "break-all whitespace-pre-wrap"
              : "overflow-x-auto whitespace-pre",
            monospace && "font-mono",
            codeClassName,
          )}
        >
          {value}
        </ContentTag>
        <div className="flex shrink-0 items-center gap-0.5">
          {external ? (
            <Button type="button" variant="ghost" size="icon-sm" asChild>
              <a
                href={value}
                target="_blank"
                rel="noreferrer"
                aria-label="Open link"
              >
                <ExternalLink />
              </a>
            </Button>
          ) : null}
          <CopyButton value={value} ariaLabel={ariaLabel} />
        </div>
      </div>
    </div>
  );
}
