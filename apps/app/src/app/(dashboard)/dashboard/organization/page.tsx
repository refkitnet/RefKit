import { redirect } from "next/navigation";
import { accountSettingsHref } from "@/lib/dashboard-nav";

export default function LegacyOrganizationPage() {
  redirect(accountSettingsHref("owner"));
}
