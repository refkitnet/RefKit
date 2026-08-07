import { isLocalDevApp } from "@/services/stripe/config";

export function isDevSignInEnabled() {
  return process.env.NODE_ENV !== "production" && isLocalDevApp();
}
