"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AppLogoPicker } from "@/components/dashboard/app-logo-uploader";
import {
  STORAGE_KEY_APP,
  useOwnerContext,
} from "@/components/dashboard/owner-context";
import {
  buildCommissionRulePayload,
  buildProgramSettingsPayload,
  defaultProgramOfferValues,
  ProgramOfferFields,
  type ProgramOfferValues,
} from "@/components/dashboard/program-offer-fields";
import { normalizeWebsiteUrl } from "@refkitnet/validation";
import { apiFetch } from "@/lib/api-client";
import {
  markDashboardSetupChoicePending,
  writeDashboardEnvironment,
} from "@/lib/dashboard-environment";
import { inferAppNameFromWebsite } from "@/lib/onboarding";

type CreatedOrganization = {
  id: string;
  name: string;
};

type CreatedApp = {
  id: string;
  name: string;
  organization_id: string;
  website_url: string | null;
  revenue_source: "stripe" | "api";
  status: string;
};

type AppOnboardingCardProps = {
  title?: string;
  description?: string;
  submitLabel?: string;
  compact?: boolean;
};


function workspaceNameForApp(appName: string) {
  return `${appName.trim()} workspace`;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug.length >= 2 ? slug : "affiliate-program";
}

function isProductionWebsiteUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();

  return url.protocol === "https:"
    && hostname !== "localhost"
    && !hostname.endsWith(".localhost")
    && hostname !== "127.0.0.1"
    && hostname !== "::1";
}

export function AppOnboardingCard({
  title = "Add your app and offer",
  description,
  submitLabel = "Create and continue",
  compact = false,
}: AppOnboardingCardProps) {
  const router = useRouter();
  const { me, selectedOrgId, setSelectedOrgId, refreshMe } = useOwnerContext();
  const [appName, setAppName] = useState("");
  const [appNameEdited, setAppNameEdited] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [offer, setOffer] = useState<ProgramOfferValues>(defaultProgramOfferValues);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ensureOrganizationId(name: string) {
    if (selectedOrgId) {
      return selectedOrgId;
    }

    const existingOrgId = me?.organizations[0]?.id;

    if (existingOrgId) {
      setSelectedOrgId(existingOrgId);
      return existingOrgId;
    }

    const created = await apiFetch<CreatedOrganization>("/api/v1/organizations", {
      method: "POST",
      body: JSON.stringify({ name: workspaceNameForApp(name) }),
    });
    setSelectedOrgId(created.id);
    return created.id;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const nextWebsiteUrl = String(formData.get("website_url") ?? "").trim();
      const nextAppName = String(formData.get("app_name") ?? "").trim();
      setWebsiteUrl(nextWebsiteUrl);
      setAppName(nextAppName);
      setAppNameEdited(true);

      const normalizedUrl = normalizeWebsiteUrl(nextWebsiteUrl);

      if (!isProductionWebsiteUrl(normalizedUrl)) {
        throw new Error("Enter the public HTTPS URL for your production app.");
      }

      if (!nextAppName) {
        throw new Error("Enter an app name.");
      }

      const organizationId = await ensureOrganizationId(nextAppName);
      const created = await apiFetch<CreatedApp>("/api/v1/apps", {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          name: nextAppName,
          website_url: normalizedUrl,
          revenue_source: me?.deployment.capabilities.managed_stripe
            ? "stripe"
            : "api",
          default_program: {
            name: `${nextAppName} Affiliate Program`,
            slug: slugify(nextAppName),
            currency: "usd",
            destination_url: normalizedUrl,
            commission_rule: buildCommissionRulePayload(offer),
            join_page_enabled: true,
            ...buildProgramSettingsPayload(offer),
          },
        }),
      });

      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        await apiFetch(`/api/v1/apps/${created.id}/logo`, {
          method: "POST",
          body: formData,
        });
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_APP, created.id);
      }
      writeDashboardEnvironment(created.id, "live");
      markDashboardSetupChoicePending(created.id);

      await refreshMe();
      router.push("/dashboard");
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create app");
    }
    finally {
      setLoading(false);
    }
  }

  function onWebsiteUrlChange(value: string) {
    setWebsiteUrl(value);

    if (!appNameEdited) {
      setAppName(inferAppNameFromWebsite(value));
    }
  }

  return (
    <Card className={compact ? "border-dashed" : ""}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <AppLogoPicker
                appName={appName || "App"}
                file={logoFile}
                onFileChange={setLogoFile}
                onError={setError}
                disabled={loading}
              />

              <div className="flex flex-col gap-2">
                <Label htmlFor="onboarding-app-url">
                  Production website URL
                </Label>
                <Input
                  id="onboarding-app-url"
                  name="website_url"
                  placeholder="https://yourapp.com"
                  value={websiteUrl}
                  onChange={(event) => onWebsiteUrlChange(event.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Shared by Test and Live as the App and Program destination.
                  If you test locally, you will add that URL after creation.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="onboarding-app-name">App name</Label>
                <Input
                  id="onboarding-app-name"
                  name="app_name"
                  placeholder="Acme"
                  value={appName}
                  onChange={(event) => {
                    setAppNameEdited(true);
                    setAppName(event.target.value);
                  }}
                  required
                />
              </div>
            </div>

            <Separator />

            <ProgramOfferFields
              values={offer}
              onChange={setOffer}
              programName={
                appName.trim()
                  ? `${appName.trim()} Affiliate Program`
                  : "Affiliate Program"
              }
              commissionInputId="onboarding-commission"
              title="Affiliate offer"
              description="RefKit creates the default Program automatically. You can customize the rest later."
              showSettings={false}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            {loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            {submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
