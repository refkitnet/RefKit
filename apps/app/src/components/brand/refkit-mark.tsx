import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type RefKitMarkProps = {
  href?: string | null;
  compact?: boolean;
  className?: string;
};

export function RefKitMark({
  href = "/",
  compact = false,
  className,
}: RefKitMarkProps) {
  const mark = (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight text-foreground",
        compact ? "text-sm" : "text-lg",
        className
      )}
    >
      <Image
        src="/refkit-logo.png"
        alt=""
        width={compact ? 24 : 32}
        height={compact ? 24 : 32}
        className={cn("shrink-0", compact ? "size-6" : "size-8")}
        priority
      />
      <span>RefKit</span>
    </span>
  );

  if (!href) {
    return mark;
  }

  return (
    <Link href={href} className="inline-flex hover:opacity-90">
      {mark}
    </Link>
  );
}
