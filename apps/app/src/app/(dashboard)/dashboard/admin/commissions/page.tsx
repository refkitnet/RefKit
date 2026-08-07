"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { apiFetch, type ListResponse } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/dashboard-types";

type AdminCommission = {
  id: string;
  program_affiliate_id: string;
  program_id: string;
  kind: string;
  amount: { amount: number; currency: string };
  status: string;
  created_at: string;
};

export default function AdminCommissionsPage() {
  const [rows, setRows] = useState<AdminCommission[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [affiliateId, setAffiliateId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (startingAfter?: string) => {
    setLoading(true);

    try {
      const query = new URLSearchParams({ limit: "25" });

      if (startingAfter) {
        query.set("starting_after", startingAfter);
      }

      const result = await apiFetch<ListResponse<AdminCommission>>(
        `/api/v1/admin/commission-entries?${query.toString()}`
      );

      setRows((current) =>
        startingAfter ? [...current, ...result.data] : result.data
      );
      setHasMore(result.has_more);
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load commissions"
      );
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial admin list fetch
    void load();
  }, [load]);

  async function onCreateAdjustment(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    try {
      await apiFetch("/api/v1/admin/commission-adjustments", {
        method: "POST",
        body: JSON.stringify({
          program_affiliate_id: affiliateId.trim(),
          amount: Number(amount),
          currency: currency.trim().toLowerCase(),
          reason: reason.trim(),
        }),
      });

      toast.success("Adjustment created.");
      setAffiliateId("");
      setAmount("");
      setReason("");
      await load();
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create adjustment"
      );
    }
    finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Commissions" />

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Create adjustment</CardTitle>
          <CardDescription>
            Signed admin adjustment in minor units. Original entries are never edited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={onCreateAdjustment}>
            <div className="space-y-2">
              <Label htmlFor="program_affiliate_id">Program affiliate ID</Label>
              <Input
                id="program_affiliate_id"
                value={affiliateId}
                onChange={(event) => setAffiliateId(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (minor units)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting}>
                Create adjustment
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && rows.length === 0 ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Affiliate</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">{entry.id}</TableCell>
                  <TableCell>{entry.kind}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {entry.program_affiliate_id}
                  </TableCell>
                  <TableCell>
                    {formatMoney(entry.amount.amount, entry.amount.currency)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.status}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore ? (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => load(rows[rows.length - 1]?.id)}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
