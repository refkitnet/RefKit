"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { AuthCheckEmail } from "@/components/auth/auth-check-email";
import { AuthPageLayout } from "@/components/auth/auth-page-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { apiFetch } from "@/lib/api-client";

export function SelfHostedSetupClient() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();

    setLoading(true);
    setError(null);

    try {
      await apiFetch<{ status: true }>("/api/self-hosted/setup", {
        method: "POST",
        body: JSON.stringify({
          setup_token: String(formData.get("setup_token") ?? ""),
          name: String(formData.get("name") ?? ""),
          email,
          organization_name: String(formData.get("organization_name") ?? ""),
        }),
      });
      setSentTo(email);
    }
    catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not set up this RefKit instance."
      );
    }
    finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageLayout maxWidth="md">
      {sentTo ? (
        <AuthCheckEmail
          email={sentTo}
          description="We sent a sign-in link for the first administrator."
          onUseDifferentEmail={() => setSentTo(null)}
          footer={
            <Link
              href="/sign-in"
              className="text-sm font-medium text-foreground underline underline-offset-4"
            >
              Go to sign in
            </Link>
          }
        />
      ) : (
        <Card className="border-border/70">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl">Set up RefKit</CardTitle>
            <CardDescription>
              Create the first administrator for this private instance. The setup
              token can be used only once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <Alert variant="destructive" className="mb-5">
                <AlertTitle>Could not complete setup</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="setup-token">One-time setup token</Label>
                <Input
                  id="setup-token"
                  name="setup_token"
                  type="password"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-name">Administrator name</Label>
                <Input id="setup-name" name="name" autoComplete="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-email">Administrator email</Label>
                <Input
                  id="setup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-organization">Organization name</Label>
                <Input
                  id="setup-organization"
                  name="organization_name"
                  autoComplete="organization"
                  required
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Creating administrator..." : "Create administrator"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </AuthPageLayout>
  );
}
