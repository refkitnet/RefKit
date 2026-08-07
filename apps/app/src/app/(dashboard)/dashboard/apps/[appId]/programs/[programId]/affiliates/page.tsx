import { redirect } from "next/navigation";

export default async function ProgramAffiliatesRedirect({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  redirect(`/dashboard/affiliates?program=${programId}`);
}
