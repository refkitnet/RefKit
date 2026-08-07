"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Link2,
  MoreHorizontal,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { toast } from "sonner";
import {
  ProgramFilter,
  programNameMap,
} from "@/components/dashboard/program-filter";
import { EntityListEmpty } from "@/components/dashboard/entity-list-empty";
import { PageHeader } from "@/components/dashboard/page-header";
import { UserDisplay } from "@/components/dashboard/user-display";
import { useAppProgramScope } from "@/components/dashboard/use-app-program-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { copyTextToClipboard } from "@/components/ui/copy-button";
import { apiFetch, apiFetchAllPages } from "@/lib/api-client";
import { affiliateStatusLabel } from "@/lib/dashboard-display";

function buildDefaultAffiliateLink(
  destinationUrl: string,
  linkCode: string,
  options?: { appId?: string; includeAppHint?: boolean }
) {
  const url = new URL(destinationUrl);
  url.searchParams.set("via", linkCode);

  if (options?.includeAppHint && options.appId) {
    url.searchParams.set("refkit_app", options.appId);
  }

  return url.toString();
}

type Affiliate = {
  id: string;
  program_id: string;
  link_code: string | null;
  status: string;
  email: string | null;
  name: string | null;
  image: string | null;
  is_test: boolean;
  created_at: string;
};

type AffiliateStats = {
  clicks: number;
  referrals: number;
};

type CountRow = {
  id: string;
  program_affiliate_id: string;
};

function countByAffiliate(rows: CountRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(
      row.program_affiliate_id,
      (counts.get(row.program_affiliate_id) ?? 0) + 1
    );
  }

  return counts;
}

async function onCopyEmail(email: string) {
  try {
    await copyTextToClipboard(email);
    toast.success("Email copied.");
  }
  catch {
    toast.info(`Email: ${email}`);
  }
}

type AffiliateActionsMenuProps = {
  affiliate: Affiliate;
  canCopyLink: boolean;
  canManage: boolean;
  disabled?: boolean;
  onCopyLink: () => void;
  onApprove: () => void;
  onToggle: () => void;
};

function AffiliateActionsMenu({
  affiliate,
  canCopyLink,
  canManage,
  disabled = false,
  onCopyLink,
  onApprove,
  onToggle,
}: AffiliateActionsMenuProps) {
  const canApprove = canManage && affiliate.status === "pending";
  const canToggle =
    canManage
    && (affiliate.status === "active" || affiliate.status === "disabled");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
        >
          <MoreHorizontal />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Affiliate</DropdownMenuLabel>
          {canCopyLink ? (
            <DropdownMenuItem onClick={onCopyLink}>
              <Link2 />
              Copy affiliate link
            </DropdownMenuItem>
          ) : null}
          {canApprove ? (
            <DropdownMenuItem onClick={onApprove}>
              <Check />
              Approve
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        {canToggle ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant={affiliate.status === "active" ? "destructive" : "default"}
              onClick={onToggle}
            >
              {affiliate.status === "active" ? (
                <>
                  <UserRoundX />
                  Disable
                </>
              ) : (
                <>
                  <UserRoundCheck />
                  Enable
                </>
              )}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AffiliatesPageContent() {
  const {
    appId,
    testWebsiteUrl,
    meLoading,
    programs,
    defaultProgramId,
    loadingPrograms,
    programFilter,
    setProgramFilter,
    scopeQuery,
  } = useAppProgramScope();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [statsByAffiliate, setStatsByAffiliate] = useState(
    new Map<string, AffiliateStats>()
  );
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteProgramSelection, setInviteProgramSelection] = useState("");
  const inviteProgramId = programFilter
    ? programFilter
    : (inviteProgramSelection || defaultProgramId || programs[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const refreshGeneration = useRef(0);
  const names = programNameMap(programs);
  const programById = useMemo(
    () => new Map(programs.map((program) => [program.id, program])),
    [programs],
  );

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;

    if (!scopeQuery) {
      setAffiliates([]);
      setStatsByAffiliate(new Map());
      return;
    }

    setAffiliates([]);
    setStatsByAffiliate(new Map());
    try {
      const [liveResult, testResult] = await Promise.all([
        apiFetchAllPages<Affiliate>(
          `/api/v1/program-affiliates?${scopeQuery}&environment=live&limit=100`,
        ),
        apiFetchAllPages<Affiliate>(
          `/api/v1/program-affiliates?${scopeQuery}&environment=test&limit=100`,
        ),
      ]);
      const nextAffiliates = [...liveResult.data, ...testResult.data].sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
      const programIds = Array.from(
        new Set(nextAffiliates.map((affiliate) => affiliate.program_id))
      );
      const activityResults = await Promise.all(
        programIds.flatMap((programId) => [
          apiFetchAllPages<CountRow>(
            `/api/v1/clicks?program_id=${programId}&environment=live&limit=100`
          ),
          apiFetchAllPages<CountRow>(
            `/api/v1/clicks?program_id=${programId}&environment=test&limit=100`
          ),
          apiFetchAllPages<CountRow>(
            `/api/v1/referrals?program_id=${programId}&environment=live&limit=100`
          ),
          apiFetchAllPages<CountRow>(
            `/api/v1/referrals?program_id=${programId}&environment=test&limit=100`
          ),
        ])
      );
      const clickCounts = countByAffiliate(
        activityResults
          .filter((_, index) => index % 4 < 2)
          .flatMap((result) => result.data)
      );
      const referralCounts = countByAffiliate(
        activityResults
          .filter((_, index) => index % 4 >= 2)
          .flatMap((result) => result.data)
      );
      const nextStats = new Map<string, AffiliateStats>();

      for (const affiliate of nextAffiliates) {
        nextStats.set(affiliate.id, {
          clicks: clickCounts.get(affiliate.id) ?? 0,
          referrals: referralCounts.get(affiliate.id) ?? 0,
        });
      }

      if (generation === refreshGeneration.current) {
        setAffiliates(nextAffiliates);
        setStatsByAffiliate(nextStats);
      }
    }
    catch (err) {
      if (generation === refreshGeneration.current) {
        throw err;
      }
    }
  }, [scopeQuery]);

  useEffect(() => {
    // Initial data fetch on mount; state updates happen after the awaited
    // network response, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to load affiliates"
      );
    });

    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]);

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      await apiFetch("/api/v1/program-affiliates", {
        method: "POST",
        body: JSON.stringify({
          program_id: inviteProgramId,
          email,
          name: name || undefined,
        }),
      });
      setEmail("");
      setName("");
      setInviteOpen(false);
      await refresh();
      toast.success("Affiliate invited.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    }

    setLoading(false);
  }

  async function onApprove(affiliateId: string) {
    setLoading(true);

    try {
      await apiFetch(`/api/v1/program-affiliates/${affiliateId}/approve`, {
        method: "POST",
      });
      await refresh();
      toast.success("Affiliate approved.");
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed");
    }

    setLoading(false);
  }

  async function onToggle(affiliateId: string, status: string) {
    setLoading(true);
    const action = status === "active" ? "disable" : "enable";

    try {
      await apiFetch(`/api/v1/program-affiliates/${affiliateId}/${action}`, {
        method: "POST",
      });
      await refresh();
      toast.success(
        status === "active" ? "Affiliate disabled." : "Affiliate enabled."
      );
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }

    setLoading(false);
  }

  async function onCopyAffiliateLink(affiliate: Affiliate) {
    const program = programById.get(affiliate.program_id);
    const destinationUrl = affiliate.is_test
      ? testWebsiteUrl
      : program?.destination_url;

    if (!destinationUrl || !affiliate.link_code) {
      toast.error("Affiliate link is not available yet.");
      return;
    }

    const url = buildDefaultAffiliateLink(destinationUrl, affiliate.link_code, {
      appId,
      includeAppHint: affiliate.is_test,
    });

    try {
      await copyTextToClipboard(url);
      toast.success("Affiliate link copied.");
    }
    catch {
      toast.info(`Affiliate link: ${url}`);
    }
  }

  if (meLoading || loadingPrograms) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Affiliates">
        <ProgramFilter
          programs={programs}
          value={programFilter}
          onChange={setProgramFilter}
        />
        <Button
          onClick={() => setInviteOpen(true)}
          disabled={programs.length === 0}
        >
          <UserPlus />
          Invite affiliate
        </Button>
      </PageHeader>

      <Card className="border-border/70 py-0">
        <CardContent className="p-0">
          {affiliates.length === 0 ? (
            <EntityListEmpty
              icon={UserPlus}
              title="No affiliates yet"
              description="Invite an affiliate to create their link."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Affiliate</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Referrals</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {affiliates.map((affiliate) => {
                  const canCopyLink = Boolean(
                    affiliate.link_code
                    && (affiliate.is_test
                      ? testWebsiteUrl
                      : programById.get(affiliate.program_id)?.destination_url),
                  );
                  const stats = statsByAffiliate.get(affiliate.id);

                  return (
                    <TableRow key={affiliate.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserDisplay
                            id={affiliate.id}
                            name={affiliate.name}
                            email={affiliate.email}
                            image={affiliate.image}
                            link_code={affiliate.link_code}
                          />
                          {affiliate.is_test ? (
                            <Badge variant="outline">Test</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {affiliate.email ? (
                          <button
                            type="button"
                            className="max-w-[10rem] truncate text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                            title={affiliate.email}
                            onClick={() => onCopyEmail(affiliate.email!)}
                          >
                            {affiliate.email}
                          </button>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {names.get(affiliate.program_id) ?? affiliate.program_id}
                      </TableCell>
                      <TableCell>{stats?.clicks ?? 0}</TableCell>
                      <TableCell>{stats?.referrals ?? 0}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {affiliateStatusLabel(affiliate.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {canCopyLink || !affiliate.is_test ? (
                          <AffiliateActionsMenu
                            affiliate={affiliate}
                            canCopyLink={canCopyLink}
                            canManage={!affiliate.is_test}
                            disabled={loading}
                            onCopyLink={() => onCopyAffiliateLink(affiliate)}
                            onApprove={() => onApprove(affiliate.id)}
                            onToggle={() =>
                              onToggle(affiliate.id, affiliate.status)
                            }
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite affiliate</DialogTitle>
            <DialogDescription>
              They get an affiliate link for{" "}
              {programFilter
                ? (names.get(programFilter) ?? "the selected program")
                : programs.length === 1
                  ? programs[0]?.name
                  : "the program you choose"}
              .
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={onInvite}>
            <FieldGroup>
              {!programFilter && programs.length > 1 ? (
                <Field>
                  <FieldLabel>Program</FieldLabel>
                  <Select
                    value={inviteProgramId}
                    onValueChange={setInviteProgramSelection}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select program" />
                    </SelectTrigger>
                    <SelectContent>
                      {programs.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-name">Name</FieldLabel>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading || !inviteProgramId}>
                Invite
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AffiliatesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <AffiliatesPageContent />
    </Suspense>
  );
}
