import { Suspense } from "react";
import { AuthPageLoading } from "@/components/auth/auth-page-layout";
import { isClosedBetaEnforced } from "@/lib/closed-beta.server";
import { isSelfHosted } from "@/lib/deployment";
import { redirect } from "next/navigation";
import { getSelfHostedBootstrapStatus } from "@/services/self-hosted/bootstrap";
import { SignUpClient } from "./sign-up-client";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (isSelfHosted()) {
    const status = await getSelfHostedBootstrapStatus();
    redirect(status.setupRequired ? "/setup" : "/sign-in");
  }

  const closedBetaEnforced = isClosedBetaEnforced();

  return (
    <Suspense fallback={<AuthPageLoading maxWidth={closedBetaEnforced ? "md" : "lg"} />}>
      <SignUpClient closedBetaEnforced={closedBetaEnforced} />
    </Suspense>
  );
}
