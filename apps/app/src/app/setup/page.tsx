import { Suspense } from "react";
import { AuthPageLoading } from "@/components/auth/auth-page-layout";
import SetupPageClient from "./setup-page-client";
import { redirect } from "next/navigation";
import { isSelfHosted } from "@/lib/deployment";
import { getSelfHostedBootstrapStatus } from "@/services/self-hosted/bootstrap";
import { SelfHostedSetupClient } from "./self-hosted-setup-client";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (isSelfHosted()) {
    const status = await getSelfHostedBootstrapStatus();

    if (!status.setupRequired) {
      redirect("/sign-in");
    }

    return <SelfHostedSetupClient />;
  }

  return (
    <Suspense fallback={<AuthPageLoading maxWidth="lg" />}>
      <SetupPageClient />
    </Suspense>
  );
}
