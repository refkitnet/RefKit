"use client";

import { FormEvent, useState, type ReactNode } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/dashboard/page-header";
import { UserDisplay } from "@/components/dashboard/user-display";
import { useAdminPagedList } from "@/components/dashboard/use-admin-paged-list";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type AccountMode = "owner" | "affiliate";

type AdminApp = {
  id: string;
  organization_id: string;
  organization_name: string | null;
  name: string;
  status: string;
  integration_issue: string | null;
  created_at: string;
};

type AdminOwner = {
  id: string;
  organization_id: string;
  organization_name: string | null;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  user_image: string | null;
  role: string;
  created_at: string;
};

type AdminAffiliate = {
  id: string;
  program_id: string;
  user_id: string;
  link_code: string;
  status: string;
  email: string | null;
  name: string | null;
  image: string | null;
  created_at: string;
};

const accountModes = [
  {
    value: "owner" as const,
    label: "Developer",
    description: "Creates programs and manages affiliates.",
  },
  {
    value: "affiliate" as const,
    label: "Affiliate",
    description: "Joins programs and earns commissions.",
  },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function AdminTableSection<T extends { id: string }>({
  rows,
  loading,
  hasMore,
  onLoadMore,
  emptyLabel,
  headers,
  renderRow,
}: {
  rows: T[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  emptyLabel: string;
  headers: string[];
  renderRow: (row: T) => ReactNode;
}) {
  if (loading && rows.length === 0) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{rows.map(renderRow)}</TableBody>
        </Table>
      </div>

      {hasMore ? (
        <Button variant="outline" disabled={loading} onClick={onLoadMore}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}

export default function AdminAccountsPage() {
  const apps = useAdminPagedList<AdminApp>("/api/v1/admin/apps");
  const owners = useAdminPagedList<AdminOwner>(
    "/api/v1/admin/organization-members",
    { role: "owner" }
  );
  const affiliates = useAdminPagedList<AdminAffiliate>(
    "/api/v1/admin/affiliates"
  );
  const [primaryMode, setPrimaryMode] = useState<AccountMode>("owner");
  const [inviting, setInviting] = useState(false);
  const [formKey, setFormKey] = useState(0);

  async function onInviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextName = String(formData.get("name") ?? "").trim();
    const nextEmail = String(formData.get("email") ?? "").trim();
    const nextMode = formData.get("primary_mode") === "affiliate"
      ? "affiliate"
      : "owner";

    setPrimaryMode(nextMode);
    setInviting(true);

    try {
      await apiFetch("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: nextName,
          email: nextEmail,
          primary_mode: nextMode,
        }),
      });
      toast.success("Invite email sent.");
      setFormKey((value) => value + 1);
    }
    catch (err) {
      if (err instanceof ApiClientError && err.code === "account_exists") {
        toast.error("This email already has a verified account. Ask them to sign in instead.");
      }
      else {
        toast.error(err instanceof Error ? err.message : "Could not invite user.");
      }
    }
    finally {
      setInviting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Accounts" />

      <Card className="border-border/70">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-lg">Invite user</CardTitle>
          <CardDescription>
            Create an account and send its signup magic link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            key={formKey}
            className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
            onSubmit={onInviteUser}
          >
            <div className="space-y-2">
              <Label htmlFor="beta-user-name">Name</Label>
              <Input
                id="beta-user-name"
                name="name"
                autoComplete="name"
                placeholder="Alex Morgan"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="beta-user-email">Email</Label>
              <Input
                id="beta-user-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
            </div>

            <fieldset className="space-y-2 lg:col-span-3">
              <legend className="text-sm font-medium">Start as</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {accountModes.map((mode) => {
                  const selected = primaryMode === mode.value;

                  return (
                    <Label
                      key={mode.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 transition-colors",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                          : "border-border/70 hover:bg-muted/40"
                      )}
                    >
                      <input
                        type="radio"
                        name="primary_mode"
                        aria-label={mode.label}
                        value={mode.value}
                        checked={selected}
                        onChange={() => setPrimaryMode(mode.value)}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span className="space-y-1">
                        <span className="block font-medium text-foreground">
                          {mode.label}
                        </span>
                        <span className="block text-sm font-normal leading-snug text-muted-foreground">
                          {mode.description}
                        </span>
                      </span>
                    </Label>
                  );
                })}
              </div>
            </fieldset>

            <div className="lg:col-span-3">
              <Button type="submit" disabled={inviting}>
                {inviting ? "Sending invite..." : "Send invite"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Tabs defaultValue="apps">
        <TabsList>
          <TabsTrigger value="apps">Apps</TabsTrigger>
          <TabsTrigger value="owners">Developers</TabsTrigger>
          <TabsTrigger value="affiliates">Affiliates</TabsTrigger>
        </TabsList>

        <TabsContent value="apps" className="mt-4">
          <AdminTableSection
            rows={apps.rows}
            loading={apps.loading}
            hasMore={apps.hasMore}
            onLoadMore={() => apps.load(apps.rows[apps.rows.length - 1]?.id)}
            emptyLabel="No apps yet."
            headers={["App", "Organization", "Status", "Created"]}
            renderRow={(app) => (
              <TableRow key={app.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{app.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {app.id}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p>{app.organization_name ?? "-"}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {app.organization_id}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {app.status}
                </TableCell>
                <TableCell>{formatDate(app.created_at)}</TableCell>
              </TableRow>
            )}
          />
        </TabsContent>

        <TabsContent value="owners" className="mt-4">
          <AdminTableSection
            rows={owners.rows}
            loading={owners.loading}
            hasMore={owners.hasMore}
            onLoadMore={() =>
              owners.load(owners.rows[owners.rows.length - 1]?.id)
            }
            emptyLabel="No developers yet."
            headers={["Developer", "Organization", "Role", "Created"]}
            renderRow={(owner) => (
              <TableRow key={owner.id}>
                <TableCell>
                  <div>
                    <UserDisplay
                      id={owner.user_id}
                      name={owner.user_name}
                      email={owner.user_email}
                      image={owner.user_image}
                    />
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {owner.user_id}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p>{owner.organization_name ?? "-"}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {owner.organization_id}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {owner.role}
                </TableCell>
                <TableCell>{formatDate(owner.created_at)}</TableCell>
              </TableRow>
            )}
          />
        </TabsContent>

        <TabsContent value="affiliates" className="mt-4">
          <AdminTableSection
            rows={affiliates.rows}
            loading={affiliates.loading}
            hasMore={affiliates.hasMore}
            onLoadMore={() =>
              affiliates.load(affiliates.rows[affiliates.rows.length - 1]?.id)
            }
            emptyLabel="No affiliates yet."
            headers={["Affiliate", "Program", "Code", "Status", "Created"]}
            renderRow={(affiliate) => (
              <TableRow key={affiliate.id}>
                <TableCell>
                  <div>
                    <UserDisplay
                      id={affiliate.id}
                      name={affiliate.name}
                      email={affiliate.email}
                      image={affiliate.image}
                      link_code={affiliate.link_code}
                    />
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {affiliate.id}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {affiliate.program_id}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {affiliate.link_code}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {affiliate.status}
                </TableCell>
                <TableCell>{formatDate(affiliate.created_at)}</TableCell>
              </TableRow>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
