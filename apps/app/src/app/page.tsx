import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDefaultHomePathForUser } from "@/services/users/me";

export default async function HomePage() {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (session?.user?.id) {
    const homePath = await getDefaultHomePathForUser(
      session.user.id,
      session.user.email ?? null,
      session.user.name ?? null
    );
    redirect(homePath);
  }

  redirect("/sign-in");
}
