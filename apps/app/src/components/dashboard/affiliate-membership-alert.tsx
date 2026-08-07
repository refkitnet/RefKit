import { AlertCircle, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AffiliateMembershipAlert({
  status,
}: {
  status: "pending" | "disabled" | "active";
}) {
  if (status === "active") {
    return null;
  }

  if (status === "pending") {
    return (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>Pending approval</AlertTitle>
        <AlertDescription>
          The developer must approve your application before commissions
          accrue. You can review terms and links below, but wait to promote until
          you are active.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Account disabled</AlertTitle>
      <AlertDescription>
        You cannot earn new commissions on this program. Past earnings may still
        appear for your records.
      </AlertDescription>
    </Alert>
  );
}
