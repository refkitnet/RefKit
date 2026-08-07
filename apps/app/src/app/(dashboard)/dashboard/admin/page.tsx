"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/components/dashboard/auth-guard";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

const sections = [
  {
    href: "/dashboard/admin/accounts",
    label: "Accounts",
    description: "Apps, developers, and affiliates.",
  },
  {
    href: "/dashboard/admin/stripe-events",
    label: "Stripe events",
    description: "Inspect and retry stuck events.",
  },
  {
    href: "/dashboard/admin/transactions",
    label: "Transactions",
    description: "Revenue across all programs.",
  },
  {
    href: "/dashboard/admin/commissions",
    label: "Commissions",
    description: "Ledger entries and adjustments.",
  },
  {
    href: "/dashboard/admin/payout-runs",
    label: "Payout batches",
    description: "Export payout CSV for any batch.",
  },
  {
    href: "/dashboard/admin/audit-logs",
    label: "Audit log",
    description: "Admin and developer audited actions.",
  },
];

export default function AdminOverviewPage() {
  const { me } = useMe();
  const [testingEmail, setTestingEmail] = useState(false);
  const visibleSections = sections.filter(
    (section) =>
      me?.deployment.capabilities.managed_stripe
      || section.href !== "/dashboard/admin/stripe-events"
  );

  async function testEmailDelivery() {
    setTestingEmail(true);

    try {
      const result = await apiFetch<{ recipient: string }>(
        "/api/v1/admin/email-diagnostic",
        { method: "POST" }
      );
      toast.success(`Test email sent to ${result.recipient}.`);
    }
    catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send test email."
      );
    }
    finally {
      setTestingEmail(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Admin" />

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Email delivery</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Send a diagnostic message to your administrator email.
          </p>
          <Button
            variant="outline"
            onClick={testEmailDelivery}
            disabled={testingEmail}
          >
            {testingEmail ? "Sending..." : "Send test email"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleSections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="border-border/70 transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="text-base">{section.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {section.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
