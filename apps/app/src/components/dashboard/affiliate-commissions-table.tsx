"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCommissionDate,
  type AffiliateCommission,
} from "@/lib/affiliate-dashboard";
import {
  commissionKindLabel,
  commissionStatusLabel,
} from "@/lib/dashboard-display";
import { formatMoney } from "@/lib/dashboard-types";

export function AffiliateCommissionsTable({
  commissions,
  programNames,
  showProgram = false,
  emptyMessage = "No commissions yet.",
}: {
  commissions: AffiliateCommission[];
  programNames: Map<string, string>;
  showProgram?: boolean;
  emptyMessage?: string;
}) {
  if (commissions.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          {showProgram ? <TableHead>Program</TableHead> : null}
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Type</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {commissions.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="text-muted-foreground">
              {formatCommissionDate(entry.created_at)}
            </TableCell>
            {showProgram ? (
              <TableCell>
                {programNames.get(entry.program_id) ?? entry.program_id}
              </TableCell>
            ) : null}
            <TableCell>
              {formatMoney(entry.amount.amount, entry.amount.currency)}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">
                {commissionStatusLabel(entry.status)}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {commissionKindLabel(entry.kind)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
