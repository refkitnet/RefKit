"use client";

import {
  ChevronRight,
  CreditCard,
  KeyRound,
  ListTree,
  MousePointerClick,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SetupStatus } from "@/lib/dashboard-types";
import type { SetupStepTarget } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type ChecklistKey =
  | "program_launched"
  | "test_stripe_connected"
  | "test_api_key_created"
  | "test_affiliate_created"
  | "test_first_click"
  | "test_first_identify"
  | "test_first_revenue_event"
  | "test_first_commission"
  | "unattributed_revenue_alarm"
  | "cross_currency_alarm";

function stepForKey(key: ChecklistKey): SetupStepTarget | null {
  switch (key) {
    case "test_stripe_connected":
      return "billing";
    case "test_api_key_created":
      return "install";
    case "test_affiliate_created":
    case "test_first_click":
      return "click";
    case "test_first_identify":
      return "identify";
    case "test_first_revenue_event":
    case "test_first_commission":
      return "payment";
    default:
      return null;
  }
}

function getChecklistItems(status: SetupStatus) {
  const core =
    status.revenue_source === "api"
      ? [
          {
            key: "program_launched" as const,
            label: "Program created",
            icon: ListTree,
          },
          {
            key: "test_api_key_created" as const,
            label: "Test API key",
            help: "Choose manual or agent setup under App → Integration.",
            icon: KeyRound,
          },
        ]
      : [
          {
            key: "program_launched" as const,
            label: "Program created",
            icon: ListTree,
          },
          {
            key: "test_stripe_connected" as const,
            label: "Stripe test mode connected",
            help: "Connect Stripe test mode from Setup or App settings → Payments tracking.",
            icon: CreditCard,
          },
          {
            key: "test_api_key_created" as const,
            label: "Test API key",
            help: "Choose manual or agent setup under App → Integration.",
            icon: KeyRound,
          },
        ];

  return [
    ...core,
    {
      key: "test_affiliate_created" as const,
      label: "Test affiliate link ready",
      help: "Create the internal test link from Setup.",
      icon: UserCheck,
    },
    {
      key: "test_first_click" as const,
      label: "Test affiliate link opened",
      help: "Open a test affiliate link where RefKit is integrated.",
      icon: MousePointerClick,
    },
    {
      key: "test_first_identify" as const,
      label: "Test signup matched",
      help: "Sign up once with the test affiliate link active.",
      icon: UserCheck,
    },
    {
      key: "test_first_revenue_event" as const,
      label: "Test payment received",
      help: "Complete a Stripe test payment (including $0 trials) or report one with the test API key.",
      icon: CreditCard,
    },
    {
      key: "test_first_commission" as const,
      label: "Test commission created",
      help: "Complete an attributed test payment with a commissionable amount.",
      icon: CreditCard,
    },
    {
      key: "unattributed_revenue_alarm" as const,
      label: "Unattributed revenue",
      icon: TriangleAlert,
      alarm: true,
    },
    {
      key: "cross_currency_alarm" as const,
      label: "Cross-currency commission blocked",
      detailKey: "cross_currency_message" as const,
      icon: TriangleAlert,
      alarm: true,
    },
  ];
}

type SetupChecklistProps = {
  status: SetupStatus;
  showGoLiveNote?: boolean;
  onContinueSetup?: (step?: SetupStepTarget) => void;
};

export function SetupChecklist({
  status,
  showGoLiveNote = false,
  onContinueSetup,
}: SetupChecklistProps) {
  const checklistItems = getChecklistItems(status);
  const coreDone = status.test_integration_complete;
  const firstPending = checklistItems.find(
    (item) => !("alarm" in item && item.alarm) && !status[item.key],
  );
  const firstPendingStep = firstPending
    ? stepForKey(firstPending.key)
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Setup progress</CardTitle>
          <CardDescription>
            {coreDone
              ? "The full test integration is working."
              : "Finish the remaining test steps on Dashboard."}
          </CardDescription>
        </div>
        {onContinueSetup && !coreDone ? (
          <Button
            size="sm"
            onClick={() => onContinueSetup(firstPendingStep ?? undefined)}
          >
            Continue setup
            <ChevronRight />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {checklistItems.map((item) => {
            if ("alarm" in item && item.alarm) {
              if (!status[item.key]) {
                return null;
              }

              const detail =
                "detailKey" in item && item.detailKey
                  ? status[item.detailKey]
                  : null;

              return (
                <li key={item.key}>
                  <Alert variant="warning">
                    <item.icon />
                    <AlertTitle className="flex items-center justify-between gap-3 line-clamp-none">
                      <span className="truncate">{item.label}</span>
                      <Badge variant="warning">Alarm</Badge>
                    </AlertTitle>
                    {typeof detail === "string" && detail.length > 0 ? (
                      <AlertDescription>{detail}</AlertDescription>
                    ) : null}
                  </Alert>
                </li>
              );
            }

            const done = Boolean(status[item.key]);
            const step = stepForKey(item.key);
            const clickable = !done && Boolean(onContinueSetup) && Boolean(step);

            if (clickable && onContinueSetup && step) {
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onContinueSetup(step)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                        <item.icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {"help" in item && item.help ? (
                        <span className="pl-6 text-xs text-muted-foreground">
                          {item.help}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Badge variant="secondary">Fix</Badge>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </span>
                  </button>
                </li>
              );
            }

            return (
              <li
                key={item.key}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2",
                  done ? "bg-muted/40" : "bg-card",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                  <item.icon
                    className={cn(
                      "size-4 shrink-0",
                      done ? "text-success" : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <Badge variant={done ? "success" : "secondary"}>
                  {done ? "Done" : "Pending"}
                </Badge>
              </li>
            );
          })}
        </ul>

        {showGoLiveNote && coreDone ? (
          <p className="text-xs text-muted-foreground">
            Next: switch to Live setup when you are ready to set the production
            website, create a live API key, and connect live Stripe when needed.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
