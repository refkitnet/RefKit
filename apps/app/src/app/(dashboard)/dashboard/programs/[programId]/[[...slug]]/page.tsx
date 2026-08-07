import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireProgramAccess } from "@/services/scoping";

type LegacyProgramRedirectPageProps = {
  params: Promise<{
    programId: string;
    slug?: string[];
  }>;
};

export default async function LegacyProgramRedirectPage({
  params,
}: LegacyProgramRedirectPageProps) {
  const { programId, slug } = await params;
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  try {
    const program = await requireProgramAccess(session.user.id, programId);
    const suffix = slug?.length ? `/${slug.join("/")}` : "";

    redirect(`/dashboard/apps/${program.appId}/programs/${programId}${suffix}`);
  }
  catch {
    notFound();
  }
}
