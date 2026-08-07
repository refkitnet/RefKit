import { getAdminEmailAllowlist } from "@/lib/env";
import { isSelfHosted } from "@/lib/deployment";

export function validateAdminAccess(email: string, isAdmin: boolean) {
  if (isSelfHosted()) {
    return isAdmin;
  }

  const allowlist = getAdminEmailAllowlist();

  if (allowlist.length === 0) {
    return false;
  }

  if (!isAdmin) {
    return false;
  }

  return allowlist.includes(email.trim().toLowerCase());
}
