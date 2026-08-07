"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  DollarSign,
  Info,
  MousePointerClick,
  Plus,
  Trash2,
  UserCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AffiliateCommissionsTable } from "@/components/dashboard/affiliate-commissions-table";
import { AffiliateMembershipAlert } from "@/components/dashboard/affiliate-membership-alert";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { CopyBlock } from "@/components/ui/copy-block";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProgramAgreementPanel } from "@/components/program-agreement-panel";
import {
  apiFetch,
  apiFetchAllPages,
  type ListResponse,
} from "@/lib/api-client";
import {
  filterByProgram,
  formatMoneyTotals,
  sumCommissionsByStatus,
  type AffiliateCommission,
} from "@/lib/affiliate-dashboard";
import {
  customerDisplayLabel,
  formatDashboardDate,
  MONEY_METRICS_HELP,
} from "@/lib/dashboard-display";
import { formatMoney } from "@/lib/dashboard-types";

type AffiliateLink = {
  id: string;
  tracking_url: string;
  program_id: string;
  link_code: string;
  label: string;
  is_default: boolean;
};

type Commission = AffiliateCommission;

type Referral = {
  id: string;
  customer_id: string;
  customer_email?: string | null;
  customer_external_customer_id?: string | null;
  program_id: string;
  created_at: string;
};

function normalizeLinkSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function viaUrlPrefix(destinationUrl: string | null | undefined) {
  if (!destinationUrl) {
    return "?via=";
  }

  return `${destinationUrl.replace(/\?.*$/, "").replace(/\/$/, "")}?via=`;
}

export default function AffiliateProgramPage() {
  const params = useParams<{ programId: string }>();
  const programId = params.programId;
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [clickCount, setClickCount] = useState(0);
  const [earnedLabel, setEarnedLabel] = useState("-");
  const [payableLabel, setPayableLabel] = useState("-");
  const [program, setProgram] = useState<{
    name: string;
    destination_url: string;
    commission_rule: {
      reward_type: string;
      percent_value: number | null;
      fixed_amount: number | null;
      recurring_duration_months: number | null;
    } | null;
    minimum_payout_amount: { amount: number; currency: string };
    supported_payout_methods: string[];
  } | null>(null);
  const [acceptedAgreementVersion, setAcceptedAgreementVersion] = useState<{
    version_number: number;
    terms_text: string | null;
  } | null>(null);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkToRemove, setLinkToRemove] = useState<AffiliateLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<
    "active" | "pending" | "disabled"
  >("active");

  const refresh = useCallback(async () => {
    const me = await apiFetch<{
      program_affiliates: Array<{
        program: typeof program;
        program_affiliate: { program_id: string; status: string };
        accepted_agreement_version: {
          version_number: number;
          terms_text: string | null;
        } | null;
      }>;
    }>("/api/v1/me");

    const entry = me.program_affiliates.find(
      (row) => row.program_affiliate.program_id === programId
    );
    setProgram(entry?.program ?? null);
    setAcceptedAgreementVersion(entry?.accepted_agreement_version ?? null);
    setMembershipStatus(
      entry?.program_affiliate.status === "pending"
        ? "pending"
        : entry?.program_affiliate.status === "disabled"
          ? "disabled"
          : "active"
    );

    const linkResult = await apiFetch<ListResponse<AffiliateLink>>(
      `/api/v1/affiliate/programs/${programId}/links`
    );
    setLinks(linkResult.data);

    const commissionResult = await apiFetchAllPages<Commission>(
      "/api/v1/commissions?limit=100"
    );
    const programCommissions = filterByProgram(
      commissionResult.data,
      programId
    );
    setCommissions(programCommissions);

    const balanceResult = await apiFetch<{ amount: number; currency: string }>(
      `/api/v1/payout-balance?program_id=${programId}`
    );
    setEarnedLabel(
      formatMoneyTotals(
        sumCommissionsByStatus(programCommissions, ["approved", "paid"]),
        balanceResult.currency
      )
    );
    setPayableLabel(
      formatMoney(balanceResult.amount, balanceResult.currency)
    );

    const clickResult = await apiFetchAllPages<{ id: string }>(
      `/api/v1/clicks?program_id=${programId}&limit=100`
    );
    setClickCount(clickResult.data.length);

    const referralResult = await apiFetchAllPages<Referral>(
      `/api/v1/referrals?program_id=${programId}&limit=100`
    );
    setReferrals(referralResult.data);
  }, [programId]);

  useEffect(() => {
    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    });
  }, [refresh]);

  async function onCreateLink(event: FormEvent) {
    event.preventDefault();

    if (membershipStatus !== "active") {
      toast.error(
        "You can add links after the developer approves your account."
      );
      return;
    }

    setLoading(true);

    const nextSlug = normalizeLinkSlug(slug);
    const nextLabel = label.trim();

    if (!nextSlug) {
      toast.error("Link code is required.");
      setLoading(false);
      return;
    }

    if (links.some((link) => link.link_code === nextSlug)) {
      toast.error("A link with this code already exists in this program.");
      setLoading(false);
      return;
    }

    try {
      const body: { link_code: string; label?: string } = {
        link_code: nextSlug,
      };

      if (nextLabel) {
        body.label = nextLabel;
      }

      await apiFetch(`/api/v1/affiliate/programs/${programId}/links`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLabel("");
      setSlug("");
      setShowAddLink(false);
      await refresh();
      toast.success("Link created.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create link");
    }

    setLoading(false);
  }

  async function onRemoveLink(link: AffiliateLink) {
    if (link.is_default) {
      return;
    }

    setLoading(true);

    try {
      await apiFetch(
        `/api/v1/affiliate/programs/${programId}/links/${link.id}`,
        {
          method: "DELETE",
        }
      );
      setLinkToRemove(null);
      await refresh();
      toast.success("Link removed.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove link");
    }

    setLoading(false);
  }

  const commissionLabel = program?.commission_rule
    ? program.commission_rule.reward_type === "percent"
      ? `${program.commission_rule.percent_value}%`
      : formatMoney(
          program.commission_rule.fixed_amount ?? 0,
          program.minimum_payout_amount.currency
        )
    : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title={program?.name ?? "Program"}>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/affiliate/payouts?program=${programId}`}>
            <Wallet className="size-4" />
            Payouts
          </Link>
        </Button>
      </PageHeader>

      <AlertDialog
        open={linkToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !loading) {
            setLinkToRemove(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this link?</AlertDialogTitle>
            <AlertDialogDescription>
              Any signup or payment made with this link will not be attributed
              anymore.
              {linkToRemove ? (
                <>
                  {" "}
                  This removes{" "}
                  <span className="font-medium text-foreground">
                    via={linkToRemove.link_code}
                  </span>
                  .
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading || !linkToRemove}
              onClick={(event) => {
                event.preventDefault();

                if (linkToRemove) {
                  void onRemoveLink(linkToRemove);
                }
              }}
            >
              Remove link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AffiliateMembershipAlert status={membershipStatus} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Earned"
          value={earnedLabel}
          icon={DollarSign}
          tooltip={MONEY_METRICS_HELP.earned}
        />
        <MetricCard
          title="Payable"
          value={payableLabel}
          icon={Wallet}
          tooltip={MONEY_METRICS_HELP.payable}
        />
        <MetricCard
          title="Clicks"
          value={String(clickCount)}
          icon={MousePointerClick}
        />
        <MetricCard
          title="Referrals"
          value={String(referrals.length)}
          icon={UserCheck}
        />
      </div>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Your links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-5">
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          ) : (
            links.map((link) => (
              <div
                key={link.id}
                className="flex flex-col gap-2 rounded-md bg-muted/35 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{link.label}</p>
                  <Badge variant="secondary">via={link.link_code}</Badge>
                  {link.is_default ? (
                    <span className="text-xs text-muted-foreground">Default</span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      onClick={() => setLinkToRemove(link)}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  )}
                </div>
                <CopyBlock
                  value={link.tracking_url}
                  ariaLabel="Copy affiliate link"
                  wrap
                />
              </div>
            ))
          )}

          {showAddLink ? (
            <form
              onSubmit={onCreateLink}
              className="flex flex-col gap-3 rounded-md bg-muted/30 px-3 py-3"
            >
              <p className="text-sm font-medium">Add a link</p>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="link-slug">Affiliate link</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="About link codes"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="max-w-xs">
                      Link codes must be unique across RefKit. If you skip the
                      label, the link code is used as the label.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex min-h-9 items-center overflow-hidden rounded-md border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                  <span className="shrink-0 truncate pl-3 font-mono text-sm text-muted-foreground">
                    {viaUrlPrefix(program?.destination_url)}
                  </span>
                  <Input
                    id="link-slug"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder="newsletter"
                    disabled={loading}
                    required
                    className="min-w-[8rem] flex-1 border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="link-label">Label (optional)</Label>
                <Input
                  id="link-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Newsletter"
                  disabled={loading}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading}>
                  Add link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => {
                    setShowAddLink(false);
                    setLabel("");
                    setSlug("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={loading || membershipStatus !== "active"}
                onClick={() => setShowAddLink(true)}
              >
                <Plus className="size-4" />
                Add link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Program terms</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-5">
          {commissionLabel ? (
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Commission</p>
              <p className="text-sm font-medium text-foreground">
                {commissionLabel}
              </p>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Minimum payout</p>
            <p className="text-sm font-medium text-foreground">
              {formatMoney(
                program?.minimum_payout_amount.amount ?? 0,
                program?.minimum_payout_amount.currency ?? "usd"
              )}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Methods</p>
            <p className="text-sm font-medium text-foreground">
              {program?.supported_payout_methods.join(", ") || "None"}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Attribution window</p>
            <p className="text-sm font-medium text-foreground">30 days</p>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-3">
            <ProgramAgreementPanel
              termsText={acceptedAgreementVersion?.terms_text}
              versionNumber={acceptedAgreementVersion?.version_number}
              ownerHeading="Accepted App agreement"
              collapsible
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Referrals</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell>
                      {customerDisplayLabel({
                        customer_id: referral.customer_id,
                        customer_email: referral.customer_email,
                        customer_external_customer_id:
                          referral.customer_external_customer_id,
                      })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDashboardDate(referral.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="flex flex-row items-center justify-between gap-3 px-5">
          <CardTitle className="text-base">Recent commissions</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/affiliate/commissions">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-5">
          <AffiliateCommissionsTable
            commissions={commissions.slice(0, 10)}
            programNames={new Map()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
