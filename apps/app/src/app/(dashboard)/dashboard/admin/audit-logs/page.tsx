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

type AdminAuditLog = {
  id: string;
  admin_user_id: string | null;
  managed_account_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
};

export default function AdminAuditLogsPage() {
  const { rows, hasMore, loading, load } =
    useAdminPagedList<AdminAuditLog>("/api/v1/admin/audit-logs");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Audit log" />

      {loading && rows.length === 0 ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.admin_user_id ?? log.managed_account_id}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.action}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.resource_type}:{log.resource_id}
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
