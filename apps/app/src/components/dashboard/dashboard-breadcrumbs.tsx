"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useOptionalOwnerContext } from "@/components/dashboard/owner-context";
import { useDashboardHomeNavLabel } from "@/components/dashboard/use-dashboard-home-nav-label";
import { apiFetch } from "@/lib/api-client";
import {
  ADMIN_NAV_ITEMS,
  appOverviewHref,
  appProgramsHref,
  dashboardHomeHref,
  accountSettingsHref,
} from "@/lib/dashboard-nav";
import type { MeProfile } from "@/lib/dashboard-types";

export function DashboardBreadcrumbs({ me }: { me?: MeProfile | null }) {
  const pathname = usePathname();
  const homeLabel = useDashboardHomeNavLabel();
  const params = useParams<{ appId?: string; programId?: string }>();
  const owner = useOptionalOwnerContext();
  const profile = me ?? owner?.me ?? null;
  const selectedApp = owner?.selectedApp ?? null;
  const [programMeta, setProgramMeta] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const appId = params.appId ?? "";
  const programId = params.programId ?? "";
  const app =
    profile?.apps.find((entry) => entry.id === appId) ?? selectedApp ?? null;
  const affiliateProgramName =
    profile?.program_affiliates.find(
      (entry) => entry.program_affiliate.program_id === programId
    )?.program.name ?? null;
  const programName =
    programMeta?.id === programId
      ? programMeta.name
      : affiliateProgramName;

  useEffect(() => {
    if (!programId || affiliateProgramName || pathname.startsWith("/affiliate")) {
      return;
    }

    let cancelled = false;

    apiFetch<{ name: string }>(`/api/v1/programs/${programId}`)
      .then((program) => {
        if (!cancelled) {
          setProgramMeta({ id: programId, name: program.name });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProgramMeta(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [affiliateProgramName, pathname, programId]);

  const crumbs = useMemo(() => {
    function ownerHomeCrumb(asPage = false) {
      if (asPage) {
        return (
          <BreadcrumbItem>
            <BreadcrumbPage>{homeLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        );
      }

      return (
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={dashboardHomeHref()}>{homeLabel}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
      );
    }

    if (pathname.startsWith("/affiliate")) {
      if (programId && pathname.endsWith("/payout")) {
        return (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/affiliate">Programs</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/affiliate/programs/${programId}`}>
                  {programName ?? "Program"}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Payout</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        );
      }

      if (programId) {
        return (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/affiliate">Programs</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{programName ?? "Program"}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        );
      }

      return (
        <BreadcrumbItem>
          <BreadcrumbPage>Programs</BreadcrumbPage>
        </BreadcrumbItem>
      );
    }

    if (
      pathname.startsWith("/dashboard/settings/account") ||
      pathname.startsWith("/affiliate/settings/account") ||
      pathname.startsWith("/dashboard/settings/organization")
    ) {
      const settingsHref = pathname.startsWith("/affiliate/")
        ? accountSettingsHref("affiliate")
        : accountSettingsHref("owner");

      return (
        <>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={settingsHref}>Settings</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Account</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (pathname.startsWith("/dashboard/admin")) {
      const adminItem = [...ADMIN_NAV_ITEMS]
        .reverse()
        .find((item) =>
          item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
        );

      if (!adminItem || adminItem.exact) {
        return (
          <BreadcrumbItem>
            <BreadcrumbPage>Admin</BreadcrumbPage>
          </BreadcrumbItem>
        );
      }

      return (
        <>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/admin">Admin</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{adminItem.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (pathname.startsWith("/dashboard/affiliates")) {
      return (
        <>
          {ownerHomeCrumb()}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Affiliates</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (pathname.startsWith("/dashboard/referrals")) {
      return (
        <>
          {ownerHomeCrumb()}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Referrals</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (pathname.startsWith("/dashboard/payouts")) {
      return (
        <>
          {ownerHomeCrumb()}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Payouts</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (pathname === "/dashboard/apps") {
      return (
        <>
          {ownerHomeCrumb()}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Apps</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (appId && pathname.endsWith("/programs")) {
      return (
        <>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={appOverviewHref(appId)}>{app?.name ?? "App"}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Programs</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (appId && programId) {
      return (
        <>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={appOverviewHref(appId)}>{app?.name ?? "App"}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={appProgramsHref(appId)}>Programs</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Program activity</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (appId) {
      return (
        <>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={appOverviewHref(appId)}>{app?.name ?? "App"}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>App settings</BreadcrumbPage>
          </BreadcrumbItem>
        </>
      );
    }

    if (pathname === "/dashboard" || pathname === "/dashboard/") {
      return ownerHomeCrumb(true);
    }

    return null;
  }, [app, appId, homeLabel, pathname, programId, programName]);

  if (!crumbs) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>{crumbs}</BreadcrumbList>
    </Breadcrumb>
  );
}
