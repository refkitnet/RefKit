import Link from "next/link";
import { RefKitMark } from "@/components/brand/refkit-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AuthPageLayoutProps = {
  children: React.ReactNode;
  maxWidth?: "md" | "lg";
  showPoweredBy?: boolean;
  header?: React.ReactNode;
  className?: string;
};

const maxWidthClass = {
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

export function AuthPageLayout({
  children,
  maxWidth = "md",
  showPoweredBy = false,
  header,
  className,
}: AuthPageLayoutProps) {
  return (
    <main
      className={cn(
        "flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10",
        className
      )}
    >
      {header ?? <RefKitMark />}
      <div className={cn("w-full", maxWidthClass[maxWidth])}>{children}</div>
      {showPoweredBy ? (
        <p className="text-xs text-muted-foreground">Powered by RefKit</p>
      ) : null}
      <Link
        href="/legal"
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Source and legal notices
      </Link>
    </main>
  );
}

export function AuthPageLoading({ maxWidth = "md" }: { maxWidth?: "md" | "lg" }) {
  return (
    <AuthPageLayout maxWidth={maxWidth}>
      <div className="space-y-4 rounded-xl border border-border/70 bg-card p-6 shadow-sm">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </AuthPageLayout>
  );
}
