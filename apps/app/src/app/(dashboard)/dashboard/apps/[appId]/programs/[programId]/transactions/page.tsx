import { redirect } from "next/navigation";

export default async function ProgramTransactionsRedirect({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  redirect(`/dashboard/referrals?program=${programId}`);
}
