"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronsUpDown,
  Compass,
  DollarSign,
  ExternalLink,
  BookOpen,
  LayoutDashboard,
  LifeBuoy,
  ListTree,
  LogOut,
  Megaphone,
  MousePointerClick,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { UserDisplay } from "@/components/dashboard/user-display";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  REFKIT_NETWORK_ACCESSIBLE,
} from "@/lib/closed-beta";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppIcon } from "@/components/dashboard/app-icon";
import { ContactSupportDialog } from "@/components/dashboard/contact-support-dialog";
import { DashboardBreadcrumbs } from "@/components/dashboard/dashboard-breadcrumbs";
import { useDashboardHomeNavLabel } from "@/components/dashboard/use-dashboard-home-nav-label";
import { RefKitMark } from "@/components/brand/refkit-mark";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useOwnerContext } from "@/components/dashboard/owner-context";
import {
  appOverviewHref,
  appProgramsHref,
  ADMIN_NAV_ITEMS,
  adminHomeHref,
  dashboardAffiliatesHref,
  dashboardHomeHref,
  dashboardPayoutsHref,
  dashboardReferralsHref,
  accountSettingsHref,
} from "@/lib/dashboard-nav";
import { apiFetchAllPages } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { REFKIT_DOCS_URL } from "@/lib/integration-guides";
import type { MeProfile } from "@/lib/dashboard-types";

type DashboardShellProps = {
  me: MeProfile;
  mode: "owner" | "affiliate" | "admin";
  children: React.ReactNode;
};

function AppSwitcher() {
  const { me, selectedAppId, setSelectedAppId } = useOwnerContext();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const activeApp = me?.apps.find((app) => app.id === selectedAppId) ?? null;
  const activeAppName = activeApp?.name ?? "Select app";

  const groupedApps = useMemo(() => {
    if (!me) {
      return [];
    }

    if (me.organizations.length <= 1) {
      return [{ org: me.organizations[0] ?? null, apps: me.apps }];
    }

    return me.organizations.map((org) => ({
      org,
      apps: me.apps.filter((app) => app.organization_id === org.id),
    }));
  }, [me]);

  if (!me?.apps.length) {
    return (
      <div className="px-2 py-1.5">
        <RefKitMark
          href="/dashboard"
          compact={isCollapsed && !isMobile}
          className={cn(isCollapsed && !isMobile && "[&>span]:hidden")}
        />
      </div>
    );
  }

  // Match SidebarMenuButton horizontal inset (group p-2 + button p-2).
  const appRow = (
    <div
      className={cn(
        "flex w-full items-center gap-2 px-2 py-1.5",
        isCollapsed && "justify-center px-0",
      )}
    >
      <AppIcon
        name={activeApp?.name}
        logoUrl={activeApp?.logo_url}
        className="size-8 shrink-0 rounded-md text-xs"
      />
      {!isCollapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
            {activeAppName}
          </span>
          {me.apps.length > 1 ? (
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          ) : null}
        </>
      ) : null}
    </div>
  );

  if (me.apps.length === 1) {
    if (isCollapsed && !isMobile) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{appRow}</div>
          </TooltipTrigger>
          <TooltipContent side="right" align="center">
            {activeAppName}
          </TooltipContent>
        </Tooltip>
      );
    }

    return appRow;
  }

  return (
    <DropdownMenu>
      {isCollapsed && !isMobile ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Switch app, current app: ${activeAppName}`}
                className="w-full rounded-md hover:bg-sidebar-accent"
              >
                {appRow}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" align="center">
            {activeAppName}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>
          <button type="button" className="w-full rounded-md hover:bg-sidebar-accent">
            {appRow}
          </button>
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        align="start"
        side={isCollapsed ? "right" : "bottom"}
        sideOffset={isCollapsed ? 8 : 4}
        className="w-72"
      >
        <DropdownMenuLabel>Apps</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {groupedApps.map(({ org, apps }) => (
            <div key={org?.id ?? "default"}>
              {me.organizations.length > 1 && org ? (
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {org.name}
                </DropdownMenuLabel>
              ) : null}
              {apps.map((app) => (
                <DropdownMenuItem
                  key={app.id}
                  className={cn("gap-2", app.id === selectedAppId && "bg-accent")}
                  onClick={() => {
                    if (app.id === selectedAppId) {
                      return;
                    }

                    setSelectedAppId(app.id);

                    if (pathname.startsWith("/dashboard/apps/")) {
                      router.push(appOverviewHref(app.id));
                    }
                    else if (
                      [
                        "/dashboard/affiliates",
                        "/dashboard/referrals",
                        "/dashboard/payouts",
                      ].some((path) => (
                        pathname === path || pathname.startsWith(`${path}/`)
                      ))
                    ) {
                      const params = new URLSearchParams(searchParams.toString());
                      params.delete("program");
                      const query = params.toString();
                      router.push(query ? `${pathname}?${query}` : pathname);
                    }
                  }}
                >
                  <AppIcon
                    name={app.name}
                    logoUrl={app.logo_url}
                    className="size-6 text-xs"
                  />
                  <span className="truncate">{app.name}</span>
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OwnerSidebarNav() {
  const pathname = usePathname();
  const homeLabel = useDashboardHomeNavLabel();
  const { me, selectedAppId } = useOwnerContext();
  const [supportOpen, setSupportOpen] = useState(false);
  const [programsByApp, setProgramsByApp] = useState<{
    appId: string;
    programs: Array<{ id: string; name: string }>;
  } | null>(null);
  const programs =
    selectedAppId && programsByApp?.appId === selectedAppId
      ? programsByApp.programs
      : [];
  const activeApp = me?.apps.find((app) => app.id === selectedAppId) ?? null;
  const scopedProgramId =
    programs.find((program) => program.id === activeApp?.default_program_id)?.id
    ?? (programs.length === 1 ? programs[0]?.id : undefined);
  const programsHref = selectedAppId
    ? appProgramsHref(selectedAppId)
    : "/dashboard/apps";
  const appHref = selectedAppId
    ? appOverviewHref(selectedAppId)
    : "/dashboard/apps";

  useEffect(() => {
    if (!selectedAppId) {
      return;
    }

    let cancelled = false;

    async function loadPrograms() {
      const programResult = await apiFetchAllPages<{ id: string; name: string }>(
        `/api/v1/programs?app_id=${selectedAppId}&limit=100`
      );

      if (!cancelled) {
        setProgramsByApp({
          appId: selectedAppId,
          programs: programResult.data,
        });
      }
    }

    loadPrograms().catch(() => {
      if (!cancelled) {
        setProgramsByApp({
          appId: selectedAppId,
          programs: [],
        });
      }
    });

    const interval = window.setInterval(() => {
      loadPrograms().catch(() => undefined);
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pathname, selectedAppId]);

  const opsLinks = [
    {
      href: dashboardAffiliatesHref(scopedProgramId),
      label: "Affiliates",
      icon: Users,
      active: pathname.startsWith("/dashboard/affiliates"),
    },
    {
      href: dashboardReferralsHref(scopedProgramId),
      label: "Referrals",
      icon: MousePointerClick,
      active: pathname.startsWith("/dashboard/referrals"),
    },
    {
      href: dashboardPayoutsHref(scopedProgramId),
      label: "Payouts",
      icon: Wallet,
      active: pathname.startsWith("/dashboard/payouts"),
    },
  ];

  const appLinks = [
    {
      id: "programs",
      href: programsHref,
      label: "Programs",
      icon: Megaphone,
      active: selectedAppId
        ? pathname.startsWith(appProgramsHref(selectedAppId))
        : pathname === "/dashboard/apps" || pathname === "/dashboard/apps/",
    },
    ...(selectedAppId
      ? [
          {
            id: "app",
            href: appHref,
            label: "App settings",
            icon: Settings,
            active:
              pathname === appOverviewHref(selectedAppId)
              || pathname === `${appOverviewHref(selectedAppId)}/`,
          },
        ]
      : []),
  ];

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={
                  pathname === "/dashboard" || pathname === "/dashboard/"
                }
              >
                <Link href={dashboardHomeHref()}>
                  <LayoutDashboard />
                  <span>{homeLabel}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Activity</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {opsLinks.map((link) => (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton asChild isActive={link.active}>
                  <Link href={link.href}>
                    <link.icon />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Manage</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {appLinks.map((link) => (
              <SidebarMenuItem key={link.id}>
                <SidebarMenuButton asChild isActive={link.active}>
                  <Link href={link.href}>
                    <link.icon />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {me?.deployment.capabilities.refkit_support ? (
        <>
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel>Help</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a
                      href={REFKIT_DOCS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <BookOpen />
                      <span>Docs</span>
                      <ExternalLink className="ml-auto size-3.5 opacity-60" />
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setSupportOpen(true)}>
                    <LifeBuoy />
                    <span>Contact support</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <ContactSupportDialog
            open={supportOpen}
            onOpenChange={setSupportOpen}
            email={me.email ?? null}
          />
        </>
      ) : null}
    </>
  );
}

function PortalSidebarHeader({ mode }: { mode: "affiliate" | "admin" }) {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="px-1 py-1">
      <RefKitMark
        href={mode === "admin" ? adminHomeHref() : "/affiliate"}
        compact={isCollapsed && !isMobile}
        className={cn(isCollapsed && !isMobile && "[&>span]:hidden")}
      />
      {mode === "admin" ? (
        <p className="mt-2 px-1 text-xs font-medium text-muted-foreground">
          Admin
        </p>
      ) : !isCollapsed || isMobile ? (
        <p className="mt-2 px-1 text-xs font-medium text-muted-foreground">
          Affiliate portal
        </p>
      ) : null}
    </div>
  );
}

function AffiliateSidebarNav({
  officialNetwork,
}: {
  officialNetwork: boolean;
}) {
  const pathname = usePathname();

  const links = [
    {
      href: "/affiliate",
      label: "Home",
      icon: LayoutDashboard,
      active:
        pathname === "/affiliate" ||
        pathname.startsWith("/affiliate/programs/"),
      badge: null as string | null,
    },
    ...(officialNetwork
      ? [{
          href: "/affiliate/network",
          label: "Network",
          icon: Compass,
          active: pathname.startsWith("/affiliate/network"),
          badge: REFKIT_NETWORK_ACCESSIBLE ? null : "Beta",
        }]
      : []),
    {
      href: "/affiliate/commissions",
      label: "Commissions",
      icon: DollarSign,
      active: pathname.startsWith("/affiliate/commissions"),
      badge: null as string | null,
    },
    {
      href: "/affiliate/payouts",
      label: "Payouts",
      icon: Wallet,
      active: pathname.startsWith("/affiliate/payouts"),
      badge: null as string | null,
    },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {links.map((link) => (
            <SidebarMenuItem key={link.href}>
              <SidebarMenuButton asChild isActive={link.active}>
                <Link href={link.href}>
                  <link.icon />
                  <span>{link.label}</span>
                  {link.badge ? (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {link.badge}
                    </Badge>
                  ) : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AdminSidebarNav({ managedStripe }: { managedStripe: boolean }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {ADMIN_NAV_ITEMS
            .filter((item) => managedStripe || item.href !== "/dashboard/admin/stripe-events")
            .map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link href={item.href}>
                    {item.href === adminHomeHref() ? (
                      <Shield />
                    ) : (
                      <ListTree />
                    )}
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserFooter({
  me,
  mode,
}: {
  me: MeProfile;
  mode: "owner" | "affiliate" | "admin";
}) {
  const router = useRouter();
  const otherModeHref =
    mode === "owner"
      ? me.program_affiliates.length > 0
        ? "/affiliate"
        : null
      : mode === "admin"
        ? dashboardHomeHref()
        : "/dashboard";
  const otherModeLabel =
    mode === "owner"
      ? "Affiliate portal"
      : mode === "admin"
        ? "Developer dashboard"
        : "Developer dashboard";

  async function onSignOut() {
    await authClient.signOut();
    router.replace("/sign-in");
  }

  return (
    <div className="flex flex-col gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-3 px-2 py-2"
          >
            <UserDisplay
              id={me.id}
              name={me.name}
              email={me.email}
              image={me.image}
              size="default"
              showName={false}
              className="size-8"
            />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium">
                {me.name ?? "Account"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {me.email}
              </p>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="w-56"
          sideOffset={8}
        >
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-foreground">
                {me.name ?? "Account"}
              </p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {me.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={accountSettingsHref(mode)}>
                <Settings />
                Account settings
              </Link>
            </DropdownMenuItem>
            <ThemeSwitcher />
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {mode === "admin" && me.organizations.length > 0 ? (
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href={dashboardHomeHref()}>{otherModeLabel}</Link>
        </Button>
      ) : null}

      {mode !== "admin" && otherModeHref && me.organizations.length > 0 ? (
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href={otherModeHref}>{otherModeLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function DashboardShell({ me, mode, children }: DashboardShellProps) {
  const pathname = usePathname();
  const capabilities = me.deployment.capabilities;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="p-2">
          {mode === "owner" ? (
            <AppSwitcher />
          ) : (
            <PortalSidebarHeader mode={mode === "admin" ? "admin" : "affiliate"} />
          )}
        </SidebarHeader>

        <SidebarContent>
          {mode === "owner" ? (
            <OwnerSidebarNav />
          ) : mode === "admin" ? (
            <AdminSidebarNav managedStripe={capabilities.managed_stripe} />
          ) : (
            <AffiliateSidebarNav
              officialNetwork={capabilities.official_network}
            />
          )}

          {mode === "owner" && me.is_admin ? (
            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/dashboard/admin")}
                    >
                      <Link href="/dashboard/admin">
                        <Shield />
                        <span>Admin</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter>
        <UserFooter me={me} mode={mode} />
        <Link
          href="/legal"
          className="px-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Source and legal notices
        </Link>
      </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <DashboardBreadcrumbs me={me} />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
