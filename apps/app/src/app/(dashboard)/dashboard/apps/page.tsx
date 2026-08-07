"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppIcon } from "@/components/dashboard/app-icon";
import { PageHeader } from "@/components/dashboard/page-header";
import { useOwnerContext } from "@/components/dashboard/layouts";
import { appOverviewHref } from "@/lib/dashboard-nav";

export default function AppsPage() {
  const router = useRouter();
  const { me, selectedOrg } = useOwnerContext();

  useEffect(() => {
    if (me && me.apps.length === 0) {
      router.replace("/dashboard");
    }
  }, [me, router]);

  if (!me) {
    return null;
  }

  if (me.apps.length === 0) {
    return null;
  }

  const apps = selectedOrg
    ? me.apps.filter((app) => app.organization_id === selectedOrg.id)
    : me.apps;

  if (apps.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Apps" />
        <p className="text-sm text-muted-foreground">
          No apps in this organization yet.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Apps">
        <span className="text-sm text-muted-foreground">
          {apps.length} {apps.length === 1 ? "app" : "apps"}
        </span>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        {apps.map((app) => (
          <Card key={app.id} className="gap-4 border-border/70 py-5">
            <CardHeader className="px-5">
              <div className="flex items-start gap-3">
                <AppIcon name={app.name} />
                <CardTitle className="truncate text-base">{app.name}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5">
              <Button asChild variant="outline" size="sm">
                <Link href={appOverviewHref(app.id)}>
                  Open dashboard
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
