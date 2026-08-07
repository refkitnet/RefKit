"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { authClient } from "@/lib/auth-client";

function formatUserCode(value: string) {
  return value.trim().replace(/-/g, "").toUpperCase();
}

export function DeviceClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("user_code") ?? "";
  const [userCode, setUserCode] = useState(initialCode);
  const [step, setStep] = useState<"enter" | "approve">("enter");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    authClient.getSession().then((result) => {
      setHasSession(Boolean(result.data?.user));
      setSessionLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!initialCode || sessionLoading || !hasSession) {
      return;
    }

    const formattedCode = formatUserCode(initialCode);

    authClient.device({ query: { user_code: formattedCode } }).then((response) => {
      if (response.data) {
        setUserCode(formattedCode);
        setStep("approve");
      }
    });
  }, [initialCode, sessionLoading, hasSession]);

  async function ensureSignedIn(formattedCode: string) {
    if (hasSession) {
      return true;
    }

    const verificationPath = `/device?user_code=${encodeURIComponent(formattedCode)}`;
    router.replace(`/sign-in?redirect=${encodeURIComponent(verificationPath)}`);
    return false;
  }

  async function onSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formattedCode = formatUserCode(userCode);

    if (!formattedCode) {
      setError("Enter the code shown in your terminal.");
      setLoading(false);
      return;
    }

    const signedIn = await ensureSignedIn(formattedCode);

    if (!signedIn) {
      setLoading(false);
      return;
    }

    const response = await authClient.device({
      query: { user_code: formattedCode },
    });

    if (response.error || !response.data) {
      setError("Invalid or expired code. Request a new code from the CLI.");
      setLoading(false);
      return;
    }

    setUserCode(formattedCode);
    setStep("approve");
    setLoading(false);
  }

  async function onApprove() {
    setError(null);
    setLoading(true);

    const result = await authClient.device.approve({
      userCode: formatUserCode(userCode),
    });

    if (result.error) {
      setError(result.error.error_description ?? "Could not approve this device.");
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
  }

  async function onDeny() {
    setError(null);
    setLoading(true);

    const result = await authClient.device.deny({
      userCode: formatUserCode(userCode),
    });

    if (result.error) {
      setError(result.error.error_description ?? "Could not deny this device.");
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
  }

  if (sessionLoading) {
    return (
      <AuthPageLayout>
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
        </div>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout>
      <Card>
        <CardHeader>
          <CardTitle>
            {step === "enter" ? "Authorize CLI device" : "Approve CLI access"}
          </CardTitle>
          <CardDescription>
            {step === "enter"
              ? "Enter the code shown in your terminal to continue."
              : "A CLI device is requesting access to your RefKit account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "enter" ? (
            <form className="space-y-4" onSubmit={onSubmitCode}>
              <div className="space-y-2">
                <Label htmlFor="user_code">Device code</Label>
                <Input
                  id="user_code"
                  value={userCode}
                  onChange={(event) => setUserCode(event.target.value)}
                  placeholder="ABCD-1234"
                  autoComplete="off"
                  maxLength={12}
                  required
                />
              </div>

              <p className="text-sm text-muted-foreground">
                After running{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  refkitnet auth login
                </code>
                , enter the code from your terminal.
              </p>

              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Checking..." : "Continue"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted px-3 py-2 text-center font-mono text-lg font-semibold tracking-widest text-foreground">
                {formatUserCode(userCode)}
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={onApprove}
                  disabled={loading}
                >
                  {loading ? "Approving..." : "Approve"}
                </Button>
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={onDeny}
                  disabled={loading}
                >
                  Deny
                </Button>
              </div>
            </div>
          )}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not continue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </AuthPageLayout>
  );
}
