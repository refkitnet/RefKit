"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AlertVariant } from "@/components/ui/alert";
import {
  buildPathWithoutStripeConnectRedirect,
  readStripeConnectRedirect,
  STRIPE_CONNECTED_MESSAGE,
} from "@/lib/stripe-connect-redirect";

type StripeConnectRedirectHandlerProps = {
  onConnected?: () => void | Promise<void>;
  onNotice?: (input: {
    variant: AlertVariant;
    title: string;
    message: string;
  }) => void;
};

let lastConsumedStripeRedirectKey: string | null = null;

export function StripeConnectRedirectHandler({
  onConnected,
  onNotice,
}: StripeConnectRedirectHandlerProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const onConnectedRef = useRef(onConnected);
  const onNoticeRef = useRef(onNotice);

  useEffect(() => {
    onConnectedRef.current = onConnected;
    onNoticeRef.current = onNotice;
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = readStripeConnectRedirect(params);

    if (!redirect) {
      lastConsumedStripeRedirectKey = null;
      return;
    }

    const redirectKey = params.toString();
    const nextUrl = buildPathWithoutStripeConnectRedirect(pathname, params);
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }

    router.replace(nextUrl);

    if (redirectKey === lastConsumedStripeRedirectKey) {
      return;
    }

    lastConsumedStripeRedirectKey = redirectKey;

    if (redirect.kind === "connected") {
      onNoticeRef.current?.({
        variant: "success",
        title: "Stripe connected",
        message: STRIPE_CONNECTED_MESSAGE,
      });
      void onConnectedRef.current?.();
    }
    else {
      onNoticeRef.current?.({
        variant: "destructive",
        title: "Stripe connection failed",
        message: redirect.message,
      });
    }
  }, [pathname, router, searchParams]);

  return null;
}
