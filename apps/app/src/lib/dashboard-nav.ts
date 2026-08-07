export const STORAGE_KEY_PROGRAM = "refkit:lastProgramId";

export function appOverviewHref(appId: string) {
  return `/dashboard/apps/${appId}`;
}

export function appProgramsHref(appId: string) {
  return `/dashboard/apps/${appId}/programs`;
}

export function accountSettingsHref(mode: "owner" | "affiliate" | "admin") {
  if (mode === "affiliate") {
    return "/affiliate/settings/account";
  }

  return "/dashboard/settings/account";
}

export function dashboardHomeHref() {
  return "/dashboard";
}

export function isOwnerOnboardingActive(options: {
  hasApps: boolean;
  appId: string;
  acknowledgedAppId?: string;
}) {
  if (!options.hasApps) {
    return true;
  }

  if (!options.appId) {
    return false;
  }

  return (options.acknowledgedAppId ?? "") !== options.appId;
}

export function dashboardHomeNavLabel(options: {
  hasApps: boolean;
  appId: string;
  acknowledgedAppId?: string;
}) {
  return isOwnerOnboardingActive(options) ? "Onboarding" : "Dashboard";
}

export function adminHomeHref() {
  return "/dashboard/admin";
}

export function affiliateHomeHref() {
  return "/affiliate";
}

type AdminNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/dashboard/admin", label: "Overview", exact: true },
  { href: "/dashboard/admin/accounts", label: "Accounts" },
  { href: "/dashboard/admin/stripe-events", label: "Stripe events" },
  { href: "/dashboard/admin/transactions", label: "Transactions" },
  { href: "/dashboard/admin/commissions", label: "Commissions" },
  { href: "/dashboard/admin/payout-runs", label: "Payout batches" },
  { href: "/dashboard/admin/audit-logs", label: "Audit log" },
];

export function homePathForDefaultMode(
  defaultMode: "owner" | "affiliate" | null
) {
  if (defaultMode === "affiliate") {
    return affiliateHomeHref();
  }

  return dashboardHomeHref();
}

export function homePathForProfile(profile: {
  is_admin: boolean;
  default_mode: "owner" | "affiliate" | null;
}) {
  if (profile.is_admin) {
    return adminHomeHref();
  }

  return homePathForDefaultMode(profile.default_mode);
}

export function dashboardAffiliatesHref(programId?: string) {
  if (!programId) {
    return "/dashboard/affiliates";
  }

  return `/dashboard/affiliates?program=${programId}`;
}

export function dashboardReferralsHref(programId?: string) {
  if (!programId) {
    return "/dashboard/referrals";
  }

  return `/dashboard/referrals?program=${programId}`;
}

export function dashboardPayoutsHref(programId?: string) {
  if (!programId) {
    return "/dashboard/payouts";
  }

  return `/dashboard/payouts?program=${programId}`;
}

export function readStoredProgramId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEY_PROGRAM);
}

export function writeStoredProgramId(programId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY_PROGRAM, programId);
  }
}
