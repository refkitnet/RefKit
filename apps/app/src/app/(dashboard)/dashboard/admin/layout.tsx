import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMeProfileForSession } from "@/services/users/me";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session?.user?.id) {
    redirect("/sign-in?redirect=/dashboard/admin");
  }

  const me = await getMeProfileForSession(
    session.user.id,
    session.user.email ?? null,
    session.user.name ?? null
  );

  if (!me.is_admin) {
    redirect("/dashboard");
  }

  return children;
}
