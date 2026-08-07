import { Suspense } from "react";
import { AuthPageLoading } from "@/components/auth/auth-page-layout";
import { getSeedPersonas } from "@/db/seed/personas";
import { isDevSignInEnabled } from "@/services/auth/dev-sign-in-env";
import { isClosedBetaEnforced } from "@/lib/closed-beta.server";
import { isSelfHosted } from "@/lib/deployment";
import { redirect } from "next/navigation";
import { getSelfHostedBootstrapStatus } from "@/services/self-hosted/bootstrap";
import { SignInClient } from "./sign-in-client";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const devPersonas = isDevSignInEnabled() ? getSeedPersonas() : null;
  const closedBetaEnforced = isClosedBetaEnforced();
  const selfHosted = isSelfHosted();

  if (selfHosted) {
    const status = await getSelfHostedBootstrapStatus();

    if (status.setupRequired) {
      redirect("/setup");
    }
  }

  return (
    <Suspense fallback={<AuthPageLoading maxWidth={devPersonas ? "lg" : "md"} />}>
      <SignInClient
        devPersonas={devPersonas}
        closedBetaEnforced={closedBetaEnforced}
        selfHosted={selfHosted}
      />
    </Suspense>
  );
}
