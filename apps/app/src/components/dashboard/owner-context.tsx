"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";
import type { AppEnvironment } from "@/lib/app-environment";
import {
  DASHBOARD_ENVIRONMENT_CHANGE_EVENT,
  readDashboardEnvironment,
  readDashboardSetupChoicePending,
  readDashboardTestUrl,
  writeDashboardEnvironment,
  writeDashboardTestUrl,
} from "@/lib/dashboard-environment";
import type { MeProfile } from "@/lib/dashboard-types";

const STORAGE_KEY_ORG = "refkit:selectedOrgId";
export const STORAGE_KEY_APP = "refkit:lastAppId";

type OwnerContextValue = {
  me: MeProfile | null;
  loading: boolean;
  selectedOrgId: string;
  selectedOrg: MeProfile["organizations"][number] | null;
  selectedAppId: string;
  selectedApp: MeProfile["apps"][number] | null;
  environment: AppEnvironment;
  setupChoicePending: boolean;
  testWebsiteUrl: string;
  setSelectedOrgId: (orgId: string) => void;
  setSelectedAppId: (appId: string) => void;
  setEnvironment: (environment: AppEnvironment) => void;
  setTestWebsiteUrl: (url: string) => void;
  refreshMe: () => Promise<void>;
};

const OwnerContext = createContext<OwnerContextValue | null>(null);

function readStoredOrgId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEY_ORG);
}

function readStoredAppId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORAGE_KEY_APP);
}

function writeStoredAppId(appId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY_APP, appId);
  }
}

function writeStoredOrgId(orgId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY_ORG, orgId);
  }
}

export function OwnerProvider({
  me,
  loading,
  refreshMe,
  children,
}: {
  me: MeProfile | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
  children: React.ReactNode;
}) {
  const params = useParams<{ appId?: string }>();
  const routeAppId = params.appId ?? "";
  const [manualOrgId, setManualOrgId] = useState<string | null>(null);
  const [manualAppId, setManualAppId] = useState<string | null>(null);
  const [, setEnvironmentRevision] = useState(0);

  const selectedAppId = useMemo(() => {
    if (!me?.apps.length) {
      return "";
    }

    if (routeAppId && me.apps.some((app) => app.id === routeAppId)) {
      return routeAppId;
    }

    if (manualAppId && me.apps.some((app) => app.id === manualAppId)) {
      return manualAppId;
    }

    const stored = readStoredAppId();
    const validStored = stored && me.apps.some((app) => app.id === stored);

    if (validStored) {
      return stored;
    }

    return me.apps[0].id;
  }, [me, routeAppId, manualAppId]);

  useEffect(() => {
    if (!routeAppId || !me?.apps.some((app) => app.id === routeAppId)) {
      return;
    }

    writeStoredAppId(routeAppId);

    const app = me.apps.find((entry) => entry.id === routeAppId);
    if (app) {
      writeStoredOrgId(app.organization_id);
    }
  }, [routeAppId, me]);

  const selectedApp = useMemo(() => {
    if (!me || !selectedAppId) {
      return null;
    }

    return me.apps.find((app) => app.id === selectedAppId) ?? null;
  }, [me, selectedAppId]);

  const environment = readDashboardEnvironment(selectedAppId);
  const setupChoicePending = readDashboardSetupChoicePending(selectedAppId);
  const testWebsiteUrl = readDashboardTestUrl(selectedAppId);

  useEffect(() => {
    function syncEnvironment() {
      setEnvironmentRevision((revision) => revision + 1);
    }

    window.addEventListener(
      DASHBOARD_ENVIRONMENT_CHANGE_EVENT,
      syncEnvironment,
    );

    return () => {
      window.removeEventListener(
        DASHBOARD_ENVIRONMENT_CHANGE_EVENT,
        syncEnvironment,
      );
    };
  }, []);

  const selectedOrgId = useMemo(() => {
    if (!me?.organizations.length) {
      return "";
    }

    if (
      manualOrgId
      && me.organizations.some((org) => org.id === manualOrgId)
    ) {
      return manualOrgId;
    }

    if (selectedApp) {
      return selectedApp.organization_id;
    }

    const stored = readStoredOrgId();
    const validStored =
      stored && me.organizations.some((org) => org.id === stored);

    if (validStored) {
      return stored;
    }

    return me.organizations[0].id;
  }, [me, manualOrgId, selectedApp]);

  const setSelectedAppId = useCallback((appId: string) => {
    if (!me?.apps.some((app) => app.id === appId)) {
      return;
    }

    setManualAppId(appId);
    writeStoredAppId(appId);

    const app = me.apps.find((entry) => entry.id === appId);
    if (app) {
      setManualOrgId(app.organization_id);
      writeStoredOrgId(app.organization_id);
    }
  }, [me]);

  const setSelectedOrgId = useCallback((orgId: string) => {
    if (!me?.organizations.some((org) => org.id === orgId)) {
      return;
    }

    setManualOrgId(orgId);
    writeStoredOrgId(orgId);

    const appsInOrg = me.apps.filter((app) => app.organization_id === orgId);
    const currentApp = manualAppId
      ? me.apps.find((app) => app.id === manualAppId)
      : null;
    const shouldSwitchApp =
      !currentApp || currentApp.organization_id !== orgId;

    if (shouldSwitchApp && appsInOrg.length > 0) {
      const nextApp = appsInOrg[0];
      setManualAppId(nextApp.id);
      writeStoredAppId(nextApp.id);
    }
  }, [me, manualAppId]);

  const setEnvironment = useCallback((nextEnvironment: AppEnvironment) => {
    if (!selectedAppId) {
      return;
    }

    writeDashboardEnvironment(selectedAppId, nextEnvironment);
  }, [selectedAppId]);

  const setTestWebsiteUrl = useCallback((url: string) => {
    if (!selectedAppId) {
      return;
    }

    writeDashboardTestUrl(selectedAppId, url);
  }, [selectedAppId]);

  const selectedOrg = useMemo(() => {
    if (!me || !selectedOrgId) {
      return null;
    }

    return me.organizations.find((org) => org.id === selectedOrgId) ?? null;
  }, [me, selectedOrgId]);

  const value = useMemo(
    () => ({
      me,
      loading,
      selectedOrgId,
      selectedOrg,
      selectedAppId,
      selectedApp,
      environment,
      setupChoicePending,
      testWebsiteUrl,
      setSelectedOrgId,
      setSelectedAppId,
      setEnvironment,
      setTestWebsiteUrl,
      refreshMe,
    }),
    [
      me,
      loading,
      selectedOrgId,
      selectedOrg,
      selectedAppId,
      selectedApp,
      environment,
      setupChoicePending,
      testWebsiteUrl,
      setSelectedOrgId,
      setSelectedAppId,
      setEnvironment,
      setTestWebsiteUrl,
      refreshMe,
    ]
  );

  return (
    <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>
  );
}

export function useOwnerContext() {
  const context = useContext(OwnerContext);

  if (!context) {
    throw new Error("useOwnerContext must be used within OwnerProvider");
  }

  return context;
}

export function useOptionalOwnerContext() {
  return useContext(OwnerContext);
}
