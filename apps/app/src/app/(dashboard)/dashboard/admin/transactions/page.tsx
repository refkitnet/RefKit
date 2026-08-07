"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { useAdminPagedList } from "@/components/dashboard/use-admin-paged-list";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/dashboard-types";

type AdminTransaction = {
  id: string;
  program_id: string;
  program_affiliate_id: string | null;
  action: string;
  amount: { amount: number; currency: string };
  livemode: boolean;
  created_at: string;
};

export default function AdminTransactionsPage() {
  const { rows, hasMore, loading, load } =
    useAdminPagedList<AdminTransaction>("/api/v1/admin/transactions");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Transactions" />

      {loading && rows.length === 0 ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Affiliate</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Mode</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="font-mono text-xs">{txn.id}</TableCell>
                  <TableCell className="font-mono text-xs">{txn.program_id}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {txn.program_affiliate_id ?? "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {txn.action}
                  </TableCell>
                  <TableCell>
                    {formatMoney(txn.amount.amount, txn.amount.currency)}
                  </TableCell>
                  <TableCell>
                    {txn.livemode ? (
                      <span className="text-sm text-muted-foreground">live</span>
                    ) : (
                      <Badge variant="outline">test</Badge>
                    )}
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
