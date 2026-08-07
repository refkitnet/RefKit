"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CreditCard } from "lucide-react";
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
import {
  buildPathWithoutStripeConnectRedirect,
  readStripeConnectRedirect,
} from "@/lib/stripe-connect-redirect";

export default function SetupPageClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const stripeParam = searchParams.get("stripe");
  const legacyReturn = searchParams.get("return") === "true";
  const legacyRefresh = searchParams.get("refresh") === "true";
  const stripeRedirect = readStripeConnectRedirect(searchParams);

  useEffect(() => {
    if (!stripeRedirect) {
      return;
    }

    const nextUrl = buildPathWithoutStripeConnectRedirect(pathname, searchParams);
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }

    router.replace(nextUrl);
  }, [stripeRedirect, pathname, router, searchParams]);

  const isRefresh = stripeParam === "refresh" || legacyRefresh;
  const isReturn = stripeParam === "return" || legacyReturn;
  const isError = stripeRedirect?.kind === "error";

  let title = "Stripe setup";
  let message =
    "Return to your dashboard to continue setup and check connection status.";

  if (isError) {
    title = "Stripe connection failed";
    message = stripeRedirect.message;
  }
  else if (isRefresh) {
    title = "Link expired";
    message =
      "Your Stripe connection link expired. Go back to the dashboard and connect Stripe again.";
  }
  else if (isReturn) {
    title = "Stripe installation submitted";
    message =
      "Return to your dashboard to confirm the Stripe App connection.";
  }

  return (
    <AuthPageLayout maxWidth="lg">
      {isError ? (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <Button asChild className="w-fit">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader className="flex flex-col gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CreditCard className="size-5" />
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </AuthPageLayout>
  );
}
