import { redirect } from "next/navigation";

export default async function ProgramPayoutsRedirect({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  redirect(`/dashboard/payouts?program=${programId}`);
}
