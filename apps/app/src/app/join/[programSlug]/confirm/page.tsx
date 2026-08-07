"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { AuthPageLayout } from "@/components/auth/auth-page-layout";
import { AppBrandMark } from "@/components/brand/app-brand-mark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, apiFetch } from "@/lib/api-client";

type ConfirmResult = {
  status: string;
  message: string;
};

type JoinProgramInfo = {
  app: {
    name: string;
    logo_url: string | null;
  };
};

type ConfirmState =
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; needsSignIn: boolean };

export default function JoinConfirmPage() {
  const [state, setState] = useState<ConfirmState>({ kind: "loading" });
  const [program, setProgram] = useState<JoinProgramInfo | null>(null);

  useEffect(() => {
    const parts = window.location.pathname.split("/");
    const programSlug = parts[2] ?? "";

    if (!programSlug) {
      return;
    }

    let cancelled = false;

    apiFetch<JoinProgramInfo>(`/api/v1/join/${programSlug}`)
      .then((result) => {
        if (!cancelled) {
          setProgram(result);
        }
      })
      .catch(() => {
        // Branding is optional if the program cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function confirm() {
      const parts = window.location.pathname.split("/");
      const programSlug = parts[2] ?? "";
      const token = new URLSearchParams(window.location.search).get("token");

      if (!programSlug || !token) {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              "This confirmation link is incomplete. Start the signup again.",
            needsSignIn: false,
          });
        }
        return;
      }

      try {
        const result = await apiFetch<ConfirmResult>(
          `/api/v1/join/${programSlug}/confirm`,
          {
            method: "POST",
            body: JSON.stringify({ token }),
          }
        );

        if (!cancelled) {
          setState({ kind: "success", message: result.message });
        }
      }
      catch (err) {
        if (cancelled) {
          return;
        }

        const needsSignIn =
          err instanceof ApiClientError && err.status === 401;
        setState({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Could not confirm your signup.",
          needsSignIn,
        });
      }
    }

    confirm();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthPageLayout
      showPoweredBy
      header={
        program ? (
          <AppBrandMark
            name={program.app.name}
            logoUrl={program.app.logo_url}
          />
        ) : (
          <Skeleton className="h-8 w-40" />
        )
      }
    >
      {state.kind === "loading" ? (
        <Card className="border-border/70">
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl">Confirming your signup</CardTitle>
            <CardDescription>
              Hang tight while we finish joining you to this program.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ) : null}

      {state.kind === "success" ? (
        <Card className="border-border/70">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CheckCircle2 className="size-6" aria-hidden />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                You are all set
              </h1>
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </div>
            <Button asChild>
              <Link href="/affiliate">Go to affiliate dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {state.kind === "error" ? (
        <Card className="border-border/70">
          <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <CircleAlert className="size-6" aria-hidden />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Could not confirm signup
              </h1>
              <p className="text-sm text-muted-foreground">
                {state.needsSignIn
                  ? "Open the confirmation link from the email on this device and browser, then try again."
                  : state.message}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/sign-in">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </AuthPageLayout>
  );
}
