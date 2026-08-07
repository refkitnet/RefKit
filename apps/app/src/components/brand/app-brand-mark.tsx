import { AppIcon } from "@/components/dashboard/app-icon";
import { cn } from "@/lib/utils";

type AppBrandMarkProps = {
  name: string;
  logoUrl?: string | null;
  className?: string;
};

export function AppBrandMark({
  name,
  logoUrl,
  className,
}: AppBrandMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground",
        className
      )}
    >
      <AppIcon name={name} logoUrl={logoUrl} className="size-8 text-sm" />
      <span>{name}</span>
    </span>
  );
}
