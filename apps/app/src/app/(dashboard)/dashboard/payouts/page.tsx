"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Info, Wallet } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import {
  apiFetch,
  apiFetchAllPages,
  type ListResponse,
} from "@/lib/api-client";
import {
  formatDashboardDateTime,
  payoutRequestStatusLabel,
} from "@/lib/dashboard-display";
import { formatMoney } from "@/lib/dashboard-types";

type PayoutRequest = {
  id: string;
  program_id: string;
  status: string;
  program_affiliate_id: string;
  amount: { amount: number; currency: string };
};

type PayoutBatch = {
  id: string;
  program_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  executions: Array<{
    id: string;
    program_affiliate_id: string;
    status: "ready" | "failed" | "succeeded";
    failure_reason: string | null;
  }>;
};

type PayoutItem = {
  id: string;
  program_affiliate_id: string;
  amount: { amount: number; currency: string };
  status: string;
};

type ReadyPayout = {
  program_id: string;
  program_affiliate_id: string;
  amount: { amount: number; currency: string };
  requested: boolean;
  email: string;
  name: string | null;
  image: string | null;
};

type Affiliate = {
  id: string;
  link_code: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

type AffiliatePayout = {
  programAffiliateId: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed";
};

function groupAffiliatePayouts(items: PayoutItem[]) {
  const payouts = new Map<string, AffiliatePayout>();

  for (const item of items) {
    const existing = payouts.get(item.program_affiliate_id);

    if (existing) {
      existing.amount += item.amount.amount;
      if (existing.status !== item.status) {
        existing.status = item.status === "pending" ? "pending" : "failed";
      }
    }
    else {
      payouts.set(item.program_affiliate_id, {
        programAffiliateId: item.program_affiliate_id,
        amount: item.amount.amount,
        currency: item.amount.currency,
        status:
          item.status === "paid"
            ? "paid"
            : item.status === "failed"
              ? "failed"
              : "pending",
      });
    }
  }

  return [...payouts.values()];
}

function PayoutsPageContent() {
  const {
    meLoading,
    programs,
    loadingPrograms,
    programFilter,
    setProgramFilter,
    liveListQuery,
  } = useAppProgramScope();
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [readyPayouts, setReadyPayouts] = useState<ReadyPayout[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [runItems, setRunItems] = useState<Record<string, PayoutItem[]>>({});
  const [declineReason, setDeclineReason] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [payoutAction, setPayoutAction] = useState<
    | {
        type: "mark-paid";
        programId: string;
        programAffiliateId: string;
        affiliateLabel: string;
        amountLabel: string;
        batchId?: string;
      }
    | { type: "dispatch"; batchId: string }
    | null
  >(null);
  const refreshGeneration = useRef(0);
  const names = programNameMap(programs);
  const showProgramColumn = !programFilter;
  const canDownloadCsv = Boolean(programFilter);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;

    if (!liveListQuery) {
      setRequests([]);
      setReadyPayouts([]);
      setBatches([]);
      setAffiliates([]);
      setRunItems({});
      return;
    }

    const readyProgramIds = programFilter
      ? [programFilter]
      : programs.map((program) => program.id);
    try {
      const [requestResult, batchResult, affiliateResult, readyResults] =
        await Promise.all([
        apiFetchAllPages<PayoutRequest>(
          `/api/v1/payout-requests?${liveListQuery}`
        ),
        apiFetchAllPages<PayoutBatch>(`/api/v1/payout-batches?${liveListQuery}`),
        apiFetchAllPages<Affiliate>(`/api/v1/program-affiliates?${liveListQuery}`),
        Promise.all(
          readyProgramIds.map((programId) =>
            apiFetch<ListResponse<ReadyPayout>>(
              `/api/v1/ready-payouts?program_id=${programId}`
            )
          )
        ),
      ]);
      const itemResults = await Promise.all(
        batchResult.data.map(async (batch) => {
          const result = await apiFetch<{ data: PayoutItem[] }>(
            `/api/v1/payout-batches/${batch.id}/items`
          );
          return [batch.id, result.data] as const;
        })
      );

      if (generation === refreshGeneration.current) {
        setRequests(requestResult.data);
        setReadyPayouts(readyResults.flatMap((result) => result.data));
        setBatches(batchResult.data);
        setAffiliates(affiliateResult.data);
        setRunItems(Object.fromEntries(itemResults));
      }
    }
    catch (err) {
      if (generation === refreshGeneration.current) {
        throw err;
      }
    }
  }, [liveListQuery, programFilter, programs]);

  useEffect(() => {
    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((err) => {
      toast.error(err instanceof Error ? err.message : "Failed to load payouts");
    });

    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]);

  async function onDownloadReadyCsv() {
    if (!programFilter) {
      toast.error("Select a program before downloading its payout CSV.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/v1/ready-payouts/csv", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: programFilter }),
      });

      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? "CSV download failed");
      }

      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `payouts-${programFilter}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      await refresh();
      toast.success("Payout CSV downloaded.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV download failed");
    }

    setLoading(false);
  }

  async function onDecline(requestId: string) {
    if (!declineReason.trim()) {
      toast.error("Enter a decline reason.");
      return;
    }

    setLoading(true);

    try {
      await apiFetch(`/api/v1/payout-requests/${requestId}/decline`, {
        method: "POST",
        body: JSON.stringify({ reason: declineReason }),
      });
      setDeclineReason("");
      setSelectedRequestId(null);
      await refresh();
      toast.success("Request declined.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Decline failed");
    }

    setLoading(false);
  }

  async function onMarkAffiliatePaid(
    programId: string,
    programAffiliateId: string,
    runId?: string
  ) {
    setLoading(true);

    try {
      const path = runId
        ? `/api/v1/payout-batches/${runId}/affiliates/${programAffiliateId}/mark-paid`
        : `/api/v1/ready-payouts/${programAffiliateId}/mark-paid`;
      await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(runId ? {} : { program_id: programId }),
      });
      await refresh();
      setPayoutAction(null);
      toast.success("Affiliate payout marked paid.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Mark paid failed");
    }

    setLoading(false);
  }

  async function onDispatch(batchId: string) {
    setLoading(true);

    try {
      await apiFetch(`/api/v1/payout-batches/${batchId}/dispatch`, {
        method: "POST",
      });
      await refresh();
      setPayoutAction(null);
      toast.success("Payout batch sent to the payout system.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
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

  const affiliateById = new Map(
    affiliates.map((affiliate) => [affiliate.id, affiliate])
  );
  const historicalPayouts = batches
    .filter((batch) => batch.status !== "cancelled")
    .flatMap((batch) =>
      groupAffiliatePayouts(runItems[batch.id] ?? []).map((payout) => ({
        ...payout,
        batch,
      }))
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payouts">
        <ProgramFilter
          programs={programs}
          value={programFilter}
          onChange={setProgramFilter}
        />
        {!canDownloadCsv ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button variant="outline" disabled>
                  Download CSV
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              Select a program to download its payout CSV.
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="outline"
            onClick={onDownloadReadyCsv}
            disabled={loading || readyPayouts.length === 0}
          >
            Download CSV
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              aria-label="About payouts"
            >
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="max-w-xs">
            Live balances only. Pay affiliates outside RefKit, then mark each
            payout paid.
          </TooltipContent>
        </Tooltip>
      </PageHeader>

      <Card className="gap-0 border-border/70 py-0">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-base">Open payout requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <EntityListEmpty
              icon={Wallet}
              title="No payout requests"
              description="Requests appear when affiliates ask to be paid."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Affiliate</TableHead>
                  <TableHead>Amount</TableHead>
                  {showProgramColumn ? <TableHead>Program</TableHead> : null}
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => {
                  const affiliate = affiliateById.get(request.program_affiliate_id);

                  return (
                    <TableRow key={request.id}>
                      <TableCell>
                        <UserDisplay
                          id={request.program_affiliate_id}
                          name={affiliate?.name}
                          email={affiliate?.email}
                          image={affiliate?.image}
                          link_code={affiliate?.link_code}
                        />
                      </TableCell>
                      <TableCell>
                        {formatMoney(
                          request.amount.amount,
                          request.amount.currency
                        )}
                      </TableCell>
                      {showProgramColumn ? (
                        <TableCell>
                          {names.get(request.program_id) ?? request.program_id}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {payoutRequestStatusLabel(request.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {request.status === "open" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedRequestId(request.id)}
                          >
                            Decline
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedRequestId ? (
        <div className="rounded-md bg-muted/35 px-4 py-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="decline-reason">Decline reason</FieldLabel>
              <Input
                id="decline-reason"
                placeholder="Decline reason"
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => onDecline(selectedRequestId)}
              disabled={loading}
            >
              Confirm decline
            </Button>
            <Button variant="ghost" onClick={() => setSelectedRequestId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <Card className="gap-0 border-border/70 py-0">
        <CardHeader className="px-5 py-4">
          <CardTitle className="text-base">Affiliate payouts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {readyPayouts.length === 0 && historicalPayouts.length === 0 ? (
            <EntityListEmpty
              icon={Wallet}
              title="No affiliate payouts yet"
              description="Ready and completed payouts appear once commissions are payable."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Affiliate</TableHead>
                  <TableHead>Amount</TableHead>
                  {showProgramColumn ? <TableHead>Program</TableHead> : null}
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyPayouts.map((payout) => (
                  <TableRow
                    key={`ready:${payout.program_id}:${payout.program_affiliate_id}`}
                  >
                    <TableCell>
                      <UserDisplay
                        id={payout.program_affiliate_id}
                        name={payout.name}
                        email={payout.email}
                        image={payout.image}
                      />
                    </TableCell>
                    <TableCell>
                      {formatMoney(
                        payout.amount.amount,
                        payout.amount.currency
                      )}
                    </TableCell>
                    {showProgramColumn ? (
                      <TableCell>
                        {names.get(payout.program_id) ?? payout.program_id}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        Ready to pay
                        {payout.requested ? " · Requested" : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">-</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPayoutAction({
                          type: "mark-paid",
                          programId: payout.program_id,
                          programAffiliateId: payout.program_affiliate_id,
                          affiliateLabel:
                            payout.name ?? payout.email ?? payout.program_affiliate_id,
                          amountLabel: formatMoney(
                            payout.amount.amount,
                            payout.amount.currency
                          ),
                        })}
                        disabled={loading}
                      >
                        Mark paid
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {historicalPayouts.map((payout) => {
                  const affiliate = affiliateById.get(
                    payout.programAffiliateId
                  );
                  const isPending = payout.status === "pending";
                  const execution = payout.batch.executions?.find(
                    (entry) =>
                      entry.program_affiliate_id === payout.programAffiliateId,
                  );
                  const isFirstAffiliateInBatch =
                    historicalPayouts.find(
                      (entry) => entry.batch.id === payout.batch.id,
                    ) === payout;
                  const statusLabel = execution?.status === "failed"
                    ? "Payout system failed"
                    : execution?.status === "ready"
                      ? "Sent to payout system"
                      : payout.status === "paid" || execution?.status === "succeeded"
                      ? "Paid"
                      : payout.status === "failed"
                        ? "Needs attention"
                        : "Ready to pay";

                  return (
                    <TableRow
                      key={`${payout.batch.id}:${payout.programAffiliateId}`}
                    >
                      <TableCell>
                        <UserDisplay
                          id={payout.programAffiliateId}
                          name={affiliate?.name}
                          email={affiliate?.email}
                          image={affiliate?.image}
                          link_code={affiliate?.link_code}
                        />
                      </TableCell>
                      <TableCell>
                        {formatMoney(payout.amount, payout.currency)}
                      </TableCell>
                      {showProgramColumn ? (
                        <TableCell>
                          {names.get(payout.batch.program_id) ??
                            payout.batch.program_id}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {statusLabel}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDashboardDateTime(
                          payout.status === "paid"
                            ? payout.batch.updated_at
                            : payout.batch.created_at
                        )}
                      </TableCell>
                      <TableCell>
                        {isPending ? (
                          <div className="flex flex-wrap gap-2">
                            {isFirstAffiliateInBatch
                            && payout.batch.status === "prepared"
                            && payout.batch.executions.length === 0 ? (
                              <Button
                                size="sm"
                                onClick={() => setPayoutAction({
                                  type: "dispatch",
                                  batchId: payout.batch.id,
                                })}
                                disabled={loading}
                              >
                                Send to payout system
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPayoutAction({
                                type: "mark-paid",
                                programId: payout.batch.program_id,
                                programAffiliateId: payout.programAffiliateId,
                                affiliateLabel:
                                  affiliate?.name
                                  ?? affiliate?.email
                                  ?? payout.programAffiliateId,
                                amountLabel: formatMoney(
                                  payout.amount,
                                  payout.currency
                                ),
                                batchId: payout.batch.id,
                              })}
                              disabled={loading}
                            >
                              Mark paid
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ConfirmationDialog
        open={payoutAction !== null}
        title={payoutAction?.type === "dispatch"
          ? "Send this payout batch?"
          : "Mark this payout paid?"}
        description={payoutAction?.type === "dispatch"
          ? `This will send batch ${payoutAction.batchId} to the connected payout system.`
          : payoutAction
            ? `Only confirm after ${payoutAction.affiliateLabel} has received ${payoutAction.amountLabel}.`
            : "Only confirm after the affiliate has received this payout."}
        confirmLabel={payoutAction?.type === "dispatch" ? "Send batch" : "Mark paid"}
        loading={loading}
        onOpenChange={(open) => {
          if (!open) {
            setPayoutAction(null);
          }
        }}
        onConfirm={() => {
          if (!payoutAction) {
            return;
          }

          if (payoutAction.type === "dispatch") {
            void onDispatch(payoutAction.batchId);
          }
          else {
            void onMarkAffiliatePaid(
              payoutAction.programId,
              payoutAction.programAffiliateId,
              payoutAction.batchId
            );
          }
        }}
      />
    </div>
  );
}

export default function PayoutsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <PayoutsPageContent />
    </Suspense>
  );
}
