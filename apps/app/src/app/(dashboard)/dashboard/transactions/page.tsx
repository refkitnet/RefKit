import { redirect } from "next/navigation";

export default async function TransactionsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const params = await searchParams;
  const program = params.program;

  if (program) {
    redirect(`/dashboard/referrals?program=${program}`);
  }

  redirect("/dashboard/referrals");
}
