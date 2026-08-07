"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { ApiClientError, apiFetch } from "@/lib/api-client";
import {
  CLOSED_BETA_DESCRIPTION,
  CLOSED_BETA_HEADLINE,
  CLOSED_BETA_REQUEST_ACCESS_URL,
} from "@/lib/closed-beta";
import { cn } from "@/lib/utils";

type AccountMode = "owner" | "affiliate";

const accountModes = [
  {
    value: "owner" as const,
    label: "Developer",
    description: "Create and manage affiliate programs.",
  },
  {
    value: "affiliate" as const,
    label: "Affiliate",
    description: "Join programs and earn commissions.",
  },
];

type SignUpClientProps = {
  closedBetaEnforced: boolean;
};

export function SignUpClient({ closedBetaEnforced }: SignUpClientProps) {
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const redirect = requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
    ? requestedRedirect
    : "/";
  const signInHref = redirect === "/"
    ? "/sign-in"
    : `/sign-in?redirect=${encodeURIComponent(redirect)}`;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [primaryMode, setPrimaryMode] = useState<AccountMode>("owner");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const trimmedEmail = email.trim();

    try {
      await apiFetch<{ status: true }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email: trimmedEmail,
          primary_mode: primaryMode,
          callback_url: redirect,
        }),
      });
      setSentTo(trimmedEmail);
    }
    catch (err) {
      if (err instanceof ApiClientError && err.code === "account_exists") {
        setError("An account with this email already exists. Sign in instead.");
      }
      else {
        setError(err instanceof Error ? err.message : "Could not create your account.");
      }
    }
    finally {
      setLoading(false);
    }
  }

  if (closedBetaEnforced) {
    return (
      <AuthPageLayout maxWidth="md">
        <Card className="border-border/70">
          <CardHeader className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {CLOSED_BETA_HEADLINE}
            </p>
            <CardTitle className="text-xl">Request access to RefKit</CardTitle>
            <CardDescription>{CLOSED_BETA_DESCRIPTION}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Button asChild className="w-full">
              <a href={CLOSED_BETA_REQUEST_ACCESS_URL}>Request access</a>
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already invited?{" "}
              <Link
                href={signInHref}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout maxWidth={sentTo ? "md" : "lg"}>
      {sentTo ? (
        <AuthCheckEmail
          email={sentTo}
          description="We sent a link to finish creating your account."
          onUseDifferentEmail={() => {
            setSentTo(null);
            setError(null);
          }}
          footer={
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={signInHref}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          }
        />
      ) : (
        <Card className="border-border/70">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl">Create your RefKit account</CardTitle>
            <CardDescription>
              Choose how you want to start. You can use both sides later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not create account</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">I want to start as</legend>
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

              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={signInHref}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </AuthPageLayout>
  );
}
