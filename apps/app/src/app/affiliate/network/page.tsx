"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Compass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppIcon } from "@/components/dashboard/app-icon";
import { useMe } from "@/components/dashboard/auth-guard";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CommissionTermsSummary,
  commissionDurationLabel,
  commissionRewardLabel,
} from "@/components/commission-terms-summary";
import { ProgramTermsAcceptance } from "@/components/program-terms-acceptance";
import { apiFetch, type ListResponse } from "@/lib/api-client";
import {
  REFKIT_NETWORK_ACCESSIBLE,
  REFKIT_NETWORK_CLOSED_MESSAGE,
} from "@/lib/closed-beta";
import { formatMoney } from "@/lib/dashboard-types";

type NetworkProgram = {
  app: {
    id: string;
    name: string;
    website_url: string | null;
    logo_url: string;
  };
  program: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    join_page_approval: "active" | "pending";
    minimum_payout_amount: { amount: number; currency: string };
    supported_payout_methods: string[];
  };
  commission_rule: {
    reward_type: "percent" | "fixed";
    percent_value: number | null;
    fixed_amount: number | null;
    fixed_currency: string | null;
    recurring_duration_months: number | null;
  };
  current_terms_version: {
    id: string;
    version_number: number;
  };
  current_agreement_version: {
    id: string;
    version_number: number;
    terms_text: string;
  } | null;
  join_url: string;
};

type JoinProgram = {
  name: string;
  slug: string;
  join_page_approval: "active" | "pending";
  current_agreement_version: {
    id: string;
    version_number: number;
    terms_text: string;
  } | null;
};

function payoutMethodsLabel(methods: string[]) {
  return methods
    .map((method) =>
      method === "bank_transfer" ? "Bank transfer" : "PayPal",
    )
    .join(", ");
}

function NetworkClosedPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="RefKit Network">
        <Badge variant="outline">Beta</Badge>
      </PageHeader>
      <Card className="border-dashed border-border/70">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Compass className="size-8 text-muted-foreground/70" />
          <div className="space-y-1">
            <p className="font-medium">Opening in open beta</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {REFKIT_NETWORK_CLOSED_MESSAGE}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AffiliateNetworkPage() {
  const { me } = useMe();

  if (me && !me.deployment.capabilities.official_network) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Page unavailable" />
        <Card className="border-dashed border-border/70">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            This capability is not available on this RefKit instance.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!REFKIT_NETWORK_ACCESSIBLE) {
    return <NetworkClosedPage />;
  }

  return <AffiliateNetworkPageContent />;
}

function AffiliateNetworkPageContent() {
  const { me, refresh: refreshMe } = useMe();
  const [programs, setPrograms] = useState<NetworkProgram[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<NetworkProgram | null>(null);
  const [joinProgram, setJoinProgram] = useState<JoinProgram | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [joining, setJoining] = useState(false);

  const memberships = useMemo(
    () =>
      new Map(
        me?.program_affiliates.map((entry) => [
          entry.program.id,
          entry.program_affiliate.status,
        ]) ?? [],
      ),
    [me],
  );

  const loadPrograms = useCallback(async (startingAfter?: string) => {
    const query = new URLSearchParams({ limit: "24" });

    if (startingAfter) {
      query.set("starting_after", startingAfter);
    }

    const result = await apiFetch<ListResponse<NetworkProgram>>(
      `/api/v1/network/apps?${query.toString()}`,
    );

    setPrograms((current) =>
      startingAfter ? [...current, ...result.data] : result.data,
    );
    setHasMore(result.has_more);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPrograms()
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Failed to load the network"
        );
      })
      .finally(() => setLoading(false));
  }, [loadPrograms]);

  function openJoin(entry: NetworkProgram) {
    if (!entry.current_agreement_version) {
      toast.error("This App has no agreement yet.");
      return;
    }

    setSelected(entry);
    setAccepted(false);
    setJoinProgram({
      name: entry.program.name,
      slug: entry.program.slug,
      join_page_approval: entry.program.join_page_approval,
      current_agreement_version: entry.current_agreement_version,
    });
  }

  async function joinSelectedProgram() {
    if (!selected || !joinProgram?.current_agreement_version || !accepted) {
      return;
    }

    setJoining(true);

    try {
      const result = await apiFetch<{ status: string }>(
        `/api/v1/affiliate/programs/${selected.program.id}/join`,
        {
          method: "POST",
          body: JSON.stringify({
            app_agreement_version_id: joinProgram.current_agreement_version.id,
            accepted_program_rules: true,
          }),
        },
      );

      await refreshMe();
      toast.success(
        result.status === "pending"
          ? `Your request to join ${selected.program.name} was sent.`
          : `You joined ${selected.program.name}.`,
      );
      setSelected(null);
      setJoinProgram(null);
      setAccepted(false);
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join program");
    }
    finally {
      setJoining(false);
    }
  }

  async function loadMore() {
    const cursor = programs.at(-1)?.app.id;

    if (!cursor) return;

    setLoadingMore(true);

    try {
      await loadPrograms(cursor);
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load more programs"
      );
    }
    finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="RefKit Network" />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <Card className="border-dashed border-border/70">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Compass className="size-8 text-muted-foreground/70" />
            <div>
              <p className="font-medium">No apps in the Network yet</p>
              <p className="text-sm text-muted-foreground">
                Apps will appear here when developers make them visible.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {programs.map((entry) => {
              const membershipStatus = memberships.get(entry.program.id);

              return (
                <Card
                  key={entry.app.id}
                  className="flex flex-col gap-0 border-border/70 py-5"
                >
                  <CardHeader className="px-5 pb-3">
                    <div className="flex items-start gap-3">
                      <AppIcon
                        name={entry.app.name}
                        logoUrl={entry.app.logo_url}
                        className="size-10 text-sm"
                      />
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">
                          {entry.app.name}
                        </CardTitle>
                        <CardDescription className="truncate">
                          {entry.program.name}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-2 px-5 text-sm">
                    <div>
                      <p className="font-medium">
                        {commissionRewardLabel(
                          entry.commission_rule,
                          entry.program.currency
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {commissionDurationLabel(entry.commission_rule)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {entry.program.join_page_approval === "pending"
                        ? "Approval required"
                        : "Open enrollment"}
                      {" · "}
                      Min{" "}
                      {formatMoney(
                        entry.program.minimum_payout_amount.amount,
                        entry.program.minimum_payout_amount.currency,
                      )}
                    </p>
                  </CardContent>
                  <CardFooter className="px-5 pt-4">
                    {membershipStatus === "active" ? (
                      <Button className="w-full" variant="outline" asChild>
                        <Link href={`/affiliate/programs/${entry.program.id}`}>
                          Open program
                        </Link>
                      </Button>
                    ) : membershipStatus ? (
                      <Button className="w-full" variant="outline" disabled>
                        {membershipStatus === "pending"
                          ? "Request pending"
                          : "Already joined"}
                      </Button>
                    ) : (
                      <Button className="w-full" onClick={() => openJoin(entry)}>
                        {entry.program.join_page_approval === "pending"
                          ? "Request to join"
                          : "Join program"}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {hasMore ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="animate-spin" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setJoinProgram(null);
            setAccepted(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.program.name ?? "Join program"}</DialogTitle>
            <DialogDescription>
              Review the commission terms, App agreement, and RefKit rules.
            </DialogDescription>
          </DialogHeader>

          {!joinProgram ? (
            <Skeleton className="h-36 w-full rounded-lg" />
          ) : (
            <div className="space-y-4">
              {selected ? (
                <>
                  <CommissionTermsSummary
                    rule={selected.commission_rule}
                    fallbackCurrency={selected.program.currency}
                  />
                  <div className="rounded-md bg-muted/35 px-3 py-2.5 text-sm text-muted-foreground">
                    <p>
                      Minimum payout:{" "}
                      <span className="font-medium text-foreground">
                        {formatMoney(
                          selected.program.minimum_payout_amount.amount,
                          selected.program.minimum_payout_amount.currency,
                        )}
                      </span>
                    </p>
                    <p className="mt-1">
                      {selected.program.supported_payout_methods.length > 0
                        ? `Paid via ${payoutMethodsLabel(
                            selected.program.supported_payout_methods,
                          )}`
                        : "Payout method not specified"}
                    </p>
                  </div>
                </>
              ) : null}

              <ProgramTermsAcceptance
                id="accept-program-rules"
                termsText={joinProgram.current_agreement_version?.terms_text}
                accepted={accepted}
                onAcceptedChange={setAccepted}
                disabled={joining}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={joinSelectedProgram}
              disabled={!joinProgram || !accepted || joining}
            >
              {joining ? <Loader2 className="animate-spin" /> : null}
              {selected?.program.join_page_approval === "pending"
                ? "Send request"
                : "Join program"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
