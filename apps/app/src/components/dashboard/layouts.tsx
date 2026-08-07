"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthGuard, useMe } from "@/components/dashboard/auth-guard";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerProvider } from "@/components/dashboard/owner-context";
import { Toaster } from "@/components/ui/sonner";
import type { MeProfile } from "@/lib/dashboard-types";
import { adminHomeHref } from "@/lib/dashboard-nav";

export { useOwnerContext } from "@/components/dashboard/owner-context";

function OwnerDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, loading, refresh } = useMe();
  const shouldRedirectAdmin = Boolean(
    me?.is_admin &&
    !me.apps.length &&
    !pathname.startsWith("/dashboard/settings/account")
  );

  useEffect(() => {
    if (shouldRedirectAdmin) {
      router.replace(adminHomeHref());
    }
  }, [shouldRedirectAdmin, router]);

  if (!me || shouldRedirectAdmin) {
    return null;
  }

  return (
    <OwnerProvider me={me} loading={loading} refreshMe={refresh}>
      <DashboardShell me={me} mode="owner">
        {children}
      </DashboardShell>
    </OwnerProvider>
  );
}

function OwnerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OwnerDashboardShell>{children}</OwnerDashboardShell>;
}

function AdminDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { me } = useMe();

  useEffect(() => {
    if (me && !me.is_admin) {
      router.replace("/dashboard");
    }
  }, [me, router]);

  if (!me?.is_admin) {
    return null;
  }

  return (
    <DashboardShell me={me} mode="admin">
      {children}
    </DashboardShell>
  );
}

function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminDashboardShell>{children}</AdminDashboardShell>;
}

function AffiliateDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { me } = useMe();

  if (!me) {
    return null;
  }

  return (
    <DashboardShell me={me} mode="affiliate">
      {children}
    </DashboardShell>
  );
}

export function AffiliateDashboardLayout({
  children,
  initialMe,
}: {
  children: React.ReactNode;
  initialMe?: MeProfile | null;
}) {
  return (
    <AuthGuard initialMe={initialMe}>
      <AffiliateDashboardShell>{children}</AffiliateDashboardShell>
      <Toaster richColors closeButton />
    </AuthGuard>
  );
}

export function DashboardLayoutRouter({
  children,
  initialMe,
}: {
  children: React.ReactNode;
  initialMe: MeProfile;
}) {
  const pathname = usePathname();

  if (pathname.startsWith("/dashboard/admin")) {
    return (
      <AuthGuard initialMe={initialMe}>
        <AdminDashboardLayout>{children}</AdminDashboardLayout>
        <Toaster richColors closeButton />
      </AuthGuard>
    );
  }

  return (
    <AuthGuard initialMe={initialMe}>
      <OwnerDashboardLayout>{children}</OwnerDashboardLayout>
      <Toaster richColors closeButton />
    </AuthGuard>
  );
}
