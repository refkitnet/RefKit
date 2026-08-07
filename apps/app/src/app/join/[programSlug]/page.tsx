"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AuthCheckEmail } from "@/components/auth/auth-check-email";
import { AuthPageLayout } from "@/components/auth/auth-page-layout";
import { AppBrandMark } from "@/components/brand/app-brand-mark";
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
import { Skeleton } from "@/components/ui/skeleton";
import { CommissionTermsSummary } from "@/components/commission-terms-summary";
import { ProgramTermsAcceptance } from "@/components/program-terms-acceptance";
import { ApiClientError, apiFetch } from "@/lib/api-client";

type JoinProgramInfo = {
  name: string;
  slug: string;
  app: {
    name: string;
    logo_url: string | null;
  };
  join_page_enabled: boolean;
  join_page_approval: string;
  current_terms_version: {
    reward_type: "percent" | "fixed";
    percent_value: number | null;
    fixed_amount: number | null;
    fixed_currency: string | null;
    recurring_duration_months: number | null;
  } | null;
  current_agreement_version: {
    id: string;
    version_number: number;
    terms_text: string;
  } | null;
};

function joinPageHeader(program: JoinProgramInfo | null) {
  if (!program) {
    return <Skeleton className="h-8 w-40" />;
  }

  return (
    <AppBrandMark
      name={program.app.name}
      logoUrl={program.app.logo_url}
    />
  );
}

export default function JoinPage() {
  const params = useParams<{ programSlug: string }>();
  const programSlug = params.programSlug;
  const [program, setProgram] = useState<JoinProgramInfo | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [acceptedRules, setAcceptedRules] = useState(false);

  useEffect(() => {
    apiFetch<JoinProgramInfo>(`/api/v1/join/${programSlug}`)
      .then((result) => {
        setProgram(result);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load program");
      })
      .finally(() => {
        setPageLoading(false);
      });
  }, [programSlug]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!acceptedRules) {
      setError("You must accept the App agreement and RefKit rules to continue.");
      return;
    }

    if (!program?.current_agreement_version) {
      setError("This App agreement is not available. Please try again later.");
      return;
    }

    setLoading(true);
    setError(null);

    const trimmedEmail = email.trim();

    try {
      await apiFetch<{ message: string; status: string }>(
        `/api/v1/join/${programSlug}`,
        {
          method: "POST",
          body: JSON.stringify({
            email: trimmedEmail,
            name: name || undefined,
            app_agreement_version_id: program.current_agreement_version.id,
            accepted_program_rules: true,
          }),
        }
      );
      setSentTo(trimmedEmail);
    }
    catch (err) {
      if (err instanceof ApiClientError && err.code === "agreement_version_outdated") {
        try {
          const refreshedProgram = await apiFetch<JoinProgramInfo>(
            `/api/v1/join/${programSlug}`
          );
          setProgram(refreshedProgram);
          setAcceptedRules(false);
          setError("App agreement changed. Review and accept the current terms.");
        }
        catch {
          setError(err.message);
        }
      }
      else {
        setError(err instanceof Error ? err.message : "Signup failed");
      }
    }

    setLoading(false);
  }

  if (pageLoading) {
    return (
      <AuthPageLayout showPoweredBy header={joinPageHeader(program)}>
        <Card className="border-border/70">
          <CardHeader className="space-y-1.5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </AuthPageLayout>
    );
  }

  if (!program) {
    return (
      <AuthPageLayout showPoweredBy header={joinPageHeader(program)}>
        <Card className="border-border/70">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl">Program unavailable</CardTitle>
            <CardDescription>
              This join page is not available right now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>
      </AuthPageLayout>
    );
  }

  if (sentTo) {
    return (
      <AuthPageLayout showPoweredBy header={joinPageHeader(program)}>
        <AuthCheckEmail
          email={sentTo}
          description={`We sent a confirmation link to finish joining ${program.name}.`}
          onUseDifferentEmail={() => {
            setSentTo(null);
            setError(null);
          }}
          footer={
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/sign-in"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Sign in
              </Link>
            </p>
          }
        />
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout showPoweredBy header={joinPageHeader(program)}>
      <Card className="border-border/70">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-xl">Join {program.name}</CardTitle>
          <CardDescription>
            Sign up to promote this program and earn commissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not complete signup</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {program.current_terms_version ? (
            <CommissionTermsSummary
              rule={program.current_terms_version}
              className="border-border/70"
            />
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
            <ProgramTermsAcceptance
              termsText={program.current_agreement_version?.terms_text}
              accepted={acceptedRules}
              onAcceptedChange={setAcceptedRules}
              disabled={loading}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={
                loading || !acceptedRules || !program.current_agreement_version
              }
            >
              {loading ? "Submitting..." : "Sign up"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/sign-in"
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
