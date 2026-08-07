import { Suspense } from "react";
import { AuthPageLoading } from "@/components/auth/auth-page-layout";
import { DeviceClient } from "./device-client";

export default function DevicePage() {
  return (
    <Suspense fallback={<AuthPageLoading />}>
      <DeviceClient />
    </Suspense>
  );
}
