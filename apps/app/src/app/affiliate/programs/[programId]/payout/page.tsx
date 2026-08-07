"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AffiliateProgramPayoutRedirectPage() {
  const params = useParams<{ programId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/affiliate/payouts?program=${params.programId}`);
  }, [params.programId, router]);

  return null;
}
