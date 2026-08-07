"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clipboard,
  DollarSign,
  LayoutDashboard,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AffiliateCommissionsTable } from "@/components/dashboard/affiliate-commissions-table";
import { useMe } from "@/components/dashboard/auth-guard";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { programNameMap } from "@/components/dashboard/program-filter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { copyTextToClipboard } from "@/components/ui/copy-button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  apiFetch,
  apiFetchAllPages,
  type ListResponse,
} from "@/lib/api-client";
import { REFKIT_NETWORK_ACCESSIBLE } from "@/lib/closed-beta";
import {
  affiliateProgramOptions,
  countActivePrograms,
  filterByProgram,
  formatMoneyTotals,
  sumCommissionsByStatus,
  type AffiliateCommission,
} from "@/lib/affiliate-dashboard";
import {
  affiliateStatusLabel,
  MONEY_METRICS_HELP,
} from "@/lib/dashboard-display";
import { formatMoney } from "@/lib/dashboard-types";

type ProgramStats = {
  programId: string;
  earned: string;
  payable: string;
  clicks: number;
  referrals: number;
  defaultLinkUrl: string | null;
};

type AffiliateLink = {
  tracking_url: string;
  is_default: boolean;
};

export default function AffiliateHomePage() {
  const { me } = useMe();
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [programStats, setProgramStats] = useState<ProgramStats[]>([]);
  const [payableTotals, setPayableTotals] = useState(
    new Map<string, number>()
  );
  const [loading, setLoading] = useState(true);

  const programNames = useMemo(
    () => (me ? programNameMap(affiliateProgramOptions(me)) : new Map()),
    [me]
  );

  const refresh = useCallback(async () => {
    if (!me) {
      return;
    }

    setLoading(true);

    const commissionResult = await apiFetchAllPages<AffiliateCommission>(
      "/api/v1/commissions?limit=100"
    );
    setCommissions(commissionResult.data);

    const stats = await Promise.all(
      me.program_affiliates.map(async (entry) => {
        const programId = entry.program.id;
        const [balanceResult, clickResult, referralResult, linkResult] =
          await Promise.all([
            apiFetch<{ amount: number; currency: string }>(
              `/api/v1/payout-balance?program_id=${programId}`
            ),
            apiFetchAllPages<{ id: string }>(
              `/api/v1/clicks?program_id=${programId}&limit=100`
            ),
            apiFetchAllPages<{ id: string }>(
              `/api/v1/referrals?program_id=${programId}&limit=100`
            ),
            apiFetch<ListResponse<AffiliateLink>>(
              `/api/v1/affiliate/programs/${programId}/links`
            ).catch(() => ({ data: [] as AffiliateLink[], has_more: false })),
          ]);

        const earned = formatMoneyTotals(
          sumCommissionsByStatus(
            filterByProgram(commissionResult.data, programId),
            ["approved", "paid"]
          ),
          balanceResult.currency
        );
        const defaultLink =
          linkResult.data.find((link) => link.is_default) ??
          linkResult.data[0] ??
          null;

        return {
          programId,
          earned,
          payable: formatMoney(balanceResult.amount, balanceResult.currency),
          clicks: clickResult.data.length,
          referrals: referralResult.data.length,
          defaultLinkUrl: defaultLink?.tracking_url ?? null,
          payableAmount: balanceResult,
        };
      })
    );

    const nextPayableTotals = new Map<string, number>();

    for (let i = 0; i < stats.length; i++) {
      const row = stats[i];
      nextPayableTotals.set(
        row.payableAmount.currency,
        (nextPayableTotals.get(row.payableAmount.currency) ?? 0) +
          row.payableAmount.amount
      );
    }

    setPayableTotals(nextPayableTotals);
    setProgramStats(
      stats.map((row) => ({
        programId: row.programId,
        earned: row.earned,
        payable: row.payable,
        clicks: row.clicks,
        referrals: row.referrals,
        defaultLinkUrl: row.defaultLinkUrl,
      }))
    );
    setLoading(false);
  }, [me]);

  useEffect(() => {
    if (!me) {
      return;
    }

    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => {
      setLoading(false);
    });
  }, [me, refresh]);

  if (!me) {
    return null;
  }

  const earnedTotals = sumCommissionsByStatus(commissions, ["approved", "paid"]);
  const paidTotals = sumCommissionsByStatus(commissions, ["paid"]);
  const recentCommissions = [...commissions]
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
    )
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Home" />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total earned"
            value={formatMoneyTotals(earnedTotals)}
            icon={DollarSign}
            tooltip={MONEY_METRICS_HELP.earned}
          />
          <MetricCard
            title="Payable"
            value={formatMoneyTotals(payableTotals)}
            icon={Wallet}
            tooltip={MONEY_METRICS_HELP.payable}
          />
          <MetricCard
            title="Paid out"
            value={formatMoneyTotals(paidTotals)}
            icon={DollarSign}
            tooltip={MONEY_METRICS_HELP.paidOut}
          />
          <MetricCard
            title="Active programs"
            value={String(countActivePrograms(me))}
            icon={LayoutDashboard}
            tooltip={MONEY_METRICS_HELP.activePrograms}
          />
        </div>
      )}

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Your programs</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          {me.program_affiliates.length === 0 ? (
            <Empty className="border border-dashed border-border/70">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>No programs yet</EmptyTitle>
                <EmptyDescription>
                  {REFKIT_NETWORK_ACCESSIBLE
                    ? "Browse the RefKit Network or join through a private invitation."
                    : "Join a program through a private invitation. The RefKit Network opens in open beta."}
                </EmptyDescription>
              </EmptyHeader>
              {REFKIT_NETWORK_ACCESSIBLE ? (
                <EmptyContent>
                  <Button asChild>
                    <Link href="/affiliate/network">Browse the RefKit Network</Link>
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : loading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Payable</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Referrals</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {me.program_affiliates.map((entry) => {
                  const stats = programStats.find(
                    (row) => row.programId === entry.program.id
                  );
                  const defaultLinkUrl = stats?.defaultLinkUrl ?? null;

                  return (
                    <TableRow key={entry.program_affiliate.id}>
                      <TableCell className="font-medium">
                        {entry.program.name}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {affiliateStatusLabel(entry.program_affiliate.status)}
                        </span>
                      </TableCell>
                      <TableCell>{stats?.earned ?? "-"}</TableCell>
                      <TableCell>{stats?.payable ?? "-"}</TableCell>
                      <TableCell>{stats?.clicks ?? 0}</TableCell>
                      <TableCell>{stats?.referrals ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!defaultLinkUrl}
                            onClick={async () => {
                              if (!defaultLinkUrl) {
                                toast.error("Affiliate link is not available yet.");
                                return;
                              }

                              try {
                                await copyTextToClipboard(defaultLinkUrl);
                                toast.success("Affiliate link copied.");
                              }
                              catch {
                                toast.info(`Affiliate link: ${defaultLinkUrl}`);
                              }
                            }}
                          >
                            <Clipboard className="size-4" />
                            Copy link
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/affiliate/programs/${entry.program.id}`}>
                              Open
                              <ArrowRight className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
          {loading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : (
            <AffiliateCommissionsTable
              commissions={recentCommissions}
              programNames={programNames}
              showProgram={me.program_affiliates.length > 1}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
