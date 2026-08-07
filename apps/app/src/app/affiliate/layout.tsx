import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AffiliateDashboardLayout } from "@/components/dashboard/layouts";
import { auth } from "@/lib/auth";
import { getMeProfileForSession } from "@/services/users/me";

export const dynamic = "force-dynamic";

export default async function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const me = await getMeProfileForSession(
    session.user.id,
    session.user.email ?? null,
    session.user.name ?? null
  );

  return (
    <AffiliateDashboardLayout initialMe={me}>
      {children}
    </AffiliateDashboardLayout>
  );
}
