"use client";

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

type AdminPayoutBatch = {
  id: string;
  program_id: string;
  status: string;
  created_at: string;
};

export default function AdminPayoutBatchesPage() {
  const { rows, hasMore, loading, load } =
    useAdminPagedList<AdminPayoutBatch>("/api/v1/admin/payout-batches");

  function onDownload(runId: string) {
    window.open(`/api/v1/admin/payout-batches/${runId}/csv`, "_blank");
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payout batches" />

      {loading && rows.length === 0 ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">CSV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-mono text-xs">{run.id}</TableCell>
                  <TableCell className="font-mono text-xs">{run.program_id}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {run.status}
                  </TableCell>
                  <TableCell className="text-right">
                    {run.status === "paid" || run.status === "cancelled" ? (
                      "-"
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDownload(run.id)}
                      >
                        Download
                      </Button>
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
