import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_ENVIRONMENT_STORAGE_PREFIX,
  DASHBOARD_SETUP_CHOICE_PENDING_PREFIX,
  DASHBOARD_TEST_URL_STORAGE_PREFIX,
  markDashboardSetupChoicePending,
  readDashboardEnvironment,
  readDashboardSetupChoicePending,
  readDashboardTestUrl,
  writeDashboardEnvironment,
  writeDashboardTestUrl,
} from "@/lib/dashboard-environment";

function installWindowStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  vi.stubGlobal("window", {
    localStorage,
    dispatchEvent: vi.fn(),
  });

  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard environment persistence", () => {
  it("keeps the selected mode scoped to each app across reads", () => {
    installWindowStorage();

    writeDashboardEnvironment("app_one", "test");
    writeDashboardEnvironment("app_two", "live");

    expect(readDashboardEnvironment("app_one")).toBe("test");
    expect(readDashboardEnvironment("app_two")).toBe("live");
  });

  it("defaults existing apps to live so current activity stays visible", () => {
    const values = installWindowStorage();

    expect(readDashboardEnvironment("app_existing")).toBe("live");
    expect(
      values.get(
        `${DASHBOARD_ENVIRONMENT_STORAGE_PREFIX}app_existing`,
      ),
    ).toBe("live");
  });

  it("migrates the previous onboarding path into the dashboard mode", () => {
    const values = installWindowStorage({
      "refkit:onboarding-path:app_test": "test",
      "refkit:onboarding-path:app_live": "production",
    });

    expect(readDashboardEnvironment("app_test")).toBe("test");
    expect(readDashboardEnvironment("app_live")).toBe("live");
    expect(values.has("refkit:onboarding-path:app_test")).toBe(false);
    expect(values.has("refkit:onboarding-path:app_live")).toBe(false);
  });

  it("starts new Apps in Live while keeping the setup choice pending", () => {
    const values = installWindowStorage();

    writeDashboardEnvironment("app_new", "live");
    markDashboardSetupChoicePending("app_new");

    expect(readDashboardEnvironment("app_new")).toBe("live");
    expect(readDashboardSetupChoicePending("app_new")).toBe(true);
    expect(
      values.get(`${DASHBOARD_SETUP_CHOICE_PENDING_PREFIX}app_new`),
    ).toBe("true");

    writeDashboardEnvironment("app_new", "test");

    expect(readDashboardSetupChoicePending("app_new")).toBe(false);
  });

  it("keeps the local test URL separate for each app", () => {
    const values = installWindowStorage();

    writeDashboardTestUrl("app_one", "http://localhost:5173/");
    writeDashboardTestUrl("app_two", "https://staging.example.com/");

    expect(readDashboardTestUrl("app_one")).toBe("http://localhost:5173/");
    expect(readDashboardTestUrl("app_two")).toBe(
      "https://staging.example.com/",
    );
    expect(
      values.get(`${DASHBOARD_TEST_URL_STORAGE_PREFIX}app_one`),
    ).toBe("http://localhost:5173/");
  });
});
