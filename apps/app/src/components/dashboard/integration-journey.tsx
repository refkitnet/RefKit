"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheckBig,
  Code2,
  ExternalLink,
  KeyRound,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AppIcon } from "@/components/dashboard/app-icon";
import { CopyButton } from "@/components/ui/copy-button";
import { CopyBlock } from "@/components/ui/copy-block";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  type AlertVariant,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OnboardingFrame } from "@/components/dashboard/onboarding-frame";
import { IntegrationSetupPaths } from "@/components/dashboard/integration-setup-paths";
import { PaymentConnection } from "@/components/dashboard/payment-connection";
import { RevenueSourceSwitch } from "@/components/dashboard/revenue-source-switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api-client";
import { appOverviewHref } from "@/lib/dashboard-nav";
import type { SetupStatus } from "@/lib/dashboard-types";
import { DashboardEnvironmentSwitcher } from "@/components/dashboard/dashboard-environment-switcher";
import { useOwnerContext } from "@/components/dashboard/owner-context";
import { derivePaymentConnectionView } from "@/lib/payment-connection";
import {
  consumePreferredSetupStep,
  reopenOnboarding,
} from "@/lib/onboarding";
import { toastSetupError } from "@/lib/setup-action-toast";
import { normalizeWebsiteUrl } from "@refkitnet/validation";

type Program = {
  id: string;
  name: string;
  slug: string;
};

export type IntegrationSetupMode = "test" | "production";

export type OnboardingAffiliate = {
  id: string;
  link_code: string;
  status: string;
  email: string | null;
  name: string | null;
};

type IntegrationJourneyProps = {
  appId: string;
  appName: string;
  organizationId: string;
  appLogoUrl?: string | null;
  setupMode?: IntegrationSetupMode;
  program: Program;
  landingPageUrl: string | null;
  status: SetupStatus;
  affiliate: OnboardingAffiliate | null;
  connectingStripe?: boolean;
  disconnectingStripe?: boolean;
  switchingBilling?: boolean;
  billingError?: string | null;
  stripeNotice?: string | null;
  stripeNoticeVariant?: AlertVariant;
  onConnectStripe?: () => void;
  onDisconnectStripe?: () => void;
  onRevenueSourceChange?: (source: "stripe" | "api") => Promise<void>;
  onRefresh: () => Promise<unknown>;
  onAffiliateCreated: (affiliate: OnboardingAffiliate) => void;
  onDismissSetup?: () => void;
};

export type JourneyStepId =
  | "billing"
  | "website"
  | "key"
  | "install"
  | "click"
  | "identify"
  | "payment"
  | "done";

type JourneyStep = {
  id: JourneyStepId;
  label: string;
  done: boolean;
};

export const DEFAULT_INTEGRATION_API_URL = "https://app.refkit.net";

export function affiliateTrackingUrl(
  landingPageUrl: string,
  affiliateSlug: string,
  appId?: string,
) {
  const url = new URL(landingPageUrl);
  url.searchParams.set("via", affiliateSlug);

  if (appId) {
    url.searchParams.set("refkit_app", appId);
  }

  return url.toString();
}

export function installEnvExample(
  apiUrl: string,
  options: { apiKey: string },
) {
  return [
    `REFKIT_API_URL=${apiUrl}`,
    `REFKIT_API_KEY=${options.apiKey}`,
  ].join("\n");
}

export function needsNeutralBillingChoice(
  status: SetupStatus,
  setupMode: IntegrationSetupMode = "test",
) {
  const connection = derivePaymentConnectionView(
    status.revenue_source,
    status,
    setupMode === "production" ? "live" : "test",
  );

  return status.revenue_source === "stripe"
    && !connection.relevantStripeConnected;
}

export function integrationCommand(
  appId: string,
  programId?: string,
  apiUrl = DEFAULT_INTEGRATION_API_URL,
  options: { live?: boolean } = {},
) {
  const normalizedApiUrl = apiUrl.replace(/\/$/, "");
  const programOption = programId ? ` --program-id ${programId}` : "";
  const apiUrlOption =
    normalizedApiUrl !== DEFAULT_INTEGRATION_API_URL
      ? ` --api-url ${normalizedApiUrl}`
      : "";
  const liveOption = options.live ? " --live" : "";

  return `npx refkitnet init --app-id ${appId}${programOption}${apiUrlOption}${liveOption}`;
}

export function getJourneySteps(
  status: SetupStatus,
  setupMode: IntegrationSetupMode = "test",
): JourneyStep[] {
  const connection = derivePaymentConnectionView(
    status.revenue_source,
    status,
    setupMode === "production" ? "live" : "test",
  );

  if (setupMode === "production") {
    return [
      {
        id: "billing",
        label: status.revenue_source === "api" ? "Payments" : "Stripe",
        done: status.revenue_source === "api"
          || connection.relevantStripeConnected,
      },
      {
        id: "website",
        label: "Website",
        done: status.production_website_ready,
      },
      {
        id: "key",
        label: "Live key",
        done: status.live_api_key_created,
      },
      {
        id: "install",
        label: "Integrate",
        done: status.live_api_key_created,
      },
      {
        id: "done",
        label: "Done",
        done: status.production_ready,
      },
    ];
  }

  const billingDone =
    status.revenue_source === "api" || connection.relevantStripeConnected;

  return [
    {
      id: "billing",
      label: status.revenue_source === "api" ? "Payments" : "Stripe",
      done: billingDone,
    },
    {
      id: "install",
      label: "Integrate",
      done: status.test_api_key_used,
    },
    {
      id: "click",
      label: "Click",
      done: status.test_first_click,
    },
    {
      id: "identify",
      label: "Signup",
      done: status.test_first_identify,
    },
    {
      id: "payment",
      label: "Payment",
      done: status.test_first_revenue_event && status.test_first_commission,
    },
    {
      id: "done",
      label: "Done",
      done: status.test_integration_complete,
    },
  ];
}

export function getRecommendedStep(
  status: SetupStatus,
  setupMode: IntegrationSetupMode = "test",
): JourneyStepId {
  const steps = getJourneySteps(status, setupMode);
  return steps.find((step) => !step.done)?.id ?? "done";
}

function StatusRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      <Badge variant={done ? "success" : "secondary"}>
        {done ? "Confirmed" : "Waiting"}
      </Badge>
    </div>
  );
}

function StepNavFooter({
  steps,
  active,
  onChange,
  onBackFromStart,
  nextDisabled = false,
}: {
  steps: JourneyStep[];
  active: JourneyStepId;
  onChange: (id: JourneyStepId) => void;
  onBackFromStart?: () => void;
  nextDisabled?: boolean;
}) {
  const index = steps.findIndex((step) => step.id === active);
  const prev = index > 0 ? steps[index - 1] : null;
  const next = index < steps.length - 1 ? steps[index + 1] : null;

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={!prev && !onBackFromStart}
        onClick={() => {
          if (prev) {
            onChange(prev.id);
            return;
          }

          onBackFromStart?.();
        }}
      >
        <ArrowLeft />
        Back
      </Button>
      {next ? (
        <Button
          type="button"
          variant="outline"
          disabled={nextDisabled}
          onClick={() => onChange(next.id)}
        >
          Next
          <ArrowRight />
        </Button>
      ) : null}
    </div>
  );
}

export function IntegrationJourney({
  appId,
  appName,
  organizationId,
  appLogoUrl = null,
  setupMode = "test",
  program,
  landingPageUrl,
  status,
  affiliate,
  connectingStripe = false,
  disconnectingStripe = false,
  switchingBilling = false,
  billingError = null,
  stripeNotice = null,
  stripeNoticeVariant = "default",
  onConnectStripe,
  onDisconnectStripe,
  onRevenueSourceChange,
  onRefresh,
  onAffiliateCreated,
  onDismissSetup,
}: IntegrationJourneyProps) {
  const { me, setEnvironment } = useOwnerContext();
  const managedStripe = me?.deployment.capabilities.managed_stripe ?? false;
  const steps = getJourneySteps(status, setupMode);
  const recommended = getRecommendedStep(status, setupMode);
  const [preferredStep] = useState<JourneyStepId | null>(() =>
    consumePreferredSetupStep(),
  );
  const [active, setActive] = useState<JourneyStepId>(
    () =>
      preferredStep && steps.some((step) => step.id === preferredStep)
        ? preferredStep
        : getRecommendedStep(status, setupMode),
  );
  const [showBasics, setShowBasics] = useState(false);
  const [productionWebsiteUrl, setProductionWebsiteUrl] = useState(
    () => setupMode === "production" ? (landingPageUrl ?? "") : "",
  );
  const [productionActionLoading, setProductionActionLoading] = useState(false);
  const [productionError, setProductionError] = useState<string | null>(null);
  const [productionMessage, setProductionMessage] = useState<string | null>(null);
  const [newLiveKeyRaw, setNewLiveKeyRaw] = useState<string | null>(null);
  const [prevRecommended, setPrevRecommended] = useState(recommended);

  if (recommended !== prevRecommended) {
    setPrevRecommended(recommended);
    if (!newLiveKeyRaw) {
      setActive(recommended);
    }
  }
  const [createdAffiliate, setCreatedAffiliate] =
    useState<OnboardingAffiliate | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const billingChoiceRequired = managedStripe
    && needsNeutralBillingChoice(status, setupMode);
  const [billingChoiceConfirmed, setBillingChoiceConfirmed] = useState(
    () => !billingChoiceRequired,
  );
  const billingChoiceReady = !billingChoiceRequired || billingChoiceConfirmed;
  const visibleRevenueSource = billingChoiceReady
    ? status.revenue_source
    : null;
  const activeAffiliate = createdAffiliate ?? affiliate;
  const command = integrationCommand(
    appId,
    program.id,
    me?.deployment.instance_url ?? "",
    { live: setupMode === "production" },
  );
  const integrationApiUrl = me?.deployment.instance_url ?? "";
  const installEnv = setupMode === "test" && status.test_api_key
    ? installEnvExample(integrationApiUrl, {
        apiKey: status.test_api_key,
      })
    : null;
  const paymentConnection = derivePaymentConnectionView(
    status.revenue_source,
    status,
    setupMode === "production" ? "live" : "test",
    {
      loading: connectingStripe || disconnectingStripe,
      error: billingError,
    },
  );
  const trackingUrl =
    activeAffiliate && landingPageUrl
      ? affiliateTrackingUrl(
          landingPageUrl,
          activeAffiliate.link_code,
          setupMode === "test" ? appId : undefined,
        )
      : null;

  async function createTestAffiliate() {
    setInviting(true);
    setInviteError(null);

    try {
      const created = await apiFetch<OnboardingAffiliate>(
        "/api/v1/program-affiliates",
        {
          method: "POST",
          body: JSON.stringify({
            program_id: program.id,
            test_mode: true,
          }),
        },
      );
      setCreatedAffiliate(created);
      onAffiliateCreated(created);
    }
    catch (error) {
      setInviteError(
        error instanceof Error ? error.message : "Could not create test affiliate",
      );
    }
    finally {
      setInviting(false);
    }
  }

  async function handleBillingSelect(source: "stripe" | "api") {
    if (source !== status.revenue_source && onRevenueSourceChange) {
      try {
        await onRevenueSourceChange(source);
      }
      catch {
        return;
      }
    }

    setBillingChoiceConfirmed(true);
  }

  async function saveProductionWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProductionActionLoading(true);
    setProductionError(null);
    setProductionMessage(null);

    try {
      const normalized = normalizeWebsiteUrl(productionWebsiteUrl);
      await apiFetch(`/api/v1/apps/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ website_url: normalized }),
      });
      const refreshedStatus = await apiFetch<SetupStatus>(
        `/api/v1/apps/${appId}/setup-status`,
      );

      if (!refreshedStatus.production_website_ready) {
        const message =
          "Use the public HTTPS URL where customers will use your app.";
        setProductionError(message);
        toastSetupError("Could not save website", message);
        return;
      }

      setProductionWebsiteUrl(normalized);
      toast.success("Production website saved.");
      await onRefresh();
      setActive("key");
    }
    catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to save production website";
      setProductionError(message);
      toastSetupError("Could not save website", message);
    }
    finally {
      setProductionActionLoading(false);
    }
  }

  async function createLiveKey() {
    setProductionActionLoading(true);
    setProductionError(null);
    setProductionMessage(null);
    setNewLiveKeyRaw(null);

    try {
      const created = await apiFetch<{ key: string }>("/api/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          kind: "app",
          organization_id: organizationId,
          app_id: appId,
          name: "Production live key",
          test_mode: false,
        }),
      });
      setNewLiveKeyRaw(created.key);
      setProductionMessage(
        "Live API key created. Add it to production now; it will not be shown again.",
      );
      toast.success("Live API key created.");
      await onRefresh();
    }
    catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to create live API key";
      setProductionError(message);
      toastSetupError("Could not create live API key", message);
    }
    finally {
      setProductionActionLoading(false);
    }
  }

  return (
    <OnboardingFrame appName={appName}>
      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">
            {setupMode === "test" ? "Test setup" : "Live setup"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {setupMode === "test"
              ? "Use test credentials and isolated activity before you launch. Test commissions cannot be paid."
              : "Connect your production app with live credentials and real payment activity."}
          </p>
        </div>
        <DashboardEnvironmentSwitcher
          setupStatus={status}
          onEnvironmentChange={() => reopenOnboarding(appId, "billing")}
        />
      </div>

      {showBasics ? (
        <Card>
          <CardHeader>
            <CardTitle>Review the basics</CardTitle>
            <CardDescription>
              The App and default Program already exist. These are the details
              the rest of onboarding uses.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm">
              <span className="text-muted-foreground">App</span>
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <AppIcon
                  name={appName}
                  logoUrl={appLogoUrl}
                  className="size-6 text-xs"
                />
                <span className="truncate">{appName}</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {setupMode === "test" ? "Test website" : "Production website"}
              </span>
              <span className="min-w-0 truncate font-medium">
                {landingPageUrl ?? "Not set"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm">
              <span className="text-muted-foreground">Program</span>
              <span className="font-medium">{program.name}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              These can be changed in{" "}
              <Link
                href={appOverviewHref(appId)}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                App settings
              </Link>
              .
            </p>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              type="button"
              onClick={() => {
                setShowBasics(false);
                setActive("billing");
              }}
            >
              Continue to Connect
              <ArrowRight />
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Tabs
          value={active}
          onValueChange={(value) => setActive(value as JourneyStepId)}
          className="w-full"
        >
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Track payments</CardTitle>
              <CardDescription>
                {managedStripe
                  ? setupMode === "production"
                    ? "Choose how RefKit will receive real payment events."
                    : "Choose Stripe for automatic tracking or API reporting for another billing system."
                  : "Your backend reports normalized payment events to this RefKit instance."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {managedStripe ? (
                <RevenueSourceSwitch
                  revenueSource={visibleRevenueSource}
                  switching={switchingBilling}
                  onSelect={handleBillingSelect}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  API reporting is the revenue source for Self-Hosted Apps.
                </p>
              )}
              {!billingChoiceReady ? (
                <p className="text-sm text-muted-foreground">
                  Select how customers pay you before continuing.
                </p>
              ) : null}
              {visibleRevenueSource ? (
                <PaymentConnection
                  context="setup"
                  view={paymentConnection}
                  notice={managedStripe ? stripeNotice : null}
                  noticeVariant={stripeNoticeVariant}
                  onConnectStripe={managedStripe ? onConnectStripe : undefined}
                  onDisconnectStripe={
                    managedStripe ? onDisconnectStripe : undefined
                  }
                />
              ) : null}
            </CardContent>
            <CardFooter>
              <StepNavFooter
                steps={steps}
                active="billing"
                onChange={setActive}
                onBackFromStart={() => setShowBasics(true)}
                nextDisabled={!billingChoiceReady}
              />
            </CardFooter>
          </Card>
        </TabsContent>

        {setupMode === "production" ? (
          <TabsContent value="website">
            <Card>
              <CardHeader>
                <CardTitle>Set the production website</CardTitle>
                <CardDescription>
                  Use the public HTTPS URL your affiliates will share.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <form id="production-website-form" onSubmit={saveProductionWebsite}>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="production-website-url">
                      Production website URL
                    </Label>
                    <Input
                      id="production-website-url"
                      type="url"
                      placeholder="https://yourapp.com"
                      value={productionWebsiteUrl}
                      onChange={(event) => setProductionWebsiteUrl(event.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      This becomes the destination for affiliate links.
                    </p>
                  </div>
                </form>
                {productionError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Could not save website</AlertTitle>
                    <AlertDescription>{productionError}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
              <CardFooter className="justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActive("billing")}
                >
                  <ArrowLeft />
                  Back
                </Button>
                <Button
                  type="submit"
                  form="production-website-form"
                  disabled={productionActionLoading}
                >
                  {productionActionLoading ? <Loader2 className="animate-spin" /> : null}
                  Save and continue
                  <ArrowRight />
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        ) : null}

        {setupMode === "production" ? (
          <TabsContent value="key">
            <Card>
              <CardHeader>
                <CardTitle>Create the live API key</CardTitle>
                <CardDescription>
                  Use a separate live key only in the production environment.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {status.live_api_key_created && !newLiveKeyRaw ? (
                  <div className="rounded-md border bg-muted/20 p-4">
                    <p className="text-sm font-medium">A live key already exists</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Continue if it is already saved in production, or create
                      another key and copy it now.
                    </p>
                  </div>
                ) : null}

                <Button
                  className="w-fit"
                  variant={status.live_api_key_created ? "outline" : "default"}
                  onClick={createLiveKey}
                  disabled={productionActionLoading}
                >
                  {productionActionLoading
                    ? <Loader2 className="animate-spin" />
                    : <KeyRound />}
                  {status.live_api_key_created
                    ? "Create another live key"
                    : "Create live API key"}
                </Button>

                {newLiveKeyRaw ? (
                  <div className="flex flex-col gap-2">
                    <Label>Production environment variable</Label>
                    <CopyBlock
                      value={`REFKIT_API_KEY=${newLiveKeyRaw}`}
                      ariaLabel="Copy production API key"
                      wrap
                    />
                    <p className="text-xs text-muted-foreground">
                      Copy this now. RefKit will not show the key again.
                    </p>
                  </div>
                ) : null}
                {productionError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Could not create live API key</AlertTitle>
                    <AlertDescription>{productionError}</AlertDescription>
                  </Alert>
                ) : null}
                {productionMessage && !productionError ? (
                  <Alert variant="success">
                    <AlertTitle>Updated</AlertTitle>
                    <AlertDescription>{productionMessage}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
              <CardFooter>
                <StepNavFooter
                  steps={steps}
                  active="key"
                  onChange={setActive}
                  nextDisabled={!status.live_api_key_created}
                />
              </CardFooter>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="install">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="size-5 text-muted-foreground" />
                Integrate RefKit
              </CardTitle>
              <CardDescription>
                Choose an AI coding agent or follow the manual REST-first guide.
                Keep the {setupMode === "production" ? "live" : "test"} API
                key on your server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <IntegrationSetupPaths
                apiUrl={integrationApiUrl}
                appId={appId}
                programId={program.id}
                revenueSource={status.revenue_source}
                setupMode={setupMode}
                cliCommand={command}
                environmentVariables={installEnv}
                externalGuides={me?.deployment.edition === "cloud"}
              />
            </CardContent>
            <CardFooter>
              <StepNavFooter
                steps={steps}
                active="install"
                onChange={setActive}
                nextDisabled={
                  setupMode === "production" && !status.live_api_key_created
                }
              />
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="click">
          <Card>
            <CardHeader>
              <CardTitle>Test click tracking</CardTitle>
              <CardDescription>
                Open the internal test link in your local or staging app.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {!activeAffiliate ? (
                <div className="flex flex-col items-start gap-3 rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">
                    This link stays out of live metrics and payouts.
                  </p>
                  <Button type="button" onClick={createTestAffiliate} disabled={inviting}>
                    {inviting ? <Loader2 className="animate-spin" /> : null}
                    Create test link
                  </Button>
                </div>
              ) : (
                <>
                  {trackingUrl ? (
                    <div className="flex min-w-0 flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs">
                        {trackingUrl}
                      </code>
                      <div className="flex gap-2">
                        <CopyButton
                          value={trackingUrl}
                          ariaLabel="Copy test link"
                        />
                        <Button size="sm" variant="outline" asChild>
                          <Link href={trackingUrl} target="_blank">
                            Open test link
                            <ExternalLink />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <StatusRow
                    label="Test affiliate link opened"
                    done={status.test_first_click}
                  />
                </>
              )}
              {inviteError ? (
                <p className="text-sm text-destructive">{inviteError}</p>
              ) : null}
            </CardContent>
            <CardFooter>
              <StepNavFooter
                steps={steps}
                active="click"
                onChange={setActive}
              />
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="identify">
          <Card>
            <CardHeader>
              <CardTitle>Verify signup matching</CardTitle>
              <CardDescription>
                Sign up once after opening the test link.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StatusRow
                label="Test affiliate link opened"
                done={status.test_first_click}
              />
              <StatusRow
                label="Test signup matched"
                done={status.test_first_identify}
              />
            </CardContent>
            <CardFooter>
              <StepNavFooter
                steps={steps}
                active="identify"
                onChange={setActive}
              />
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="payment">
          <Card>
            <CardHeader>
              <CardTitle>Verify a test payment</CardTitle>
              <CardDescription>
                {status.revenue_source === "stripe"
                  ? "Complete a Stripe test-mode payment. $0 trials count as payment received; a commission still needs an attributed paid amount."
                  : "Report a payment with the same test key used for signup matching."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StatusRow
                label="Test payment received"
                done={status.test_first_revenue_event}
              />
              <StatusRow
                label="Test commission created"
                done={status.test_first_commission}
              />
              {status.test_first_revenue_event && !status.test_first_commission ? (
                <Alert variant="destructive">
                  <AlertTitle>Payment was not attributed</AlertTitle>
                  <AlertDescription>
                    RefKit received the payment but did not create a commission.
                    Check that the test payment uses the matched customer and Program.
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
            <CardFooter>
              <StepNavFooter
                steps={steps}
                active="payment"
                onChange={setActive}
              />
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="done">
          <Card>
            <CardHeader
              className={
                (setupMode === "production"
                  ? status.production_ready
                  : status.test_integration_complete)
                  ? "justify-items-center text-center"
                  : undefined
              }
            >
              {(setupMode === "production"
                ? status.production_ready
                : status.test_integration_complete) ? (
                <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-success/15 text-success-foreground">
                  <CircleCheckBig className="size-6" />
                </div>
              ) : null}
              <CardTitle>
                {setupMode === "production"
                  ? status.production_ready
                    ? "Production setup is ready"
                    : "Finish production setup"
                  : status.test_integration_complete
                    ? "Your test integration works"
                    : "Finish the test integration"}
              </CardTitle>
              <CardDescription>
                {setupMode === "production"
                  ? status.production_ready
                    ? "The production website, live key, and billing connection are configured."
                    : "Complete the live connection and integration steps before deploying."
                  : status.test_integration_complete
                    ? "RefKit tracked the full journey with isolated test activity."
                    : "Complete each check below with your test key before creating live credentials."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {setupMode === "production" ? (
                status.production_ready ? (
                  <div className="rounded-md border bg-muted/20 p-4">
                    <p className="text-sm font-medium">Ready for real traffic</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Deploy with the live key you saved. You can still run
                      isolated tests later with a test key if you want.
                    </p>
                  </div>
                ) : (
                  <>
                    <StatusRow
                      label="Production website URL"
                      done={status.production_website_ready}
                    />
                    <StatusRow
                      label="Live API key created"
                      done={status.live_api_key_created}
                    />
                    {status.revenue_source === "stripe" ? (
                      <StatusRow
                        label="Live Stripe connected"
                        done={paymentConnection.live.connected}
                      />
                    ) : null}
                  </>
                )
              ) : status.test_integration_complete ? (
                <>
                  <div className="rounded-md border bg-muted/20 p-4">
                    <p className="text-sm font-medium">Explore before you deploy</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Review the dashboard and keep testing for as long as you
                      need. Test activity stays out of live metrics and payouts.
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    When you are ready for real traffic, switch to Live setup
                    for the production website, live API key, integration, and
                    live Stripe connection if needed.
                  </p>
                </>
              ) : (
                <>
                  <StatusRow
                    label="Test affiliate click tracked"
                    done={status.test_first_click}
                  />
                  <StatusRow
                    label="Test signup matched"
                    done={status.test_first_identify}
                  />
                  <StatusRow
                    label="Test payment received"
                    done={status.test_first_revenue_event}
                  />
                  <StatusRow
                    label="Test commission created"
                    done={status.test_first_commission}
                  />
                </>
              )}
            </CardContent>
            <CardFooter>
              {setupMode === "production" ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActive("install")}
                  >
                    <ArrowLeft />
                    Back
                  </Button>
                  {status.production_ready && onDismissSetup ? (
                    <Button onClick={onDismissSetup}>Go to Dashboard</Button>
                  ) : (
                    <Button
                      onClick={() => setActive(getRecommendedStep(status, setupMode))}
                    >
                      Review missing setup
                      <ArrowRight />
                    </Button>
                  )}
                </div>
              ) : status.test_integration_complete ? (
                <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActive("payment")}
                  >
                    <ArrowLeft />
                    Back
                  </Button>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={() => {
                        reopenOnboarding(appId, "billing");
                        setEnvironment("live");
                      }}
                    >
                      Set up production
                      <ArrowRight />
                    </Button>
                    {onDismissSetup ? (
                      <Button onClick={onDismissSetup}>Go to Dashboard</Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <StepNavFooter
                  steps={steps}
                  active="done"
                  onChange={setActive}
                />
              )}
            </CardFooter>
          </Card>
        </TabsContent>
        </Tabs>
      )}
    </OnboardingFrame>
  );
}
