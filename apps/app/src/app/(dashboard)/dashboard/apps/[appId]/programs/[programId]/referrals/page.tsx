import { redirect } from "next/navigation";

export default async function ProgramReferralsRedirect({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  redirect(`/dashboard/referrals?program=${programId}`);
}
