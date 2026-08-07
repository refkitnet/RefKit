"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Banknote,
  Layers,
  Link2,
  MoreHorizontal,
  Pause,
  Pencil,
  Percent,
  Play,
  Plus,
  Settings2,
  TriangleAlert,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildCommissionRulePayload,
  buildProgramSettingsPayload,
  defaultProgramOfferValues,
  offerSummary,
  ProgramOfferFields,
  type ProgramOfferValues,
} from "@/components/dashboard/program-offer-fields";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyBlock } from "@/components/ui/copy-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch, type ListResponse } from "@/lib/api-client";
import { appOverviewHref } from "@/lib/dashboard-nav";
import { formatMoney } from "@/lib/dashboard-types";

type Program = {
  id: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  destination_url: string;
  is_default: boolean;
  join_page_enabled: boolean;
  join_page_approval: string;
  minimum_payout_amount: {
    amount: number;
    currency: string;
  };
  supported_payout_methods: string[];
  commission_rule: {
    reward_type: "percent" | "fixed";
    percent_value: number | null;
    fixed_amount: number | null;
    fixed_currency: string | null;
    recurring_duration_months: number | null;
  } | null;
};

type Affiliate = {
  id: string;
  program_id: string;
};

type ProgramRow = Program & {
  affiliate_count: number;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug.length >= 2 ? slug : "program";
}

function payoutMethodsLabel(program: Program) {
  const labels = program.supported_payout_methods.map((method) =>
    method === "bank_transfer" ? "Bank transfer" : "PayPal",
  );

  return labels.join(", ") || "None";
}

function joinApprovalLabel(program: Program) {
  return program.join_page_approval === "active"
    ? "Auto-approve"
    : "Require approval";
}

function statusVariant(status: string) {
  if (status === "disabled") return "destructive" as const;
  if (status === "paused") return "outline" as const;
  return "secondary" as const;
}

function offerFormFromProgram(program: Program): ProgramOfferValues {
  const rule = program.commission_rule;

  return {
    rewardType: (rule?.reward_type ?? "percent") as "percent" | "fixed",
    commissionPercent: String(rule?.percent_value ?? 20),
    fixedAmount: String((rule?.fixed_amount ?? 1000) / 100),
    recurringMode: (rule?.recurring_duration_months ? "months" : "lifetime") as
      | "lifetime"
      | "months",
    recurringMonths: String(rule?.recurring_duration_months ?? 12),
    joinApproval:
      program.join_page_approval === "active" ? "active" : "pending",
    minimumPayout: String((program.minimum_payout_amount?.amount ?? 0) / 100),
    payoutMethods: {
      paypal: program.supported_payout_methods.includes("paypal"),
      bank_transfer: program.supported_payout_methods.includes("bank_transfer"),
    },
  };
}

function SettingRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/35 px-3 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export default function AppProgramsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
    null,
  );
  const [joinLinkOrigin, setJoinLinkOrigin] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProgram, setEditProgram] = useState<Program | null>(null);
  const [settingsProgram, setSettingsProgram] = useState<Program | null>(null);
  const [disableProgram, setDisableProgram] = useState<Program | null>(null);
  const [createName, setCreateName] = useState("");
  const [createOffer, setCreateOffer] = useState<ProgramOfferValues>(
    defaultProgramOfferValues,
  );
  const [editOffer, setEditOffer] = useState<ProgramOfferValues>(
    defaultProgramOfferValues,
  );
  const [settingsName, setSettingsName] = useState("");
  const [settingsJoinEnabled, setSettingsJoinEnabled] = useState(true);
  const [settingsJoinApproval, setSettingsJoinApproval] = useState<
    "active" | "pending"
  >("pending");
  const [settingsMinPayout, setSettingsMinPayout] = useState("50");
  const [settingsPayoutMethods, setSettingsPayoutMethods] = useState({
    paypal: true,
    bank_transfer: false,
  });

  const refresh = useCallback(async () => {
    const [programResult, app, affiliateResult] = await Promise.all([
      apiFetch<ListResponse<Program>>(`/api/v1/programs?app_id=${appId}`),
      apiFetch<{ website_url: string | null }>(`/api/v1/apps/${appId}`),
      apiFetch<ListResponse<Affiliate>>(
        `/api/v1/program-affiliates?app_id=${appId}&limit=100`,
      ),
    ]);

    const affiliateCountByProgram = new Map<string, number>();

    for (const affiliate of affiliateResult.data) {
      affiliateCountByProgram.set(
        affiliate.program_id,
        (affiliateCountByProgram.get(affiliate.program_id) ?? 0) + 1,
      );
    }

    setPrograms(
      programResult.data.map((program) => ({
        ...program,
        affiliate_count: affiliateCountByProgram.get(program.id) ?? 0,
      })),
    );
    setSelectedProgramId((current) => {
      if (
        current &&
        programResult.data.some((program) => program.id === current)
      ) {
        return current;
      }

      return (
        programResult.data.find((program) => program.is_default)?.id ??
        programResult.data[0]?.id ??
        null
      );
    });

    setWebsiteUrl(app.website_url ?? null);

    const createRequested =
      new URLSearchParams(window.location.search).get("new") === "1";

    if (createRequested || programResult.data.length === 0) {
      setCreateOpen(true);
    }
  }, [appId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load programs");
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJoinLinkOrigin(window.location.origin);
  }, []);

  function selectProgram(programId: string) {
    setSelectedProgramId(programId);
    setEditProgram(null);
    setSettingsProgram(null);
  }

  function openEdit(program: Program) {
    setSettingsProgram(null);
    setEditOffer(offerFormFromProgram(program));
    setEditProgram(program);
  }

  function openSettings(program: Program) {
    setEditProgram(null);
    setSettingsName(program.name);
    setSettingsJoinEnabled(program.join_page_enabled);
    setSettingsJoinApproval(
      program.join_page_approval === "active" ? "active" : "pending",
    );
    setSettingsMinPayout(
      String((program.minimum_payout_amount?.amount ?? 0) / 100),
    );
    setSettingsPayoutMethods({
      paypal: program.supported_payout_methods.includes("paypal"),
      bank_transfer: program.supported_payout_methods.includes("bank_transfer"),
    });
    setSettingsProgram(program);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setActionLoading(true);
    try {
      if (!websiteUrl) {
        throw new Error("Set a website URL on the app before creating a program.");
      }

      const created = await apiFetch<Program>("/api/v1/programs", {
        method: "POST",
        body: JSON.stringify({
          app_id: appId,
          name: createName.trim(),
          slug: slugify(createName),
          currency: "usd",
          destination_url: websiteUrl,
          commission_rule: buildCommissionRulePayload(createOffer),
          join_page_enabled: true,
          ...buildProgramSettingsPayload(createOffer),
        }),
      });

      setCreateOpen(false);
      setCreateName("");
      setCreateOffer(defaultProgramOfferValues());
      setSelectedProgramId(created.id);
      toast.success("Program created.");
      await refresh();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create program");
    }
    finally {
      setActionLoading(false);
    }
  }

  async function onSaveSettings(event: FormEvent) {
    event.preventDefault();

    if (!settingsProgram) return;

    const payoutMethods = (
      Object.entries(settingsPayoutMethods) as Array<
        [keyof typeof settingsPayoutMethods, boolean]
      >
    )
      .filter(([, enabled]) => enabled)
      .map(([method]) => method);

    if (payoutMethods.length === 0) {
      toast.error("Select at least one payout method.");
      return;
    }

    const minPayoutCents = Math.round(Number(settingsMinPayout) * 100);

    if (!Number.isFinite(minPayoutCents) || minPayoutCents < 0) {
      toast.error("Minimum payout must be zero or greater.");
      return;
    }

    setActionLoading(true);
    try {
      await apiFetch(`/api/v1/programs/${settingsProgram.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: settingsName.trim(),
          join_page_enabled: settingsJoinEnabled,
          join_page_approval: settingsJoinApproval,
          minimum_payout_amount: minPayoutCents,
          supported_payout_methods: payoutMethods,
        }),
      });

      setSettingsProgram(null);
      toast.success("Settings saved.");
      await refresh();
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update program settings",
      );
    }
    finally {
      setActionLoading(false);
    }
  }

  async function onSaveOffer(event: FormEvent) {
    event.preventDefault();

    if (!editProgram) return;

    setActionLoading(true);
    try {
      await apiFetch(`/api/v1/programs/${editProgram.id}/terms`, {
        method: "POST",
        body: JSON.stringify({
          commission_rule: buildCommissionRulePayload(editOffer),
        }),
      });

      setEditProgram(null);
      toast.success("Offer updated for new referrals.");
      await refresh();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update offer");
    }
    finally {
      setActionLoading(false);
    }
  }

  async function onPauseResume(program: Program) {
    setActionLoading(true);
    try {
      const action = program.status === "paused" ? "resume" : "pause";
      await apiFetch(`/api/v1/programs/${program.id}/${action}`, {
        method: "POST",
      });
      toast.success(
        action === "pause" ? `${program.name} paused.` : `${program.name} resumed.`,
      );
      await refresh();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
    finally {
      setActionLoading(false);
    }
  }

  async function onMakeDefault(program: Program) {
    setActionLoading(true);
    try {
      await apiFetch(`/api/v1/apps/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({ default_program_id: program.id }),
      });
      toast.success(`${program.name} is now the default program.`);
      await refresh();
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to change default program",
      );
    }
    finally {
      setActionLoading(false);
    }
  }

  async function onAcknowledgeDisable() {
    if (!disableProgram) return;

    setActionLoading(true);

    try {
      await apiFetch(
        `/api/v1/programs/${disableProgram.id}/acknowledge-disable`,
        { method: "POST" },
      );
      toast.success("Payout responsibility acknowledged.");
      await refresh();
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Acknowledgment failed",
      );
    }
    finally {
      setActionLoading(false);
    }
  }

  async function onDisable() {
    if (!disableProgram) return;

    setActionLoading(true);

    try {
      await apiFetch(`/api/v1/programs/${disableProgram.id}/disable`, {
        method: "POST",
      });
      setDisableProgram(null);
      toast.success(
        `${disableProgram.name} disabled. Affiliates with balances were notified.`,
      );
      await refresh();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Disable failed");
    }
    finally {
      setActionLoading(false);
    }
  }

  const selectedProgram =
    programs.find((program) => program.id === selectedProgramId) ??
    programs[0] ??
    null;
  const selectedJoinLink = selectedProgram
    ? `${joinLinkOrigin}/join/${selectedProgram.slug}`
    : "";
  const isEditingOffer = editProgram?.id === selectedProgram?.id;
  const isEditingSettings = settingsProgram?.id === selectedProgram?.id;
  const programDisabled = selectedProgram?.status === "disabled";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Programs">
        <Button
          variant="outline"
          onClick={() => {
            setCreateOpen(true);
          }}
          disabled={!websiteUrl}
        >
          <Plus data-icon="inline-start" />
          New program
        </Button>
      </PageHeader>

      {!loading && !websiteUrl ? (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Set a website URL first</AlertTitle>
          <AlertDescription>
            Add one in{" "}
            <Link href={`${appOverviewHref(appId)}#website`} className="underline">
              App settings
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-36 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      ) : programs.length === 0 ? (
        <Empty className="border border-dashed border-border/70">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>No programs yet</EmptyTitle>
            <EmptyDescription>
              Create a program to set the commission offer affiliates can join.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreateOpen(true)} disabled={!websiteUrl}>
              <Plus data-icon="inline-start" />
              Create program
            </Button>
          </EmptyContent>
        </Empty>
      ) : selectedProgram ? (
        <Tabs
          value={selectedProgram.id}
          onValueChange={selectProgram}
          className="flex flex-col gap-4"
        >
          {programs.length > 1 ? (
            <TabsList className="h-auto w-full flex-wrap justify-start">
              {programs.map((program) => (
                <TabsTrigger key={program.id} value={program.id}>
                  <span className="truncate">{program.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}

          {programs.map((program) => (
            <TabsContent
              key={program.id}
              value={program.id}
              className="mt-0 flex flex-col gap-4"
            >
              {program.id !== selectedProgram.id ? null : (
                <>
                  <Card className="gap-4 border-border/70 py-5">
                    <CardHeader className="px-5">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <CardTitle className="truncate text-base">
                          {selectedProgram.name}
                        </CardTitle>
                        {selectedProgram.is_default ? (
                          <Badge variant="secondary">Default</Badge>
                        ) : null}
                        {selectedProgram.status !== "active" ? (
                          <Badge variant={statusVariant(selectedProgram.status)}>
                            {selectedProgram.status}
                          </Badge>
                        ) : null}
                      </div>
                      <CardAction>
                        <div className="flex shrink-0 items-center gap-1">
                          {!selectedProgram.is_default && !programDisabled ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onMakeDefault(selectedProgram)}
                              disabled={actionLoading}
                            >
                              Make default
                            </Button>
                          ) : null}

                          {!programDisabled ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onPauseResume(selectedProgram)}
                                  disabled={actionLoading}
                                  aria-label={
                                    selectedProgram.status === "paused"
                                      ? "Resume program"
                                      : "Pause program"
                                  }
                                >
                                  {selectedProgram.status === "paused" ? (
                                    <Play />
                                  ) : (
                                    <Pause />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {selectedProgram.status === "paused"
                                  ? "Resume"
                                  : "Pause"}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={actionLoading}
                                aria-label="More actions"
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuGroup>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    setDisableProgram(selectedProgram)
                                  }
                                  disabled={programDisabled}
                                >
                                  Disable program
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="px-5">
                      <CopyBlock
                        label="Affiliates invite link"
                        value={
                          selectedJoinLink || `/join/${selectedProgram.slug}`
                        }
                        ariaLabel="Copy affiliates invite link"
                        wrap
                        external
                      />
                    </CardContent>
                  </Card>

                  <div className="grid items-start gap-4 md:grid-cols-2">
                    <Card className="gap-4 border-border/70 py-5">
                      <CardHeader className="px-5">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Percent className="size-4 text-muted-foreground/70" />
                          Offer
                        </CardTitle>
                        {!isEditingOffer ? (
                          <CardAction>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(selectedProgram)}
                              disabled={programDisabled || actionLoading}
                            >
                              <Pencil data-icon="inline-start" />
                              Edit
                            </Button>
                          </CardAction>
                        ) : null}
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 px-5">
                        {isEditingOffer ? (
                          <form
                            className="flex flex-col gap-4"
                            onSubmit={onSaveOffer}
                          >
                            <Alert variant="warning">
                              <TriangleAlert />
                              <AlertDescription>
                                Changes apply only to new referrals.
                              </AlertDescription>
                            </Alert>
                            <ProgramOfferFields
                              values={editOffer}
                              onChange={setEditOffer}
                              programName={selectedProgram.name}
                              currency={selectedProgram.currency}
                              commissionInputId="edit-program-commission"
                              showSettings={false}
                              title="Terms"
                              fieldsDefaultOpen
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="submit"
                                variant="outline"
                                disabled={actionLoading}
                              >
                                {actionLoading ? <Spinner /> : null}
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setEditProgram(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="rounded-md bg-muted/35 px-3 py-2.5">
                              <p className="text-sm font-medium">
                                {selectedProgram.name}
                              </p>
                              <p className="mt-1 text-sm">
                                {selectedProgram.commission_rule
                                  ? offerSummary(
                                      offerFormFromProgram(selectedProgram),
                                      selectedProgram.currency,
                                    )
                                  : "Not configured"}
                              </p>
                            </div>
                            <SettingRow
                              icon={Users}
                              label="Affiliates"
                              value={String(selectedProgram.affiliate_count)}
                            />
                          </>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="gap-4 border-border/70 py-5">
                      <CardHeader className="px-5">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Settings2 className="size-4 text-muted-foreground/70" />
                          Settings
                        </CardTitle>
                        {!isEditingSettings ? (
                          <CardAction>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openSettings(selectedProgram)}
                              disabled={programDisabled || actionLoading}
                            >
                              <Pencil data-icon="inline-start" />
                              Edit
                            </Button>
                          </CardAction>
                        ) : null}
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 px-5">
                        {isEditingSettings ? (
                          <form
                            className="flex flex-col gap-4"
                            onSubmit={onSaveSettings}
                          >
                            <FieldGroup>
                              <Field>
                                <FieldLabel htmlFor="settings-program-name">
                                  Name
                                </FieldLabel>
                                <Input
                                  id="settings-program-name"
                                  value={settingsName}
                                  onChange={(event) =>
                                    setSettingsName(event.target.value)
                                  }
                                  required
                                />
                              </Field>

                              <Field
                                orientation="horizontal"
                                className="items-center justify-between rounded-md bg-muted/35 px-3 py-2.5"
                              >
                                <FieldLabel
                                  htmlFor="settings-join-enabled"
                                  className="font-medium"
                                >
                                  Hosted join page
                                </FieldLabel>
                                <Switch
                                  id="settings-join-enabled"
                                  checked={settingsJoinEnabled}
                                  onCheckedChange={setSettingsJoinEnabled}
                                />
                              </Field>

                              <Field>
                                <FieldLabel htmlFor="settings-join-approval">
                                  Join approval
                                </FieldLabel>
                                <Select
                                  value={settingsJoinApproval}
                                  onValueChange={(value) =>
                                    setSettingsJoinApproval(
                                      value as "active" | "pending",
                                    )
                                  }
                                >
                                  <SelectTrigger id="settings-join-approval">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">
                                      Require approval
                                    </SelectItem>
                                    <SelectItem value="active">
                                      Auto-approve
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </Field>

                              <Field>
                                <FieldLabel htmlFor="settings-min-payout">
                                  Minimum payout (
                                  {selectedProgram.currency.toUpperCase()})
                                </FieldLabel>
                                <Input
                                  id="settings-min-payout"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={settingsMinPayout}
                                  onChange={(event) =>
                                    setSettingsMinPayout(event.target.value)
                                  }
                                  required
                                />
                              </Field>

                              <Field>
                                <FieldLabel>Payout methods</FieldLabel>
                                <div className="flex flex-col gap-3">
                                  <Field
                                    orientation="horizontal"
                                    className="items-center"
                                  >
                                    <Checkbox
                                      id="settings-paypal"
                                      checked={settingsPayoutMethods.paypal}
                                      onCheckedChange={(checked) =>
                                        setSettingsPayoutMethods((current) => ({
                                          ...current,
                                          paypal: checked === true,
                                        }))
                                      }
                                    />
                                    <FieldLabel
                                      htmlFor="settings-paypal"
                                      className="font-normal"
                                    >
                                      PayPal
                                    </FieldLabel>
                                  </Field>
                                  <Field
                                    orientation="horizontal"
                                    className="items-center"
                                  >
                                    <Checkbox
                                      id="settings-bank-transfer"
                                      checked={
                                        settingsPayoutMethods.bank_transfer
                                      }
                                      onCheckedChange={(checked) =>
                                        setSettingsPayoutMethods((current) => ({
                                          ...current,
                                          bank_transfer: checked === true,
                                        }))
                                      }
                                    />
                                    <FieldLabel
                                      htmlFor="settings-bank-transfer"
                                      className="font-normal"
                                    >
                                      Bank transfer
                                    </FieldLabel>
                                  </Field>
                                </div>
                              </Field>
                            </FieldGroup>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="submit"
                                variant="outline"
                                disabled={actionLoading}
                              >
                                {actionLoading ? <Spinner /> : null}
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setSettingsProgram(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <SettingRow
                              icon={Link2}
                              label="Join page"
                              value={
                                selectedProgram.join_page_enabled
                                  ? "On"
                                  : "Off"
                              }
                            />
                            <SettingRow
                              icon={UserCheck}
                              label="Approval"
                              value={joinApprovalLabel(selectedProgram)}
                            />
                            <SettingRow
                              icon={Banknote}
                              label="Minimum payout"
                              value={formatMoney(
                                selectedProgram.minimum_payout_amount.amount,
                                selectedProgram.minimum_payout_amount.currency,
                              )}
                            />
                            <SettingRow
                              icon={Wallet}
                              label="Payout methods"
                              value={payoutMethodsLabel(selectedProgram)}
                            />
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {programs.length === 0 ? "Create your program" : "New program"}
            </DialogTitle>
            <DialogDescription>
              Set the commission offer. Join and payout settings can change
              later.
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={onCreate}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="program-name">Program name</FieldLabel>
                <Input
                  id="program-name"
                  placeholder="Affiliate Program"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  required
                />
              </Field>
            </FieldGroup>

            <ProgramOfferFields
              values={createOffer}
              onChange={setCreateOffer}
              programName={createName.trim() || "Affiliate Program"}
              commissionInputId="create-program-commission"
              title="Offer"
              showSettings={false}
              fieldsDefaultOpen
            />

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={actionLoading || !websiteUrl}>
                {actionLoading ? <Spinner /> : null}
                Create program
              </Button>
              {programs.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(disableProgram)}
        onOpenChange={(open) => {
          if (!open) {
            setDisableProgram(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable program</DialogTitle>
            <DialogDescription>
              Permanently stops new commissions. Existing approved balances must
              still be paid.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-start gap-3">
            <Button
              variant="outline"
              onClick={onAcknowledgeDisable}
              disabled={actionLoading}
            >
              Acknowledge payout responsibility
            </Button>
            <Button
              variant="destructive"
              onClick={onDisable}
              disabled={actionLoading}
            >
              {actionLoading ? <Spinner /> : null}
              Disable program
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
