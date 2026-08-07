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
import type { SeedPersona, SeedPersonaRole } from "@/db/seed/personas";
import {
  CLOSED_BETA_HEADLINE,
  CLOSED_BETA_REQUEST_ACCESS_URL,
  CLOSED_BETA_SIGNIN_DESCRIPTION,
  CLOSED_BETA_UNKNOWN_EMAIL_MESSAGE,
} from "@/lib/closed-beta";
import { ApiClientError, apiFetch } from "@/lib/api-client";

const roleLabels: Record<SeedPersonaRole, string> = {
  admin: "Admin",
  owner: "Developers",
  affiliate: "Affiliates",
};

const roleOrder: SeedPersonaRole[] = ["admin", "owner", "affiliate"];

type SignInClientProps = {
  devPersonas: SeedPersona[] | null;
  closedBetaEnforced: boolean;
  selfHosted: boolean;
};

export function SignInClient({
  devPersonas,
  closedBetaEnforced,
  selfHosted,
}: SignInClientProps) {
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const redirect = requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
    ? requestedRedirect
    : "/";
  const signUpHref = redirect === "/"
    ? "/sign-up"
    : `/sign-up?redirect=${encodeURIComponent(redirect)}`;
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [closedBetaMessage, setClosedBetaMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setClosedBetaMessage(null);

    const trimmedEmail = email.trim();

    try {
      await apiFetch<{ status: true }>("/api/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({
          email: trimmedEmail,
          callback_url: redirect,
        }),
      });
      setSentTo(trimmedEmail);
    }
    catch (err) {
      if (
        err instanceof ApiClientError
        && (err.code === "closed_beta" || err.code === "registration_closed")
      ) {
        setClosedBetaMessage(err.message || CLOSED_BETA_UNKNOWN_EMAIL_MESSAGE);
      }
      else {
        setError(err instanceof Error ? err.message : "Could not send magic link.");
      }
    }
    finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageLayout maxWidth={devPersonas && !sentTo ? "lg" : "md"}>
      <div className="space-y-4">
        {sentTo ? (
          <AuthCheckEmail
            email={sentTo}
            description={
              closedBetaEnforced || selfHosted
                ? "We sent a sign-in link to your invited email."
                : "If an account exists for this email, we sent a sign-in link."
            }
            onUseDifferentEmail={() => {
              setSentTo(null);
              setError(null);
              setClosedBetaMessage(null);
            }}
            footer={
              closedBetaEnforced ? (
                <p className="text-sm text-muted-foreground">
                  Need access?{" "}
                  <a
                    href={CLOSED_BETA_REQUEST_ACCESS_URL}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Request access
                  </a>
                </p>
              ) : selfHosted ? null : (
                <p className="text-sm text-muted-foreground">
                  New to RefKit?{" "}
                  <Link
                    href={signUpHref}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Create an account
                  </Link>
                </p>
              )
            }
          />
        ) : (
          <Card className="border-border/70">
            <CardHeader className="space-y-1.5">
              {closedBetaEnforced ? (
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CLOSED_BETA_HEADLINE}
                </p>
              ) : null}
              <CardTitle className="text-xl">Sign in to RefKit</CardTitle>
              <CardDescription>
                {closedBetaEnforced
                  ? CLOSED_BETA_SIGNIN_DESCRIPTION
                  : selfHosted
                    ? "Enter your invited email and we will send you a secure sign-in link."
                  : "Enter your email and we will send you a secure sign-in link."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {closedBetaMessage ? (
                <Alert>
                  <AlertTitle>
                    {selfHosted ? "Invitation required" : "Request access"}
                  </AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>{closedBetaMessage}</p>
                    {!selfHosted ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={CLOSED_BETA_REQUEST_ACCESS_URL}>Request access</a>
                      </Button>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Something went wrong</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? "Sending..." : "Send magic link"}
                </Button>
              </form>

              {closedBetaEnforced ? (
                <p className="text-center text-sm text-muted-foreground">
                  Need access?{" "}
                  <a
                    href={CLOSED_BETA_REQUEST_ACCESS_URL}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Request access
                  </a>
                </p>
              ) : selfHosted ? null : (
                <p className="text-center text-sm text-muted-foreground">
                  New to RefKit?{" "}
                  <Link
                    href={signUpHref}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    Create an account
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {devPersonas && !sentTo ? (
          <Card className="border-dashed border-border/70">
            <CardHeader className="space-y-1.5">
              <CardTitle className="text-base">Dev quick sign-in</CardTitle>
              <CardDescription>
                Local dev only. Click a seed user to skip the magic link.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {roleOrder.map((role) => {
                const personas = devPersonas.filter((persona) => persona.role === role);

                if (personas.length === 0) {
                  return null;
                }

                return (
                  <div key={role} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {roleLabels[role]}
                    </p>
                    <div className="space-y-2">
                      {personas.map((persona) => (
                        <a
                          key={persona.id}
                          href={`/api/dev/sign-in?userId=${encodeURIComponent(persona.id)}&redirect=${encodeURIComponent(redirect)}`}
                          className="block rounded-lg border border-border/70 bg-background p-3 transition-colors hover:bg-muted/60"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium text-foreground">{persona.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {persona.description}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {persona.email}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AuthPageLayout>
  );
}
