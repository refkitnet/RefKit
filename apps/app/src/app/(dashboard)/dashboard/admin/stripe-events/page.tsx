"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

type AdminStripeEvent = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  processing_status: string;
  processing_attempts: number;
  processing_started_at: string | null;
  last_processing_error: string | null;
  is_stuck: boolean;
  livemode: boolean;
  created_at: string;
  updated_at: string;
};

function EventsTable({
  rows,
  actionId,
  onReprocess,
}: {
  rows: AdminStripeEvent[];
  actionId: string | null;
  onReprocess: (eventId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border/70">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stripe event</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Last error</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((event) => {
            const needsRetry =
              event.processing_status === "failed" || event.is_stuck;
            const statusLabel = event.is_stuck
              ? "stuck"
              : event.processing_status;

            return (
              <TableRow key={event.id}>
                <TableCell className="font-mono text-xs">
                  {event.stripe_event_id}
                </TableCell>
                <TableCell>{event.event_type}</TableCell>
                <TableCell>
                  {needsRetry ? (
                    <span className="text-sm text-destructive">{statusLabel}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {statusLabel}
                    </span>
                  )}
                </TableCell>
                <TableCell>{event.processing_attempts}</TableCell>
                <TableCell className="max-w-72 truncate text-xs">
                  {event.last_processing_error ?? "-"}
                </TableCell>
                <TableCell>
                  {event.livemode ? (
                    <span className="text-sm text-muted-foreground">live</span>
                  ) : (
                    <Badge variant="outline">test</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionId === event.id}
                    onClick={() => onReprocess(event.id)}
                  >
                    {needsRetry ? "Retry" : "Reprocess"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AdminStripeEventsPage() {
  const [rows, setRows] = useState<AdminStripeEvent[]>([]);
  const [attentionRows, setAttentionRows] = useState<AdminStripeEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async (startingAfter?: string) => {
    setLoading(true);

    try {
      const query = new URLSearchParams({ limit: "25" });

      if (startingAfter) {
        query.set("starting_after", startingAfter);
      }

      const recentRequest = apiFetch<ListResponse<AdminStripeEvent>>(
        `/api/v1/admin/stripe-events?${query.toString()}`
      );

      if (startingAfter) {
        const recent = await recentRequest;
        setRows((current) => [...current, ...recent.data]);
        setHasMore(recent.has_more);
      }
      else {
        const attentionQuery = new URLSearchParams({
          limit: "25",
          attention_only: "true",
        });
        const [recent, attention] = await Promise.all([
          recentRequest,
          apiFetch<ListResponse<AdminStripeEvent>>(
            `/api/v1/admin/stripe-events?${attentionQuery.toString()}`
          ),
        ]);

        setRows(recent.data);
        setAttentionRows(attention.data);
        setHasMore(recent.has_more);
      }
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load events"
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

  async function onReprocess(eventId: string) {
    if (!window.confirm(`Reprocess Stripe event ${eventId}?`)) {
      return;
    }

    setActionId(eventId);

    try {
      await apiFetch(`/api/v1/admin/stripe-events/${eventId}/reprocess`, {
        method: "POST",
      });
      await load();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Reprocess failed");
      await load();
    }
    finally {
      setActionId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Stripe events" />

      {loading && rows.length === 0 ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">Needs attention</h2>
              <p className="text-sm text-muted-foreground">
                Failed events and events stuck for more than five minutes.
              </p>
            </div>
            {attentionRows.length === 0 ? (
              <p className="rounded-lg border border-border/70 p-4 text-sm text-muted-foreground">
                No failed or stuck Stripe events.
              </p>
            ) : (
              <EventsTable
                rows={attentionRows}
                actionId={actionId}
                onReprocess={(eventId) => void onReprocess(eventId)}
              />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Recent events</h2>
            <EventsTable
              rows={rows}
              actionId={actionId}
              onReprocess={(eventId) => void onReprocess(eventId)}
            />
          </section>
        </>
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
