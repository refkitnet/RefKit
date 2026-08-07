"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/components/dashboard/auth-guard";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ProgramFilter,
  programNameMap,
} from "@/components/dashboard/program-filter";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch, apiFetchAllPages } from "@/lib/api-client";
import {
  affiliateProgramOptions,
  filterByProgram,
  formatCommissionDate,
} from "@/lib/affiliate-dashboard";
import {
  MONEY_METRICS_HELP,
  OPEN_PAYOUT_REQUEST_NOTE,
  payoutRequestStatusLabel,
  payoutBatchStatusLabel,
  TEST_MODE_PAYOUT_NOTE,
} from "@/lib/dashboard-display";
import { formatMoney } from "@/lib/dashboard-types";

type PayoutRequest = {
  id: string;
  program_id: string;
  status: string;
  amount: { amount: number; currency: string };
  created_at: string;
};

type PayoutBatch = {
  id: string;
  program_id: string;
  status: string;
  amount: { amount: number; currency: string };
  created_at: string;
};

type ProgramBalance = {
  programId: string;
  amount: number;
  currency: string;
};

export default function AffiliatePayoutsPage() {
  const { me } = useMe();
  const searchParams = useSearchParams();
  const queryProgram = searchParams.get("program") ?? "";
  const [programFilter, setProgramFilter] = useState("");
  const activeProgramFilter = programFilter || queryProgram;
  const [balances, setBalances] = useState<ProgramBalance[]>([]);
  const [requests, setRequests] = useState<PayoutRequest[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [paypalByProgram, setPaypalByProgram] = useState<Record<string, string>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const programs = useMemo(
    () => (me ? affiliateProgramOptions(me) : []),
    [me]
  );
  const programNames = useMemo(() => programNameMap(programs), [programs]);
  const selectedProgramId =
    activeProgramFilter || (programs.length === 1 ? programs[0]?.id ?? "" : "");

  const refresh = useCallback(async () => {
    if (!me) {
      return;
    }

    setLoading(true);

    try {
      const [requestResult, batchResult, balanceRows, detailRows] = await Promise.all([
        apiFetchAllPages<PayoutRequest>("/api/v1/payout-requests"),
        apiFetchAllPages<PayoutBatch>("/api/v1/payout-batches"),
        Promise.all(
          me.program_affiliates.map(async (entry) => {
            const balance = await apiFetch<{ amount: number; currency: string }>(
              `/api/v1/payout-balance?program_id=${entry.program.id}`
            );

            return {
              programId: entry.program.id,
              amount: balance.amount,
              currency: balance.currency,
            };
          })
        ),
        Promise.all(
          me.program_affiliates.map(async (entry) => {
            const details = await apiFetch<{
              data: Array<{ method: string; details: Record<string, unknown> }>;
            }>(`/api/v1/payout-details?program_id=${entry.program.id}`).catch(
              () => ({ data: [] })
            );
            const paypal = details.data.find((row) => row.method === "paypal");

            return {
              programId: entry.program.id,
              email:
                paypal && typeof paypal.details.email === "string"
                  ? paypal.details.email
                  : "",
            };
          })
        ),
      ]);

      setRequests(requestResult.data);
      setBatches(batchResult.data);
      setBalances(balanceRows);

      const nextPaypal: Record<string, string> = {};

      for (let i = 0; i < detailRows.length; i++) {
        nextPaypal[detailRows[i].programId] = detailRows[i].email;
      }

      setPaypalByProgram(nextPaypal);
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load payouts");
    }

    setLoading(false);
  }, [me]);

  useEffect(() => {
    if (!me) {
      return;
    }

    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => undefined);
  }, [me, refresh]);

  async function onSaveDetails(event: FormEvent) {
    event.preventDefault();

    if (!selectedProgramId) {
      toast.error("Select a program to save payout details.");
      return;
    }

    setSaving(true);

    try {
      await apiFetch("/api/v1/payout-details", {
        method: "PUT",
        body: JSON.stringify({
          program_id: selectedProgramId,
          method: "paypal",
          details: { email: paypalByProgram[selectedProgramId] ?? "" },
        }),
      });
      toast.success("Payout details saved.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }

    setSaving(false);
  }

  async function onRequestPayout(programId: string) {
    setSaving(true);

    try {
      await apiFetch("/api/v1/payout-requests", {
        method: "POST",
        body: JSON.stringify({ program_id: programId }),
      });
      await refresh();
      toast.success("Payout request submitted.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    }

    setSaving(false);
  }

  if (!me) {
    return null;
  }

  const visibleBalances = selectedProgramId
    ? balances.filter((row) => row.programId === selectedProgramId)
    : balances;

  const visibleRequests = filterByProgram(requests, selectedProgramId)
    .slice()
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
    );

  const visibleBatches = filterByProgram(batches, selectedProgramId)
    .slice()
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
    );

  const openRequests = visibleRequests.filter((row) => row.status === "open");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Payouts">
        <ProgramFilter
          programs={programs}
          value={activeProgramFilter}
          onChange={setProgramFilter}
        />
      </PageHeader>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-1.5 text-base">
            Payable balance
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="About payable balance"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-xs space-y-2">
                <p>{MONEY_METRICS_HELP.payable}</p>
                <p>{TEST_MODE_PAYOUT_NOTE}</p>
                <p>{OPEN_PAYOUT_REQUEST_NOTE}</p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-5">
          {loading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : visibleBalances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Select a program to view payable balance.
            </p>
          ) : (
            visibleBalances.map((row) => (
              <div
                key={row.programId}
                className="flex flex-col gap-3 rounded-md bg-muted/35 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-xs text-muted-foreground">
                    {programNames.get(row.programId) ?? row.programId}
                  </p>
                  <p className="text-2xl font-semibold text-foreground">
                    {formatMoney(row.amount, row.currency)}
                  </p>
                </div>
                <Button
                  onClick={() => onRequestPayout(row.programId)}
                  disabled={saving || row.amount <= 0}
                >
                  Request payout
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Open requests</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          {loading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : openRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open requests.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {!selectedProgramId ? <TableHead>Program</TableHead> : null}
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openRequests.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-muted-foreground">
                      {formatCommissionDate(row.created_at)}
                    </TableCell>
                    {!selectedProgramId ? (
                      <TableCell>
                        {programNames.get(row.program_id) ?? row.program_id}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {formatMoney(row.amount.amount, row.amount.currency)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {payoutRequestStatusLabel(row.status)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Payout details</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          {!selectedProgramId ? (
            <p className="text-sm text-muted-foreground">
              Select a program above to manage payout details.
            </p>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={onSaveDetails}>
              <div className="space-y-2">
                <Label htmlFor="paypal-email">PayPal email</Label>
                <Input
                  id="paypal-email"
                  type="email"
                  value={paypalByProgram[selectedProgramId] ?? ""}
                  onChange={(event) =>
                    setPaypalByProgram((current) => ({
                      ...current,
                      [selectedProgramId]: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div>
                <Button type="submit" variant="outline" disabled={saving}>
                  Save details
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="text-base">Payout history</CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          {loading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : visibleBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payouts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {!selectedProgramId ? <TableHead>Program</TableHead> : null}
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBatches.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-muted-foreground">
                      {formatCommissionDate(run.created_at)}
                    </TableCell>
                    {!selectedProgramId ? (
                      <TableCell>
                        {programNames.get(run.program_id) ?? run.program_id}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {formatMoney(run.amount.amount, run.amount.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {payoutBatchStatusLabel(run.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
