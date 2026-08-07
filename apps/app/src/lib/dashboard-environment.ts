import type { AppEnvironment } from "@/lib/app-environment";

export const DASHBOARD_ENVIRONMENT_CHANGE_EVENT =
  "refkit:dashboard-environment-change";
export const DASHBOARD_ENVIRONMENT_STORAGE_PREFIX =
  "refkit:dashboard-environment:";
export const DASHBOARD_TEST_URL_STORAGE_PREFIX = "refkit:dashboard-test-url:";
export const DASHBOARD_SETUP_CHOICE_PENDING_PREFIX =
  "refkit:dashboard-setup-choice-pending:";

const LEGACY_ONBOARDING_PATH_STORAGE_PREFIX = "refkit:onboarding-path:";

export function readDashboardEnvironment(appId: string): AppEnvironment {
  if (typeof window === "undefined" || !appId) {
    return "live";
  }

  const key = `${DASHBOARD_ENVIRONMENT_STORAGE_PREFIX}${appId}`;
  const stored = window.localStorage.getItem(key);

  if (stored === "test" || stored === "live") {
    return stored;
  }

  const legacyKey = `${LEGACY_ONBOARDING_PATH_STORAGE_PREFIX}${appId}`;
  const legacy = window.localStorage.getItem(legacyKey);
  const migrated: AppEnvironment = legacy === "test" ? "test" : "live";

  window.localStorage.setItem(key, migrated);
  window.localStorage.removeItem(legacyKey);

  return migrated;
}

export function writeDashboardEnvironment(
  appId: string,
  environment: AppEnvironment,
) {
  if (typeof window === "undefined" || !appId) {
    return;
  }

  window.localStorage.setItem(
    `${DASHBOARD_ENVIRONMENT_STORAGE_PREFIX}${appId}`,
    environment,
  );
  window.localStorage.removeItem(
    `${LEGACY_ONBOARDING_PATH_STORAGE_PREFIX}${appId}`,
  );
  window.localStorage.removeItem(
    `${DASHBOARD_SETUP_CHOICE_PENDING_PREFIX}${appId}`,
  );
  window.dispatchEvent(new Event(DASHBOARD_ENVIRONMENT_CHANGE_EVENT));
}

export function readDashboardTestUrl(appId: string) {
  if (typeof window === "undefined" || !appId) {
    return "";
  }

  return window.localStorage.getItem(
    `${DASHBOARD_TEST_URL_STORAGE_PREFIX}${appId}`,
  ) ?? "";
}

export function writeDashboardTestUrl(appId: string, testUrl: string) {
  if (typeof window === "undefined" || !appId) {
    return;
  }

  window.localStorage.setItem(
    `${DASHBOARD_TEST_URL_STORAGE_PREFIX}${appId}`,
    testUrl,
  );
  window.dispatchEvent(new Event(DASHBOARD_ENVIRONMENT_CHANGE_EVENT));
}

export function readDashboardSetupChoicePending(appId: string) {
  if (typeof window === "undefined" || !appId) {
    return false;
  }

  return window.localStorage.getItem(
    `${DASHBOARD_SETUP_CHOICE_PENDING_PREFIX}${appId}`,
  ) === "true";
}

export function markDashboardSetupChoicePending(appId: string) {
  if (typeof window === "undefined" || !appId) {
    return;
  }

  window.localStorage.setItem(
    `${DASHBOARD_SETUP_CHOICE_PENDING_PREFIX}${appId}`,
    "true",
  );
  window.dispatchEvent(new Event(DASHBOARD_ENVIRONMENT_CHANGE_EVENT));
}
