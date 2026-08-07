"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/dashboard/confirmation-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  type AlertVariant,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  PaymentConnectionMode,
  PaymentConnectionState,
  PaymentConnectionView,
} from "@/lib/payment-connection";

type PaymentConnectionProps = {
  context: "setup" | "settings";
  view: PaymentConnectionView;
  notice?: string | null;
  noticeVariant?: AlertVariant;
  integrationHref?: string;
  onConnectStripe?: (mode?: PaymentConnectionMode) => void;
  onDisconnectStripe?: (mode?: PaymentConnectionMode) => void | Promise<void>;
};

function ConnectionStatus({
  label,
  statusLabel,
  connected,
}: {
  label: string;
  statusLabel: string;
  connected: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-3 text-sm">
      <span className="font-medium">{label}</span>
      <Badge variant={connected ? "success" : "secondary"}>{statusLabel}</Badge>
    </div>
  );
}

function DisconnectRecovery({
  view,
  onDisconnectStripe,
}: Pick<PaymentConnectionProps, "view" | "onDisconnectStripe">) {
  if (!view.disconnectAvailable || !onDisconnectStripe) {
    return null;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => onDisconnectStripe(view.mode)}
      disabled={view.loading}
    >
      {view.loading ? <Loader2 className="animate-spin" /> : null}
      Disconnect {view.mode} Stripe
    </Button>
  );
}

function SettingsDisconnectRecovery({
  view,
  onDisconnectStripe,
}: Pick<PaymentConnectionProps, "view" | "onDisconnectStripe">) {
  if (!onDisconnectStripe) {
    return null;
  }

  const actions: PaymentConnectionMode[] = [];
  if (view.test.connected) {
    actions.push("test");
  }
  if (view.live.connected) {
    actions.push("live");
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((mode) => (
        <Button
          key={mode}
          size="sm"
          variant="outline"
          onClick={() => onDisconnectStripe(mode)}
          disabled={view.loading}
        >
          {view.loading ? <Loader2 className="animate-spin" /> : null}
          Disconnect {mode} Stripe
        </Button>
      ))}
    </div>
  );
}

function PaymentError({
  context,
  view,
  onDisconnectStripe,
}: Pick<PaymentConnectionProps, "context" | "view" | "onDisconnectStripe">) {
  if (!view.error) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>Could not update payments</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{view.error}</span>
        {context === "settings" ? (
          <SettingsDisconnectRecovery
            view={view}
            onDisconnectStripe={onDisconnectStripe}
          />
        ) : (
          <DisconnectRecovery
            view={view}
            onDisconnectStripe={onDisconnectStripe}
          />
        )}
      </AlertDescription>
    </Alert>
  );
}

function StripeModeAction({
  mode,
  connected,
  pending,
  disabled = false,
  emphasize = false,
  onConnect,
  onDisconnect,
}: {
  mode: PaymentConnectionMode;
  connected: boolean;
  pending: boolean;
  disabled?: boolean;
  emphasize?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  if (connected) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-fit shrink-0"
        onClick={onDisconnect}
        disabled={disabled || pending || !onDisconnect}
      >
        {pending ? <Loader2 className="animate-spin" /> : <CreditCard />}
        {pending ? "Waiting for Stripe…" : `Disconnect ${mode}`}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant={emphasize ? "default" : "outline"}
      className="w-fit shrink-0"
      onClick={onConnect}
      disabled={disabled || pending || !onConnect}
    >
      {pending ? <Loader2 className="animate-spin" /> : <CreditCard />}
      {pending ? "Waiting for Stripe…" : `Connect ${mode}`}
    </Button>
  );
}

function SettingsStripeRow({
  mode,
  state,
  pending,
  busy = false,
  emphasize = false,
  onConnect,
  onDisconnect,
}: {
  mode: PaymentConnectionMode;
  state: PaymentConnectionState;
  pending: boolean;
  busy?: boolean;
  emphasize?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-background/70 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-medium">{state.label}</span>
        <Badge variant={state.connected ? "success" : "secondary"}>
          {state.statusLabel}
        </Badge>
      </div>
      <StripeModeAction
        mode={mode}
        connected={state.connected}
        pending={pending}
        disabled={busy && !pending}
        emphasize={emphasize}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
    </div>
  );
}

export function PaymentConnection({
  context,
  view,
  notice = null,
  noticeVariant = "default",
  integrationHref,
  onConnectStripe,
  onDisconnectStripe,
}: PaymentConnectionProps) {
  const [disconnectMode, setDisconnectMode] =
    useState<PaymentConnectionMode | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const requestDisconnect = onDisconnectStripe
    ? (mode: PaymentConnectionMode = view.mode) => setDisconnectMode(mode)
    : undefined;
  const disconnectConfirmation = (
    <ConfirmationDialog
      open={disconnectMode !== null}
      title={`Disconnect ${
        (disconnectMode ?? view.mode) === "live" ? "Live" : "Test"
      } Stripe?`}
      description="RefKit will stop importing payments from this Stripe connection."
      confirmLabel="Disconnect Stripe"
      loading={confirmingDisconnect || view.loading}
      onOpenChange={(open) => {
        if (!open) {
          setDisconnectMode(null);
        }
      }}
      onConfirm={() => {
        if (!disconnectMode || !onDisconnectStripe) {
          return;
        }

        setConfirmingDisconnect(true);
        void Promise.resolve()
          .then(() => onDisconnectStripe(disconnectMode))
          .catch(() => undefined)
          .finally(() => {
            setConfirmingDisconnect(false);
            setDisconnectMode(null);
          });
      }}
    />
  );

  if (context === "setup") {
    return (
      <div className="flex flex-col gap-3">
        {view.revenueSource === "stripe" ? (
          <>
            <ConnectionStatus
              label={view.relevantStripeLabel}
              statusLabel={
                view.relevantStripeConnected ? "Confirmed" : "Waiting"
              }
              connected={view.relevantStripeConnected}
            />
            <Button
              variant={view.relevantStripeConnected ? "outline" : "default"}
              onClick={() => onConnectStripe?.(view.mode)}
              disabled={view.loading || !onConnectStripe}
              className="w-fit"
            >
              {view.loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CreditCard />
              )}
              {view.loading ? "Waiting for Stripe…" : view.primaryActionLabel}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your backend will report payments after integration.
          </p>
        )}

        <PaymentError
          context={context}
          view={view}
          onDisconnectStripe={requestDisconnect}
        />

        {notice ? (
          <Alert variant={noticeVariant}>
            <CreditCard />
            <AlertTitle>Stripe</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {disconnectConfirmation}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {view.revenueSource === "stripe" ? (
        <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
          <p className="text-sm font-medium">Stripe connections</p>
          <div className="flex flex-col gap-2">
            <SettingsStripeRow
              mode="test"
              state={view.test}
              pending={view.loading && view.loadingMode === "test"}
              busy={view.loading}
              onConnect={() => onConnectStripe?.("test")}
              onDisconnect={() => requestDisconnect?.("test")}
            />
            <SettingsStripeRow
              mode="live"
              state={view.live}
              pending={view.loading && view.loadingMode === "live"}
              busy={view.loading}
              emphasize={!view.live.connected}
              onConnect={() => onConnectStripe?.("live")}
              onDisconnect={() => requestDisconnect?.("live")}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
          <p className="text-sm font-medium">Payment reporting</p>
          <div className="flex flex-col gap-2">
            <ConnectionStatus {...view.test} />
            <ConnectionStatus {...view.live} />
          </div>
          {integrationHref ? (
            <Button variant="outline" asChild className="w-fit" size="sm">
              <Link href={integrationHref}>View integration setup</Link>
            </Button>
          ) : null}
        </div>
      )}

      <PaymentError
        context={context}
        view={view}
        onDisconnectStripe={requestDisconnect}
      />
      {disconnectConfirmation}
    </div>
  );
}
