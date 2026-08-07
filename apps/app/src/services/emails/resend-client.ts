import { Resend } from "resend";
import { getServerEnv } from "@/lib/env";

let resendClient: Resend | null = null;

export function getResendClient() {
  if (!resendClient) {
    const env = getServerEnv();

    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured.");
    }

    resendClient = new Resend(env.RESEND_API_KEY);
  }

  return resendClient;
}
