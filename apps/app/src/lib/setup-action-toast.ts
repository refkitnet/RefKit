import { toast } from "sonner";

function shortSetupDescription(message: string): string {
  if (
    message.includes("No signatures found matching")
    || message.includes("signing secret contains whitespace")
  ) {
    return "Stripe App signing secret (STRIPE_APP_SECRET / absec_...) is wrong or outdated. This is not the webhook whsec_ secret.";
  }

  if (message.length > 140) {
    return `${message.slice(0, 137)}...`;
  }

  return message;
}

export function toastSetupError(title: string, message: string) {
  toast.error(title, {
    description: shortSetupDescription(message),
  });
}
