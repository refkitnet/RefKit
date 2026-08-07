"use client";

import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, ChevronRight, Info, ListTree } from "lucide-react";
import { toast } from "sonner";
import {
  ProgramFilter,
  programNameMap,
} from "@/components/dashboard/program-filter";
import { EntityListEmpty } from "@/components/dashboard/entity-list-empty";
import { ConfirmationDialog } from "@/components/dashboard/confirmation-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { UserDisplay } from "@/components/dashboard/user-display";
import { useAppProgramScope } from "@/components/dashboard/use-app-program-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, apiFetchAllPages } from "@/lib/api-client";
import {
  commissionKindLabel,
  commissionStatusLabel,
  customerDisplayLabel,
  formatDashboardDateTime,
  transactionActionLabel,
} from "@/lib/dashboard-display";
import { formatMoney } from "@/lib/dashboard-types";
import { referralsEmptyStateMessage } from "@/lib/dashboard-display";
import { cn } from "@/lib/utils";

type Referral = {
  id: string;
  customer_id: string;
  customer_email?: string | null;
  customer_external_customer_id?: string | null;
  program_id: string;
  program_affiliate_id: string;
  created_at: string;
};

type Commission = {
  id: string;
  program_id: string;
  customer_id: string | null;
  transaction_id: string | null;
  status: string;
  kind: string;
  amount: { amount: number; currency: string };
  program_affiliate_id: string;
  livemode: boolean;
  created_at: string;
};

type Transaction = {
  id: string;
  program_id: string;
  customer_id: string | null;
  program_affiliate_id: string | null;
  action: string;
  amount: { amount: number; currency: string };
  livemode: boolean;
  created_at: string;
};

type Affiliate = {
  id: string;
  link_code: string;
  email: string | null;
  name: string | null;
  image: string | null;
  is_test: boolean;
  created_at: string;
};

type ReferralRow = {
  referral: Referral;
  transactions: Transaction[];
  commissions: Commission[];
  revenue: { amount: number; currency: string } | null;
  commissionTotal: { amount: number; currency: string } | null;
  needsReview: boolean;
};

function sumMoney(
  rows: Array<{ amount: { amount: number; currency: string } }>
) {
  if (rows.length === 0) {
    return null;
  }

  const currency = rows[0].amount.currency;
  const amount = rows.reduce((total, row) => total + row.amount.amount, 0);

  return { amount, currency };
}

function mergeByCreatedAt<T extends { created_at: string }>(
  ...groups: T[][]
) {
  return groups.flat().sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

function ReferralsPageContent() {
  const {
    meLoading,
    programs,
    loadingPrograms,
    programFilter,
    setProgramFilter,
    scopeQuery,
    setupStatus,
  } = useAppProgramScope();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [commissionAction, setCommissionAction] = useState<{
    type: "release" | "reject";
    entryId: string;
    amountLabel: string;
  } | null>(null);
  const refreshGeneration = useRef(0);
  const names = programNameMap(programs);
  const showProgramColumn = !programFilter;
  const affiliateById = useMemo(
    () => new Map(affiliates.map((affiliate) => [affiliate.id, affiliate])),
    [affiliates]
  );

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;

    if (!scopeQuery) {
      setReferrals([]);
      setCommissions([]);
      setTransactions([]);
      setAffiliates([]);
      return;
    }

    setReferrals([]);
    setCommissions([]);
    setTransactions([]);
    setAffiliates([]);
    const liveQuery = `${scopeQuery}&environment=live&limit=100`;
    const testQuery = `${scopeQuery}&environment=test&limit=100`;
    try {
      const [
        liveReferrals,
        testReferrals,
        liveCommissions,
        testCommissions,
        liveTransactions,
        testTransactions,
        liveAffiliates,
        testAffiliates,
      ] = await Promise.all([
        apiFetchAllPages<Referral>(`/api/v1/referrals?${liveQuery}`),
        apiFetchAllPages<Referral>(`/api/v1/referrals?${testQuery}`),
        apiFetchAllPages<Commission>(`/api/v1/commissions?${liveQuery}`),
        apiFetchAllPages<Commission>(`/api/v1/commissions?${testQuery}`),
        apiFetchAllPages<Transaction>(`/api/v1/transactions?${liveQuery}`),
        apiFetchAllPages<Transaction>(`/api/v1/transactions?${testQuery}`),
        apiFetchAllPages<Affiliate>(`/api/v1/program-affiliates?${liveQuery}`),
        apiFetchAllPages<Affiliate>(`/api/v1/program-affiliates?${testQuery}`),
      ]);

      if (generation === refreshGeneration.current) {
        setReferrals(mergeByCreatedAt(liveReferrals.data, testReferrals.data));
        setCommissions(mergeByCreatedAt(liveCommissions.data, testCommissions.data));
        setTransactions(mergeByCreatedAt(liveTransactions.data, testTransactions.data));
        setAffiliates(mergeByCreatedAt(liveAffiliates.data, testAffiliates.data));
      }
    }
    catch (err) {
      if (generation === refreshGeneration.current) {
        throw err;
      }
    }
  }, [scopeQuery]);

  useEffect(() => {
    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to load referrals");
    });

    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]);

  const rows = useMemo((): ReferralRow[] => {
    const transactionsByKey = new Map<string, Transaction[]>();
    const commissionsByKey = new Map<string, Commission[]>();

    for (const transaction of transactions) {
      if (!transaction.customer_id || !transaction.program_id) {
        continue;
      }

      const key = `${transaction.program_id}:${transaction.customer_id}`;
      const list = transactionsByKey.get(key) ?? [];
      list.push(transaction);
      transactionsByKey.set(key, list);
    }

    for (const commission of commissions) {
      if (!commission.customer_id) {
        continue;
      }

      const key = `${commission.program_id}:${commission.customer_id}`;
      const list = commissionsByKey.get(key) ?? [];
      list.push(commission);
      commissionsByKey.set(key, list);
    }

    return referrals.map((referral) => {
      const key = `${referral.program_id}:${referral.customer_id}`;
      const referralTransactions = transactionsByKey.get(key) ?? [];
      const referralCommissions = commissionsByKey.get(key) ?? [];

      return {
        referral,
        transactions: referralTransactions,
        commissions: referralCommissions,
        revenue: sumMoney(referralTransactions),
        commissionTotal: sumMoney(referralCommissions),
        needsReview: referralCommissions.some(
          (entry) => entry.status === "flagged_self_referral"
        ),
      };
    });
  }, [referrals, commissions, transactions]);

  async function onRelease(entryId: string) {
    setLoading(true);

    try {
      await apiFetch(`/api/v1/commissions/${entryId}/release`, {
        method: "POST",
      });
      await refresh();
      setCommissionAction(null);
      toast.success("Self-referral released.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Release failed");
    }

    setLoading(false);
  }

  async function onReject(entryId: string) {
    setLoading(true);

    try {
      await apiFetch(`/api/v1/commissions/${entryId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "self_referral_rejected" }),
      });
      await refresh();
      setCommissionAction(null);
      toast.success("Self-referral rejected.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    }

    setLoading(false);
  }

  if (meLoading || loadingPrograms) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const detailColSpan = showProgramColumn ? 7 : 6;
  const emptyState = referralsEmptyStateMessage(setupStatus);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Referrals">
        <ProgramFilter
          programs={programs}
          value={programFilter}
          onChange={setProgramFilter}
        />
      </PageHeader>

      <Card className="border-border/70 py-0">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EntityListEmpty
              icon={ListTree}
              title={emptyState.title}
              description={emptyState.description}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Customer</TableHead>
                  <TableHead>Affiliate</TableHead>
                  {showProgramColumn ? <TableHead>Program</TableHead> : null}
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Net revenue
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="About net revenue"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Info className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          Payment total after refunds for this customer.
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </TableHead>
                  <TableHead>Commissions</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isExpanded = expandedId === row.referral.id;
                  const detailsId = `referral-details-${row.referral.id}`;
                  const affiliate = affiliateById.get(
                    row.referral.program_affiliate_id
                  );
                  const isTest = affiliate?.is_test ?? false;

                  return (
                    <Fragment key={row.referral.id}>
                      <TableRow>
                        <TableCell className="w-8 pr-0 text-muted-foreground">
                          <button
                            type="button"
                            className="rounded-sm p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={isExpanded
                              ? "Collapse referral details"
                              : "Expand referral details"}
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                            onClick={() => {
                              setExpandedId(isExpanded ? null : row.referral.id);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-4" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="size-4" aria-hidden="true" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {customerDisplayLabel({
                                customer_id: row.referral.customer_id,
                                customer_email: row.referral.customer_email,
                                customer_external_customer_id:
                                  row.referral.customer_external_customer_id,
                              })}
                            </span>
                            {isTest ? <Badge variant="outline">Test</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <UserDisplay
                            id={row.referral.program_affiliate_id}
                            name={affiliate?.name}
                            email={affiliate?.email}
                            image={affiliate?.image}
                            link_code={affiliate?.link_code}
                            nameClassName={cn(
                              !affiliate?.name
                              && !affiliate?.email
                              && "font-mono text-xs font-normal"
                            )}
                          />
                        </TableCell>
                        {showProgramColumn ? (
                          <TableCell>
                            {names.get(row.referral.program_id)
                              ?? row.referral.program_id}
                          </TableCell>
                        ) : null}
                        <TableCell>
                          {row.revenue
                            ? formatMoney(
                              row.revenue.amount,
                              row.revenue.currency
                            )
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {row.commissionTotal
                            ? formatMoney(
                              row.commissionTotal.amount,
                              row.commissionTotal.currency
                            )
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {row.needsReview ? (
                            <Badge variant="outline">Needs review</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {row.commissions.length > 0
                                ? `${row.commissions.length} commission${
                                    row.commissions.length === 1 ? "" : "s"
                                  }`
                                : "No payments yet"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded ? (
                        <TableRow
                          id={detailsId}
                          className="hover:bg-transparent"
                        >
                          <TableCell
                            colSpan={detailColSpan}
                            className="bg-muted/35 p-4"
                          >
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-col gap-2">
                                <p className="text-sm font-medium">Payments</p>
                                {row.transactions.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No attributed payments yet.
                                  </p>
                                ) : (
                                  <div className="overflow-hidden rounded-md bg-background/70">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Action</TableHead>
                                          <TableHead>Amount</TableHead>
                                          <TableHead>Date</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {row.transactions.map((transaction) => (
                                          <TableRow key={transaction.id}>
                                            <TableCell>
                                              {transactionActionLabel(
                                                transaction.action
                                              )}
                                            </TableCell>
                                            <TableCell>
                                              {formatMoney(
                                                transaction.amount.amount,
                                                transaction.amount.currency
                                              )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                              {formatDashboardDateTime(
                                                transaction.created_at
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-2">
                                <p className="text-sm font-medium">
                                  Commissions
                                </p>
                                {row.commissions.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No commissions yet.
                                  </p>
                                ) : (
                                  <div className="overflow-hidden rounded-md bg-background/70">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Type</TableHead>
                                          <TableHead>Amount</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Actions</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {row.commissions.map((commission) => (
                                          <TableRow key={commission.id}>
                                            <TableCell>
                                              {commissionKindLabel(commission.kind)}
                                            </TableCell>
                                            <TableCell>
                                              {formatMoney(
                                                commission.amount.amount,
                                                commission.amount.currency
                                              )}
                                            </TableCell>
                                            <TableCell>
                                              <span className="text-sm text-muted-foreground">
                                                {commissionStatusLabel(
                                                  commission.status
                                                )}
                                              </span>
                                            </TableCell>
                                            <TableCell>
                                              {commission.livemode
                                                && commission.status
                                                === "flagged_self_referral" ? (
                                                <div className="flex flex-wrap gap-2">
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      setCommissionAction({
                                                        type: "release",
                                                        entryId: commission.id,
                                                        amountLabel: formatMoney(
                                                          commission.amount.amount,
                                                          commission.amount.currency
                                                        ),
                                                      });
                                                    }}
                                                    disabled={loading}
                                                  >
                                                    Release
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      setCommissionAction({
                                                        type: "reject",
                                                        entryId: commission.id,
                                                        amountLabel: formatMoney(
                                                          commission.amount.amount,
                                                          commission.amount.currency
                                                        ),
                                                      });
                                                    }}
                                                    disabled={loading}
                                                  >
                                                    Reject
                                                  </Button>
                                                </div>
                                              ) : (
                                                "-"
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>

                              <p className="text-xs text-muted-foreground">
                                Referred{" "}
                                {formatDashboardDateTime(row.referral.created_at)}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ConfirmationDialog
        open={commissionAction !== null}
        title={commissionAction?.type === "release"
          ? "Release this commission?"
          : "Reject this commission?"}
        description={commissionAction?.type === "release"
          ? `This will approve the flagged ${commissionAction.amountLabel} self-referral commission.`
          : `This will reject the flagged ${commissionAction?.amountLabel ?? ""} self-referral commission.`}
        confirmLabel={commissionAction?.type === "release" ? "Release" : "Reject"}
        loading={loading}
        onOpenChange={(open) => {
          if (!open) {
            setCommissionAction(null);
          }
        }}
        onConfirm={() => {
          if (!commissionAction) {
            return;
          }

          if (commissionAction.type === "release") {
            void onRelease(commissionAction.entryId);
          }
          else {
            void onReject(commissionAction.entryId);
          }
        }}
      />
    </div>
  );
}

export default function ReferralsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <ReferralsPageContent />
    </Suspense>
  );
}
