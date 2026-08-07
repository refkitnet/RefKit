import { ChevronDown } from "lucide-react";
import { REFKIT_PLATFORM_RULES } from "@/lib/compliance-copy";
import { cn } from "@/lib/utils";

type ProgramAgreementPanelProps = {
  termsText: string | null | undefined;
  versionNumber?: number | null;
  ownerHeading?: string;
  className?: string;
  /** Collapse long agreement text behind a summary (dashboard density). */
  collapsible?: boolean;
};

function AgreementBody({
  termsText,
  showPlatformRules = true,
}: {
  termsText: string | null | undefined;
  showPlatformRules?: boolean;
}) {
  return (
    <>
      {termsText ? (
        <p className="whitespace-pre-wrap text-foreground">{termsText}</p>
      ) : (
        <p className="text-muted-foreground">No App agreement published.</p>
      )}
      {showPlatformRules ? (
        <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
          <p className="font-medium text-foreground">RefKit rules</p>
          {REFKIT_PLATFORM_RULES.map((rule) => (
            <p key={rule} className="text-muted-foreground">
              {rule}
            </p>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ProgramAgreementPanel({
  termsText,
  versionNumber,
  ownerHeading = "App agreement",
  className,
  collapsible = false,
}: ProgramAgreementPanelProps) {
  if (collapsible) {
    return (
      <details className={cn("group", className)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{ownerHeading}</p>
            {versionNumber != null ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Version {versionNumber}
              </p>
            ) : null}
          </div>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 text-sm">
          <AgreementBody termsText={termsText} />
        </div>
      </details>
    );
  }

  const heading =
    versionNumber != null
      ? `${ownerHeading} (version ${versionNumber})`
      : ownerHeading;

  return (
    <div className={className}>
      <p className="font-medium text-foreground">{heading}</p>
      <div className="mt-2">
        <AgreementBody termsText={termsText} />
      </div>
    </div>
  );
}
