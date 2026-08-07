"use client";

import Link from "next/link";
import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Code2,
  Compass,
  CreditCard,
  Info,
  KeyRound,
  Link2,
  Rocket,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { AppIcon } from "@/components/dashboard/app-icon";
import { AppLogoUploader } from "@/components/dashboard/app-logo-uploader";
import { ConfirmationDialog } from "@/components/dashboard/confirmation-dialog";
import { DashboardEnvironmentSwitcher } from "@/components/dashboard/dashboard-environment-switcher";
import { useEffectiveEnvironment } from "@/components/dashboard/use-effective-environment";
import { useOwnerContext } from "@/components/dashboard/owner-context";
import { IntegrationSetupPaths } from "@/components/dashboard/integration-setup-paths";
import { PaymentConnection } from "@/components/dashboard/payment-connection";
import {
  DEFAULT_INTEGRATION_API_URL,
  integrationCommand,
  installEnvExample,
} from "@/components/dashboard/integration-journey";
import { StripeConnectRedirectHandler } from "@/components/dashboard/stripe-connect-redirect-handler";
import { RevenueSourceSwitch } from "@/components/dashboard/revenue-source-switch";
import { TestWebsiteUrlForm } from "@/components/dashboard/test-website-url-form";
import { WebhookSettingsCard } from "@/components/dashboard/webhook-settings-card";
import { CopyBlock } from "@/components/ui/copy-block";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { normalizeWebsiteUrl } from "@refkitnet/validation";
import { apiFetch, type ListResponse } from "@/lib/api-client";
import { REFKIT_NETWORK_ACCESSIBLE } from "@/lib/closed-beta";
import {
  defaultAppAgreement,
  PROGRAM_AGREEMENT_EDITOR_PLACEHOLDER,
} from "@/lib/compliance-copy";
import { appProgramsHref } from "@/lib/dashboard-nav";
import type { SetupStatus } from "@/lib/dashboard-types";
import { derivePaymentConnectionView } from "@/lib/payment-connection";
import { startStripeConnectInstall } from "@/lib/stripe-connect-install";

const DEVELOPER_NETWORK_CLOSED_MESSAGE =
  "The RefKit Network opens in open beta. During closed beta, invite affiliates through a private join link.";

type App = {
  id: string;
  name: string;
  status: string;
  organization_id: string;
  revenue_source: "stripe" | "api";
  website_url: string | null;
  logo_url: string | null;
  network_visible: boolean;
  default_program_id: string | null;
};

type Program = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type ApiKey = {
  id: string;
  kind: string;
  prefix: string;
  name: string | null;
  organization_id: string | null;
  app_id: string | null;
};

function isProductionWebsiteUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();

  return url.protocol === "https:"
    && hostname !== "localhost"
    && !hostname.endsWith(".localhost")
    && hostname !== "127.0.0.1"
    && hostname !== "::1";
}

export default function AppHubPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-72 w-full" />
        </div>
      }
    >
      <AppHubPageContent />
    </Suspense>
  );
}

function AppHubPageContent() {
  const params = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const appId = params.appId;
  const { me } = useOwnerContext();
  const managedStripe = me?.deployment.capabilities.managed_stripe ?? false;
  const officialNetwork = me?.deployment.capabilities.official_network ?? false;
  const [app, setApp] = useState<App | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [newKeyMode, setNewKeyMode] = useState<"test" | "live" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [savingNetwork, setSavingNetwork] = useState(false);
  const [revenueSourceLoading, setRevenueSourceLoading] = useState(false);
  const [stripeActionMode, setStripeActionMode] = useState<"test" | "live" | null>(
    null,
  );
  const [billingError, setBillingError] = useState<string | null>(null);
  const [keysLoading, setKeysLoading] = useState(true);
  const [creatingKey, setCreatingKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null);
  const [agreementText, setAgreementText] = useState("");
  const [agreementVersion, setAgreementVersion] = useState<number | null>(null);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const environment = useEffectiveEnvironment(setupStatus);

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const [appResult, programResult, statusResult, agreementResult] =
        await Promise.all([
        apiFetch<App>(`/api/v1/apps/${appId}`),
        apiFetch<ListResponse<Program>>(`/api/v1/programs?app_id=${appId}`),
        apiFetch<SetupStatus>(`/api/v1/apps/${appId}/setup-status`),
        apiFetch<{
          agreement_version: {
            version_number: number;
            terms_text: string;
          } | null;
        }>(`/api/v1/apps/${appId}/agreement`),
      ]);
      setApp(appResult);
      setPrograms(programResult.data);
      setSetupStatus(statusResult);
      setWebsiteUrl(appResult.website_url ?? "");
      setAgreementVersion(agreementResult.agreement_version?.version_number ?? null);
      setAgreementText(
        agreementResult.agreement_version?.terms_text ??
          defaultAppAgreement(appResult.name)
      );
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load app");
    }
  }, [appId]);

  const refreshKeys = useCallback(async () => {
    if (!app) {
      return;
    }

    setKeysLoading(true);

    try {
      const keys = await apiFetch<ListResponse<ApiKey>>(
        `/api/v1/api-keys?organization_id=${app.organization_id}`,
      );
      setApiKeys(keys.data.filter((key) => key.app_id === app.id));
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    }
    finally {
      setKeysLoading(false);
    }
  }, [app]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!app) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshKeys();
  }, [app, refreshKeys]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const hash =
      tab === "settings"
        ? "website"
        : window.location.hash.replace(/^#/, "");

    if (!hash) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [searchParams]);

  async function onSaveWebsiteUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!app) return;

    setSavingWebsite(true);
    setError(null);

    try {
      const normalized = normalizeWebsiteUrl(websiteUrl);

      if (!isProductionWebsiteUrl(normalized)) {
        throw new Error("Enter the public HTTPS URL for your production app.");
      }

      await apiFetch(`/api/v1/apps/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ website_url: normalized }),
      });
      toast.success("Website URL saved.");
      await refresh();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save website URL");
    }
    finally {
      setSavingWebsite(false);
    }
  }

  async function onSaveAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!app) return;

    setAgreementLoading(true);
    setError(null);

    try {
      const result = await apiFetch<{
        agreement_version: {
          version_number: number;
          terms_text: string;
        };
      }>(`/api/v1/apps/${appId}/agreement`, {
        method: "PATCH",
        body: JSON.stringify({
          terms_text: agreementText.trim(),
        }),
      });

      setAgreementVersion(result.agreement_version.version_number);
      toast.success(
        `App agreement published as version ${result.agreement_version.version_number}. Affiliates must accept the new version before joining.`,
      );
    }
    catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to publish agreement",
      );
    }
    finally {
      setAgreementLoading(false);
    }
  }

  async function onNetworkVisibilityChange(visible: boolean) {
    setSavingNetwork(true);
    setError(null);

    try {
      await apiFetch(`/api/v1/apps/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ network_visible: visible }),
      });
      toast.success(
        visible
          ? "App is now visible in the RefKit Network."
          : "App is hidden from the RefKit Network.",
      );
      await refresh();
    }
    catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update Network visibility",
      );
    }
    finally {
      setSavingNetwork(false);
    }
  }

  async function onUpdateRevenueSource(value: "stripe" | "api") {
    setRevenueSourceLoading(true);
    setBillingError(null);
    setError(null);

    try {
      await apiFetch(`/api/v1/apps/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ revenue_source: value }),
      });
      toast.success("Revenue source updated.");
      await refresh();
    }
    catch (err) {
      setBillingError(
        err instanceof Error ? err.message : "Failed to update revenue source",
      );
    }
    finally {
      setRevenueSourceLoading(false);
    }
  }

  async function onConnectStripe(mode: "test" | "live" = environment) {
    setStripeActionMode(mode);
    setBillingError(null);
    setError(null);

    try {
      const result = await startStripeConnectInstall({
        appId,
        livemode: mode === "live",
        onConnected: refresh,
      });

      if (result.sandboxMessage) {
        toast.success(result.sandboxMessage);
      }
    }
    catch (err) {
      setBillingError(
        err instanceof Error ? err.message : "Stripe connect failed",
      );
    }
    finally {
      setStripeActionMode(null);
    }
  }

  async function onDisconnectStripe(mode: "test" | "live" = environment) {
    setStripeActionMode(mode);
    setBillingError(null);
    setError(null);

    try {
      await apiFetch("/api/v1/stripe/disconnect", {
        method: "POST",
        body: JSON.stringify({
          app_id: appId,
          livemode: mode === "live",
        }),
      });
      toast.success(`${mode === "live" ? "Live" : "Test"} Stripe disconnected.`);
      await refresh();
    }
    catch (err) {
      setBillingError(
        err instanceof Error ? err.message : "Failed to disconnect Stripe",
      );
    }
    finally {
      setStripeActionMode(null);
    }
  }

  async function onCreateKey() {
    if (!app) return;

    const testMode = environment === "test";

    setCreatingKey(true);
    setError(null);
    setNewKeyRaw(null);
    setNewKeyMode(null);

    try {
      const created = await apiFetch<{ key: string }>("/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          kind: "app",
          organization_id: app.organization_id,
          app_id: app.id,
          name: testMode ? "Dashboard test key" : "Production live key",
          test_mode: testMode,
        }),
      });
      setNewKeyRaw(created.key);
      setNewKeyMode(testMode ? "test" : "live");
      toast.success(
        `${testMode ? "Test" : "Live"} API key created. Copy it now; it will not be shown again.`,
      );
      await refresh();
      await refreshKeys();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
    finally {
      setCreatingKey(false);
    }
  }

  async function onRevokeKey(keyId: string) {
    setRevokingKeyId(keyId);
    setError(null);

    try {
      await apiFetch(`/api/v1/api-keys/${keyId}`, { method: "DELETE" });
      toast.success("API key revoked.");
      await refresh();
      await refreshKeys();
      setKeyToRevoke(null);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
    finally {
      setRevokingKeyId(null);
    }
  }

  if (!app || !setupStatus) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const program =
    programs.find((entry) => entry.id === app.default_program_id)
    ?? programs[0]
    ?? null;
  const command = integrationCommand(
    app.id,
    program?.id,
    me?.deployment.instance_url ?? DEFAULT_INTEGRATION_API_URL,
    { live: environment === "live" },
  );
  const integrationApiUrl =
    me?.deployment.instance_url ?? DEFAULT_INTEGRATION_API_URL;
  const selectedApiKeys = apiKeys.filter((key) =>
    environment === "test"
      ? key.prefix === "rk_test_app_"
      : key.prefix === "rk_app_"
  );
  const selectedRawKey = newKeyMode === environment ? newKeyRaw : null;
  const integrationKey = environment === "test"
    ? setupStatus.test_api_key
    : selectedRawKey;
  const installEnv = program && integrationKey
    ? installEnvExample(integrationApiUrl, {
        apiKey: integrationKey,
      })
    : null;
  const paymentConnection = derivePaymentConnectionView(
    app.revenue_source,
    setupStatus,
    environment,
    {
      loading: stripeActionMode !== null,
      loadingMode: stripeActionMode,
      error: billingError,
    },
  );
  const networkToggleBlocked = !REFKIT_NETWORK_ACCESSIBLE
    || (!app.network_visible && (!app.logo_url || !program));
  const networkToggleDisabled = savingNetwork || networkToggleBlocked;
  let networkToggleBlockReason: string | null = null;
  if (!REFKIT_NETWORK_ACCESSIBLE) {
    networkToggleBlockReason = DEVELOPER_NETWORK_CLOSED_MESSAGE;
  }
  else if (!app.network_visible) {
    if (!app.logo_url) {
      networkToggleBlockReason =
        "Upload an app logo before showing the app in the Network.";
    }
    else if (!program) {
      networkToggleBlockReason =
        "Create a Program before showing the app in the Network.";
    }
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {managedStripe ? (
        <StripeConnectRedirectHandler
          onConnected={refresh}
          onNotice={(notice) => {
            if (notice.variant === "destructive") {
              setBillingError(notice.message);
              return;
            }

            setError(null);
            setBillingError(null);
            toast.success(notice.message);
          }}
        />
      ) : null}

      <div className="flex items-center gap-3">
        <AppIcon
          name={app.name}
          logoUrl={app.logo_url}
          className="size-10 text-sm"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {app.name}
          </h1>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="flex min-w-0 flex-col gap-4">
          <Card id="website" className="min-w-0 scroll-mt-6 gap-5 border-border/70 py-5">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="size-4 text-muted-foreground/70" />
                Website
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 px-5 md:grid-cols-2 md:items-start">
              <AppLogoUploader
                appId={appId}
                appName={app.name}
                logoUrl={app.logo_url}
                onUpdated={refresh}
                onMessage={(nextMessage) => {
                  setError(null);
                  toast.success(nextMessage);
                }}
                onError={(nextError) => {
                  setError(nextError);
                }}
              />

              <form className="flex flex-col gap-3" onSubmit={onSaveWebsiteUrl}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="website-url">
                      Production website URL
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="website-url"
                        placeholder="https://yourapp.com"
                        value={websiteUrl}
                        onChange={(event) => setWebsiteUrl(event.target.value)}
                        required
                      />
                      {websiteUrl !== (app.website_url ?? "") ? (
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            type="submit"
                            variant="secondary"
                            size="xs"
                            disabled={savingWebsite}
                          >
                            {savingWebsite ? <Spinner /> : <Save />}
                            Save URL
                          </InputGroupButton>
                        </InputGroupAddon>
                      ) : null}
                    </InputGroup>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <Card id="agreement" className="scroll-mt-6 gap-0 border-border/70 py-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <CardTitle className="text-base">App agreement</CardTitle>
                  <CardDescription className="mt-1 text-muted-foreground/80">
                    Terms affiliates accept before joining.
                  </CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {agreementVersion ? <span>Version {agreementVersion}</span> : null}
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <CardContent className="px-5 pb-5">
                <form className="flex flex-col gap-3" onSubmit={onSaveAgreement}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="app-agreement-text">Agreement text</FieldLabel>
                      <Textarea
                        id="app-agreement-text"
                        value={agreementText}
                        onChange={(event) => setAgreementText(event.target.value)}
                        rows={10}
                        required
                        placeholder={PROGRAM_AGREEMENT_EDITOR_PLACEHOLDER}
                      />
                    </Field>
                  </FieldGroup>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="outline" disabled={agreementLoading}>
                      {agreementLoading ? <Spinner /> : null}
                      Publish agreement
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (app) {
                          setAgreementText(defaultAppAgreement(app.name));
                        }
                      }}
                    >
                      Reset to default
                    </Button>
                  </div>
                </form>
              </CardContent>
            </details>
          </Card>

          {officialNetwork ? (
          <Card id="network" className="scroll-mt-6 gap-4 border-border/70 py-5">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Compass className="size-4 text-muted-foreground/70" />
                RefKit Network
                {!REFKIT_NETWORK_ACCESSIBLE ? (
                  <Badge variant="outline">Beta</Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-5">
              <Field orientation="horizontal" className="items-center justify-between rounded-md bg-muted/35 px-3 py-2.5">
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="network-visible" className="font-medium">
                    Show app in Network
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="About Network visibility"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="start" className="max-w-xs">
                        {REFKIT_NETWORK_ACCESSIBLE
                          ? "To learn more about the RefKit Network, please visit the docs."
                          : DEVELOPER_NETWORK_CLOSED_MESSAGE}
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldDescription className="text-xs">
                    {REFKIT_NETWORK_ACCESSIBLE
                      ? "Where affiliates discover listed programs."
                      : "Opens in open beta. Private join links still work."}
                  </FieldDescription>
                </div>
                {networkToggleBlocked && networkToggleBlockReason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-not-allowed">
                        <Switch
                          id="network-visible"
                          checked={
                            REFKIT_NETWORK_ACCESSIBLE
                              ? app.network_visible
                              : false
                          }
                          disabled={networkToggleDisabled}
                          onCheckedChange={(checked) =>
                            onNetworkVisibilityChange(checked)
                          }
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" className="max-w-xs">
                      {networkToggleBlockReason}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Switch
                    id="network-visible"
                    checked={app.network_visible}
                    disabled={networkToggleDisabled}
                    onCheckedChange={(checked) =>
                      onNetworkVisibilityChange(checked)
                    }
                  />
                )}
              </Field>

              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5">
                <div>
                  <p className="text-xs text-muted-foreground">Default Program</p>
                  <p className="text-sm font-medium text-foreground">
                    {program?.name ?? "No Program yet"}
                  </p>
                </div>
                {programs.length > 1 ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={appProgramsHref(app.id)}>Change</Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
          ) : null}

      </section>

      <section aria-label="Payments tracking and integration" className="flex min-w-0 flex-col gap-4">
          <Card id="payments" className="scroll-mt-6 gap-5 border-border/70 py-5">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4 text-muted-foreground/70" />
                Payments tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-5">
              {managedStripe ? (
                <RevenueSourceSwitch
                  revenueSource={app.revenue_source}
                  switching={revenueSourceLoading}
                  disabled={setupStatus.live_first_revenue_event}
                  label="Revenue source"
                  onSelect={onUpdateRevenueSource}
                />
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium">API reporting</p>
                  <p className="text-sm text-muted-foreground">
                    Self-Hosted Apps receive normalized revenue events from your backend.
                  </p>
                </div>
              )}

              {managedStripe && setupStatus.live_first_revenue_event ? (
                <p className="text-xs text-muted-foreground">
                  Locked after live payment activity.
                </p>
              ) : null}

              <PaymentConnection
                context="settings"
                view={paymentConnection}
                integrationHref="#install"
                onConnectStripe={managedStripe ? onConnectStripe : undefined}
                onDisconnectStripe={
                  managedStripe ? onDisconnectStripe : undefined
                }
              />
            </CardContent>
          </Card>

          <Card id="install" className="min-w-0 scroll-mt-6 gap-5 border-border/70 py-5">
            <CardHeader className="flex flex-row items-center justify-between gap-4 px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Code2 className="size-4 text-muted-foreground/70" />
                Integration
              </CardTitle>
              <DashboardEnvironmentSwitcher
                className="w-auto"
                setupStatus={setupStatus}
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-5">
              {environment === "test" ? (
                <div className="rounded-md bg-muted/30 p-3">
                  <TestWebsiteUrlForm key={appId} compact />
                </div>
              ) : null}

              {!program ? (
                <Alert variant="info">
                  <Rocket />
                  <AlertTitle>No program yet</AlertTitle>
                  <AlertDescription>
                    Create the Program and define its commission before
                    integrating RefKit.
                  </AlertDescription>
                </Alert>
              ) : (
                <IntegrationSetupPaths
                  apiUrl={integrationApiUrl}
                  appId={app.id}
                  programId={program.id}
                  revenueSource={app.revenue_source}
                  setupMode={environment === "live" ? "production" : "test"}
                  cliCommand={command}
                  environmentVariables={installEnv}
                  externalGuides={me?.deployment.edition === "cloud"}
                />
              )}

              {!program ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <Link href={appProgramsHref(appId)}>Create program</Link>
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 rounded-md bg-muted/30 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <KeyRound className="size-3.5 text-muted-foreground/70" />
                      API keys
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {environment === "test"
                        ? "Isolated from live activity."
                        : "Live keys are shown once."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={onCreateKey}
                    disabled={creatingKey || revokingKeyId !== null}
                    size="sm"
                  >
                    {creatingKey ? <Spinner /> : <KeyRound />}
                    Create {environment} key
                  </Button>
                </div>

                {selectedRawKey ? (
                  <CopyBlock value={selectedRawKey} ariaLabel="Copy API key" wrap />
                ) : null}

                {keysLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : selectedApiKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No {environment} API keys for this app yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedApiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between gap-3 rounded-md bg-background/55 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {key.name ?? key.prefix}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {key.prefix}…
                            <Badge variant="outline" className="ml-2">
                              {key.prefix === "rk_test_app_" ? "Test" : "Live"}
                            </Badge>
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setKeyToRevoke(key)}
                          disabled={creatingKey || revokingKeyId !== null}
                        >
                          {revokingKeyId === key.id ? <Spinner /> : null}
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <WebhookSettingsCard
            appId={appId}
            externalGuide={me?.deployment.edition === "cloud"}
          />
      </section>
      <ConfirmationDialog
        open={keyToRevoke !== null}
        title={`Revoke ${app.name} API key?`}
        description={`Requests using ${keyToRevoke?.name ?? keyToRevoke?.prefix ?? "this key"} will stop working immediately.`}
        confirmLabel="Revoke key"
        loading={revokingKeyId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setKeyToRevoke(null);
          }
        }}
        onConfirm={() => {
          if (keyToRevoke) {
            void onRevokeKey(keyToRevoke.id);
          }
        }}
      />
    </div>
  );
}
