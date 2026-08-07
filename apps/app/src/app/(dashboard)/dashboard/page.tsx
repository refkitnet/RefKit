"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  FlaskConical,
  Loader2,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { AppOnboardingCard } from "@/components/dashboard/app-onboarding-card";
import { OnboardingFrame } from "@/components/dashboard/onboarding-frame";
import {
  getRecommendedStep,
  IntegrationJourney,
  type OnboardingAffiliate,
} from "@/components/dashboard/integration-journey";
import {
  buildCommissionRulePayload,
  buildProgramSettingsPayload,
  defaultProgramOfferValues,
  ProgramOfferFields,
  type ProgramOfferValues,
} from "@/components/dashboard/program-offer-fields";
import {
  STORAGE_KEY_APP,
  useOwnerContext,
} from "@/components/dashboard/owner-context";
import { ProgramOverviewCards } from "@/components/dashboard/program-overview";
import { ProgramFilter } from "@/components/dashboard/program-filter";
import { DashboardEnvironmentSwitcher } from "@/components/dashboard/dashboard-environment-switcher";
import { useEffectiveEnvironment } from "@/components/dashboard/use-effective-environment";
import { useActivityOverview } from "@/components/dashboard/use-activity-overview";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { StripeConnectRedirectHandler } from "@/components/dashboard/stripe-connect-redirect-handler";
import {
  isUsableTestWebsiteUrl,
  TestWebsiteUrlForm,
} from "@/components/dashboard/test-website-url-form";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  type AlertVariant,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type ListResponse } from "@/lib/api-client";
import {
  readStoredProgramId,
  writeStoredProgramId,
} from "@/lib/dashboard-nav";
import {
  type SetupStatus,
} from "@/lib/dashboard-types";
import {
  ONBOARDING_CHANGE_EVENT,
  acknowledgeOnboarding,
  readOnboardingAcknowledgedAppId,
  reopenOnboarding,
  type SetupStepTarget,
} from "@/lib/onboarding";
import { toastSetupError } from "@/lib/setup-action-toast";
import { startStripeConnectInstall } from "@/lib/stripe-connect-install";

type App = {
  id: string;
  name: string;
  status: string;
  website_url: string | null;
  logo_url: string | null;
  organization_id: string;
  default_program_id: string | null;
};

type Program = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type Affiliate = {
  id: string;
  program_id: string;
  link_code: string;
  status: string;
  email: string | null;
  name: string | null;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug.length >= 2 ? slug : "affiliate-program";
}

export default function DashboardHomePage() {
  const {
    me,
    loading: meLoading,
    selectedAppId,
    selectedApp,
    setEnvironment,
    setupChoicePending,
    testWebsiteUrl,
  } = useOwnerContext();
  const [app, setApp] = useState<App | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [onboardingProgramId, setOnboardingProgramId] = useState("");
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [testAffiliate, setTestAffiliate] = useState<Affiliate | null>(null);
  const [programFilter, setProgramFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [connectMessageVariant, setConnectMessageVariant] =
    useState<AlertVariant>("default");
  const [offer, setOffer] = useState<ProgramOfferValues>(defaultProgramOfferValues);
  const [acknowledgedAppId, setAcknowledgedAppId] = useState(() =>
    readOnboardingAcknowledgedAppId(),
  );
  const [switchingBilling, setSwitchingBilling] = useState(false);
  const [disconnectingStripe, setDisconnectingStripe] = useState(false);
  const appId = selectedAppId || selectedApp?.id || "";
  const managedStripe = me?.deployment.capabilities.managed_stripe ?? false;
  const setupDismissed = acknowledgedAppId === appId;
  const environment = useEffectiveEnvironment(setupStatus);
  const { overview, loadingOverview } = useActivityOverview(
    appId,
    programFilter,
    environment,
  );

  useEffect(() => {
    function syncOnboardingState() {
      setAcknowledgedAppId(readOnboardingAcknowledgedAppId());
    }

    syncOnboardingState();
    window.addEventListener(ONBOARDING_CHANGE_EVENT, syncOnboardingState);
    return () => {
      window.removeEventListener(ONBOARDING_CHANGE_EVENT, syncOnboardingState);
    };
  }, [appId]);

  const refresh = useCallback(async () => {
    if (!appId) {
      setApp(null);
      setPrograms([]);
      setSetupStatus(null);
      setTestAffiliate(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [appResult, status, programResult] = await Promise.all([
        apiFetch<App>(`/api/v1/apps/${appId}`),
        apiFetch<SetupStatus>(`/api/v1/apps/${appId}/setup-status`),
        apiFetch<ListResponse<Program>>(`/api/v1/programs?app_id=${appId}`),
      ]);

      setApp(appResult);
      setSetupStatus(status);
      setPrograms(programResult.data);

      const storedProgramId = readStoredProgramId();
      const validStored =
        storedProgramId &&
        programResult.data.some((program) => program.id === storedProgramId);
      const defaultProgramId = programResult.data.some(
        (program) => program.id === appResult.default_program_id,
      )
        ? appResult.default_program_id
        : null;
      const nextProgramId = validStored
        ? storedProgramId
        : defaultProgramId ?? programResult.data[0]?.id ?? "";

      setOnboardingProgramId(nextProgramId);

      if (programResult.data.length > 0) {
        if (nextProgramId) {
          writeStoredProgramId(nextProgramId);
        }

        const testAffiliateResult = await apiFetch<ListResponse<Affiliate>>(
          `/api/v1/program-affiliates?app_id=${appId}&test_mode=true&limit=1`,
        );
        setTestAffiliate(testAffiliateResult.data[0] ?? null);
      }
      else {
        setTestAffiliate(null);
      }

      window.localStorage.setItem(STORAGE_KEY_APP, appId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => setError("Failed to load dashboard"));
  }, [refresh]);

  useEffect(() => {
    if (!appId || setupDismissed) {
      return;
    }

    const interval = window.setInterval(() => {
      apiFetch<SetupStatus>(`/api/v1/apps/${appId}/setup-status`)
        .then(setSetupStatus)
        .catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [appId, setupDismissed]);

  async function onConnectStripe() {
    if (!appId) return;

    setLoading(true);
    setBillingError(null);
    setConnectMessage(null);
    setConnectMessageVariant("default");

    try {
      const result = await startStripeConnectInstall({
        appId,
        livemode: environment === "live",
        onConnected: refresh,
      });

      if (result.sandboxMessage) {
        setConnectMessageVariant("success");
        setConnectMessage(result.sandboxMessage);
        toast.success(result.sandboxMessage);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Stripe connect failed";
      setConnectMessageVariant("destructive");
      setConnectMessage(message);
      toastSetupError("Stripe connection failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function onDisconnectStripe() {
    if (!appId) return;

    setDisconnectingStripe(true);
    setBillingError(null);
    setConnectMessage(null);

    try {
      await apiFetch("/api/v1/stripe/disconnect", {
        method: "POST",
        body: JSON.stringify({
          app_id: appId,
          livemode: environment === "live",
        }),
      });
      toast.success(`${environment === "live" ? "Live" : "Test"} Stripe disconnected.`);
      await refresh();
    }
    catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect Stripe";
      setConnectMessageVariant("destructive");
      setConnectMessage(message);
      toastSetupError("Could not disconnect Stripe", message);
    }
    finally {
      setDisconnectingStripe(false);
    }
  }

  async function onCreateDefaultProgram() {
    if (!app?.website_url) return;

    setLoading(true);
    setError(null);

    try {
      const created = await apiFetch<Program>("/api/v1/programs", {
        method: "POST",
        body: JSON.stringify({
          app_id: app.id,
          name: `${app.name} Affiliate Program`,
          slug: slugify(app.name),
          currency: "usd",
          destination_url: app.website_url,
          commission_rule: buildCommissionRulePayload(offer),
          join_page_enabled: true,
          ...buildProgramSettingsPayload(offer),
        }),
      });
      writeStoredProgramId(created.id);
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create program";
      setError(message);
      toastSetupError("Could not create program", message);
    } finally {
      setLoading(false);
    }
  }

  async function onRevenueSourceChange(source: "stripe" | "api") {
    if (!appId) return;

    setSwitchingBilling(true);
    setBillingError(null);
    setConnectMessage(null);

    try {
      await apiFetch(`/api/v1/apps/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ revenue_source: source }),
      });
      await refresh();
    }
    catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update revenue source";
      setBillingError(message);
      toastSetupError("Could not update payments", message);
      throw err instanceof Error ? err : new Error(message);
    }
    finally {
      setSwitchingBilling(false);
    }
  }

  function onAffiliateCreated(affiliate: OnboardingAffiliate) {
    setTestAffiliate(affiliate as Affiliate);
  }

  const onboardingProgram =
    programs.find((program) => program.id === onboardingProgramId) ?? null;

  if (meLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!me?.apps.length) {
    return (
      <OnboardingFrame>
        <AppOnboardingCard
          description="Add the shared App, production website, and starting commission. RefKit creates the default Program at the same time."
        />
      </OnboardingFrame>
    );
  }

  if ((!app || !setupStatus) && loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (app && setupStatus && setupChoicePending && onboardingProgram) {
    return (
      <OnboardingFrame appName={app.name}>
        <Card>
          <CardHeader>
            <CardTitle>Choose how to connect RefKit</CardTitle>
            <CardDescription>
              Your App and Program are ready. Set up Live now, or prove the
              integration in an isolated Test environment first.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setEnvironment("live")}
              className="rounded-md border border-primary bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Rocket className="size-4 text-muted-foreground" />
                Set up Live
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                Configure live credentials and real payment tracking now.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setEnvironment("test")}
              className="rounded-md border p-4 text-left transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <FlaskConical className="size-4 text-muted-foreground" />
                Test first
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                Add a local or staging URL, then verify the full journey.
              </span>
            </button>
          </CardContent>
        </Card>
      </OnboardingFrame>
    );
  }

  if (
    app
    && setupStatus
    && !setupDismissed
    && environment === "test"
    && !isUsableTestWebsiteUrl(testWebsiteUrl)
  ) {
    return (
      <OnboardingFrame appName={app.name}>
        <Card>
          <CardHeader>
            <CardTitle>Add your Test website</CardTitle>
            <CardDescription>
              Use the local or staging URL where you will verify RefKit. Your
              shared production website and Program stay unchanged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TestWebsiteUrlForm />
          </CardContent>
        </Card>
      </OnboardingFrame>
    );
  }

  if (app && setupStatus && !setupDismissed) {
    return (
      <div className="flex flex-col gap-5">
        {managedStripe ? (
        <Suspense fallback={null}>
          <StripeConnectRedirectHandler
            onConnected={refresh}
            onNotice={(notice) => {
              setConnectMessageVariant(notice.variant);
              setConnectMessage(notice.message);
              if (notice.variant === "destructive") {
                toastSetupError(notice.title, notice.message);
                return;
              }

              toast.success(notice.message);
            }}
          />
        </Suspense>
        ) : null}

        {onboardingProgram ? (
          <IntegrationJourney
            key={environment}
            appId={appId}
            appName={app.name}
            organizationId={app.organization_id}
            appLogoUrl={app.logo_url}
            setupMode={environment === "live" ? "production" : "test"}
            program={onboardingProgram}
            landingPageUrl={
              environment === "test"
                ? testWebsiteUrl
                : (app.website_url ?? null)
            }
            status={setupStatus}
            affiliate={testAffiliate}
            connectingStripe={loading}
            disconnectingStripe={disconnectingStripe}
            switchingBilling={switchingBilling}
            billingError={billingError}
            stripeNotice={connectMessage}
            stripeNoticeVariant={connectMessageVariant}
            onConnectStripe={managedStripe ? onConnectStripe : undefined}
            onDisconnectStripe={
              managedStripe ? onDisconnectStripe : undefined
            }
            onRevenueSourceChange={
              managedStripe ? onRevenueSourceChange : undefined
            }
            onRefresh={refresh}
            onAffiliateCreated={onAffiliateCreated}
            onDismissSetup={() => {
              acknowledgeOnboarding(appId);
              setAcknowledgedAppId(appId);
            }}
          />
        ) : (
          <OnboardingFrame appName={app.name}>
            <Card>
              <CardHeader>
                <CardTitle>Add your affiliate offer</CardTitle>
                <CardDescription>
                  This older App is missing its default Program. Add the
                  commission offer to continue in the same setup flow.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <ProgramOfferFields
                  values={offer}
                  onChange={setOffer}
                  programName={
                    app?.name
                      ? `${app.name} Affiliate Program`
                      : "Affiliate Program"
                  }
                  commissionInputId="setup-commission"
                  title="Affiliate offer"
                  showSettings={false}
                />
                <Button
                  className="mt-4 w-fit"
                  onClick={onCreateDefaultProgram}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="animate-spin" /> : null}
                  Create and continue
                </Button>
                {error ? (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTitle>Could not create program</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          </OnboardingFrame>
        )}
      </div>
    );
  }

  const showTestSetupProgress =
    environment === "test"
    && setupStatus
    && !setupStatus.test_integration_complete;
  const showLiveSetupProgress =
    environment === "live"
    && setupStatus
    && !setupStatus.production_ready;

  return (
    <div className="flex flex-col gap-5">
      {managedStripe ? (
      <Suspense fallback={null}>
        <StripeConnectRedirectHandler
          onConnected={refresh}
          onNotice={(notice) => {
            setConnectMessageVariant(notice.variant);
            setConnectMessage(notice.message);
            if (notice.variant === "destructive") {
              toastSetupError(notice.title, notice.message);
              return;
            }

            toast.success(notice.message);
          }}
        />
      </Suspense>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {app?.name ?? "Dashboard"}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardEnvironmentSwitcher setupStatus={setupStatus} />
          <ProgramFilter
            programs={programs}
            value={programFilter}
            onChange={setProgramFilter}
          />
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load dashboard</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {environment === "test" && !isUsableTestWebsiteUrl(testWebsiteUrl) ? (
        <Card className="gap-4 border-border/70 py-5">
          <CardHeader className="px-5">
            <CardTitle className="text-base">Add a Test website URL</CardTitle>
            <CardDescription>
              Local or staging URL for test links. Live destination is unchanged.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <TestWebsiteUrlForm />
          </CardContent>
        </Card>
      ) : null}

      {environment === "test"
      && setupStatus?.test_integration_complete
      && !setupStatus.production_ready ? (
        <Alert>
          <Rocket />
          <AlertTitle>Test integration complete</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>
              Your test data is ready to explore. Start production setup only
              when you are ready to prepare the real deployment.
            </span>
            <Button
              size="sm"
              onClick={() => {
                setEnvironment("live");
                reopenOnboarding(appId, "billing");
                setAcknowledgedAppId("");
              }}
            >
              Start production setup
              <ArrowRight />
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {setupStatus?.cross_currency_alarm ? (
        <Alert variant="destructive">
          <AlertTitle>Cross-currency commission blocked</AlertTitle>
          <AlertDescription>
            {setupStatus.cross_currency_message ??
              "A payment used a different currency than the program. No commission was created."}
          </AlertDescription>
        </Alert>
      ) : null}

      {setupStatus && showTestSetupProgress ? (
        <SetupChecklist
          status={setupStatus}
          showGoLiveNote
          onContinueSetup={(step?: SetupStepTarget) => {
            if (!appId) return;
            setEnvironment("test");
            reopenOnboarding(appId, step);
            setAcknowledgedAppId("");
          }}
        />
      ) : null}

      {setupStatus && showLiveSetupProgress ? (
        <Alert>
          <Rocket />
          <AlertTitle>Live setup is not finished</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>
              Finish the production website, live API key, and live Stripe
              connection when Stripe is your payment source.
            </span>
            <Button
              size="sm"
              onClick={() => {
                setEnvironment("live");
                reopenOnboarding(
                  appId,
                  getRecommendedStep(setupStatus, "production"),
                );
                setAcknowledgedAppId("");
              }}
            >
              Continue live setup
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {programs.length > 0 ? (
        loadingOverview ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : overview ? (
          <ProgramOverviewCards
            overview={overview}
            showTopAffiliates={false}
            showConversionRates
          />
        ) : null
      ) : null}
    </div>
  );
}
