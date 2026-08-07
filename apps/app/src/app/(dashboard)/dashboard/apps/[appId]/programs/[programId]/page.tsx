import { redirect } from "next/navigation";
import { appProgramsHref } from "@/lib/dashboard-nav";

export default async function ProgramSettingsRedirect({
  params,
}: {
  params: Promise<{ appId: string; programId: string }>;
}) {
  const { appId } = await params;
  redirect(appProgramsHref(appId));
}
