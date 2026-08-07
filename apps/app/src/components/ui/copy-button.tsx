"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COPY_RESET_MS = 1600;

export async function copyTextToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
}

type CopyButtonProps = {
  value: string;
  className?: string;
  variant?: "ghost" | "outline" | "secondary";
  size?: "icon-sm" | "icon" | "sm";
  ariaLabel?: string;
  onCopied?: () => void;
};

export function CopyButton({
  value,
  className,
  variant = "ghost",
  size = "icon-sm",
  ariaLabel = "Copy to clipboard",
  onCopied,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await copyTextToClipboard(value);
    setCopied(true);
    onCopied?.();
    window.setTimeout(() => setCopied(false), COPY_RESET_MS);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("shrink-0", className)}
      onClick={onCopy}
      aria-label={ariaLabel}
    >
      {copied ? <Check /> : <Clipboard />}
    </Button>
  );
}
