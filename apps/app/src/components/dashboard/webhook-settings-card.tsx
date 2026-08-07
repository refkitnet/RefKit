"use client";

import { useCallback, useEffect, useState } from "react";
import { Webhook } from "lucide-react";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/dashboard/confirmation-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyBlock } from "@/components/ui/copy-block";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, type ListResponse } from "@/lib/api-client";
import { formatDashboardDateTime } from "@/lib/dashboard-display";
import { OUTGOING_WEBHOOKS_GUIDE_URL } from "@/lib/integration-guides";
import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from "@/lib/webhook-events";

type WebhookEndpoint = {
  id: string;
  app_id: string;
  url: string;
  enabled_events: WebhookEventType[];
  enabled: boolean;
};

type WebhookDelivery = {
  id: string;
  event_id: string;
  event_type: string;
  success: boolean;
  http_status: number | null;
  error: string | null;
  created_at: string;
};

type WebhookResponse = {
  webhook: WebhookEndpoint | null;
  secret?: string | null;
};

const HTTPS_URL_PATTERN = /^https:\/\/\S+$/i;

function isValidWebhookUrl(value: string) {
  const trimmed = value.trim();

  if (!HTTPS_URL_PATTERN.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  }
  catch {
    return false;
  }
}

export function WebhookSettingsCard({
  appId,
  externalGuide = true,
}: {
  appId: string;
  externalGuide?: boolean;
}) {
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null>(null);
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [enabledEvents, setEnabledEvents] = useState<WebhookEventType[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const webhookUrlIsValid = isValidWebhookUrl(url);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const [webhookResult, deliveryResult] = await Promise.all([
        apiFetch<WebhookResponse>(`/api/v1/apps/${appId}/webhook`),
        apiFetch<ListResponse<WebhookDelivery>>(
          `/api/v1/apps/${appId}/webhook/deliveries?limit=10`,
        ),
      ]);
      setEndpoint(webhookResult.webhook);
      setUrl(webhookResult.webhook?.url ?? "");
      setEnabled(webhookResult.webhook?.enabled ?? true);
      setEnabledEvents(webhookResult.webhook?.enabled_events ?? []);
      setDeliveries(deliveryResult.data);
    }
    catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load webhook",
      );
    }
    finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  function toggleEvent(eventType: WebhookEventType, checked: boolean) {
    setEnabledEvents((current) =>
      checked
        ? [...new Set([...current, eventType])]
        : current.filter((value) => value !== eventType),
    );
  }

  async function save() {
    if (!webhookUrlIsValid) {
      return;
    }

    setSaving(true);

    try {
      const result = await apiFetch<WebhookResponse>(
        `/api/v1/apps/${appId}/webhook`,
        {
          method: "PUT",
          body: JSON.stringify({
            url,
            enabled,
            enabled_events: enabledEvents,
          }),
        },
      );
      setEndpoint(result.webhook);
      setRevealedSecret(result.secret ?? null);
      toast.success("Webhook configuration saved.");
      await refresh();
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : "Webhook save failed");
    }
    finally {
      setSaving(false);
    }
  }

  async function rotateSecret() {
    setSaving(true);

    try {
      const result = await apiFetch<WebhookResponse>(
        `/api/v1/apps/${appId}/webhook/rotate-secret`,
        { method: "POST" },
      );
      setRevealedSecret(result.secret ?? null);
      toast.success("Webhook secret rotated. Copy the new secret now.");
    }
    catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Secret rotation failed",
      );
    }
    finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setSaving(true);

    try {
      const result = await apiFetch<{ delivery: WebhookDelivery }>(
        `/api/v1/apps/${appId}/webhook/test`,
        { method: "POST" },
      );
      toast[result.delivery.success ? "success" : "error"](
        result.delivery.success
          ? "Test webhook delivered."
          : result.delivery.error ?? "Test webhook failed.",
      );
      await refresh();
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : "Test webhook failed");
    }
    finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);

    try {
      await apiFetch(`/api/v1/apps/${appId}/webhook`, { method: "DELETE" });
      setEndpoint(null);
      setUrl("");
      setEnabled(true);
      setEnabledEvents([]);
      setRevealedSecret(null);
      setRemoveOpen(false);
      toast.success("Webhook endpoint removed.");
      await refresh();
    }
    catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Webhook removal failed",
      );
    }
    finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card id="webhook" className="scroll-mt-6 gap-5 border-border/70 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="size-4 text-muted-foreground/70" />
          Outgoing webhook
        </CardTitle>
        <CardDescription>
          One best-effort delivery attempt per selected event.
          {externalGuide ? (
            <>
              {" "}
              <a
                href={OUTGOING_WEBHOOKS_GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Read the webhook guide.
              </a>
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 px-5">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="webhook-url">HTTPS endpoint URL</FieldLabel>
              <Input
                id="webhook-url"
                type="url"
                pattern="https://.*"
                required
                placeholder="https://example.com/refkit-webhook"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                aria-invalid={url.length > 0 && !webhookUrlIsValid}
              />
              {url.length > 0 && !webhookUrlIsValid ? (
                <FieldError>Enter a valid HTTPS URL.</FieldError>
              ) : null}
              <FieldDescription>
                Private network targets are blocked unless the server opts in.
              </FieldDescription>
            </Field>

            <Field orientation="horizontal" className="items-center justify-between">
              <div>
                <FieldLabel htmlFor="webhook-enabled">Enabled</FieldLabel>
                <FieldDescription>Disable delivery without removing the endpoint.</FieldDescription>
              </div>
              <Switch
                id="webhook-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </Field>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {WEBHOOK_EVENT_TYPES.map((eventType) => (
                <label
                  key={eventType}
                  className="flex items-center gap-2 rounded-md bg-muted/35 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={enabledEvents.includes(eventType)}
                    onCheckedChange={(checked) =>
                      toggleEvent(eventType, checked === true)
                    }
                  />
                  {eventType}
                </label>
              ))}
            </div>

            {revealedSecret ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Signing secret, shown once</p>
                <CopyBlock
                  value={revealedSecret}
                  ariaLabel="Copy webhook signing secret"
                  wrap
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={saving || !webhookUrlIsValid}>
                {saving ? <Spinner /> : null}
                Save webhook
              </Button>
              {endpoint ? (
                <>
                  <Button variant="outline" onClick={sendTest} disabled={saving}>
                    Send test
                  </Button>
                  <Button
                    variant="outline"
                    onClick={rotateSecret}
                    disabled={saving}
                  >
                    Rotate secret
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setRemoveOpen(true)}
                    disabled={saving}
                  >
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
          </>
        )}

        {deliveries.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-mono text-xs">
                      {delivery.event_type}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {delivery.success
                        ? `Delivered${delivery.http_status ? ` (${delivery.http_status})` : ""}`
                        : delivery.error ?? "Failed"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDashboardDateTime(delivery.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
      </Card>
      <ConfirmationDialog
        open={removeOpen}
        title="Remove this webhook endpoint?"
        description={`RefKit will stop sending events to ${endpoint?.url ?? "this endpoint"}.`}
        confirmLabel="Remove webhook"
        loading={saving}
        onOpenChange={setRemoveOpen}
        onConfirm={() => void remove()}
      />
    </>
  );
}
