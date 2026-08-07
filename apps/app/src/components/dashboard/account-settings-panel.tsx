"use client";

import { FormEvent, useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { UserPhotoUploader } from "@/components/dashboard/user-photo-uploader";
import { useMe } from "@/components/dashboard/auth-guard";
import { apiFetch } from "@/lib/api-client";
import type { MeProfile } from "@/lib/dashboard-types";

export function AccountSettingsPanel() {
  const { me, refresh } = useMe();

  if (!me) {
    return null;
  }

  return <AccountSettingsPanelForm me={me} refresh={refresh} />;
}

function AccountSettingsPanelForm({
  me,
  refresh,
}: {
  me: MeProfile;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState(me.name ?? "");
  const [loading, setLoading] = useState(false);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      await apiFetch<MeProfile>("/api/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await refresh();
      toast.success("Account updated.");
    }
    catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update account"
      );
    }

    setLoading(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader title="Account settings" />

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-muted-foreground/70" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5">
          <div className="flex flex-col gap-5">
            <UserPhotoUploader
              me={me}
              onUpdated={refresh}
              onMessage={(message) => toast.success(message)}
              onError={(message) => toast.error(message)}
            />
            <form className="flex flex-col gap-4" onSubmit={onSave}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="account-name">Name</FieldLabel>
                  <Input
                    id="account-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="account-email">Email</FieldLabel>
                  <Input
                    id="account-email"
                    value={me.email ?? ""}
                    readOnly
                    disabled
                  />
                  <FieldDescription>
                    Email cannot be changed here.
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <div>
                <Button type="submit" variant="outline" disabled={loading}>
                  Save changes
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-muted-foreground/70" />
            Organizations
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-5">
          {me.organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You are not part of any organization.
            </p>
          ) : (
            me.organizations.map((organization) => (
              <div
                key={organization.id}
                className="flex items-center justify-between gap-3 rounded-md bg-muted/35 px-3 py-2.5"
              >
                <p className="text-sm font-medium">{organization.name}</p>
                <span className="text-xs text-muted-foreground">
                  {organization.role}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
