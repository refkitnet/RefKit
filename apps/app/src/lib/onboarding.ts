export const ONBOARDING_ACK_STORAGE_KEY = "refkit:onboarding-acknowledged-app";
export const ONBOARDING_CHANGE_EVENT = "refkit:onboarding-change";
export const SETUP_STEP_STORAGE_KEY = "refkit:setup-step";

export type SetupStepTarget =
  | "billing"
  | "website"
  | "key"
  | "install"
  | "click"
  | "identify"
  | "payment"
  | "done";

function isNonBrandHostname(hostname: string) {
  const lower = hostname.toLowerCase();

  if (lower === "localhost" || lower.endsWith(".localhost")) {
    return true;
  }

  if (lower === "127.0.0.1" || lower === "::1") {
    return true;
  }

  return /^\d{1,3}(\.\d{1,3}){3}$/.test(lower);
}

export function inferAppNameFromWebsite(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const hostname = new URL(candidate).hostname.replace(/^www\./i, "");

    if (isNonBrandHostname(hostname)) {
      return "";
    }

    const label = hostname.split(".")[0] ?? "";

    return label
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  catch {
    return "";
  }
}

function notifyOnboardingChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(ONBOARDING_CHANGE_EVENT));
}

export function readOnboardingAcknowledgedAppId() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(ONBOARDING_ACK_STORAGE_KEY) ?? "";
}

export function isOnboardingAcknowledged(appId: string) {
  return readOnboardingAcknowledgedAppId() === appId;
}

export function acknowledgeOnboarding(appId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ONBOARDING_ACK_STORAGE_KEY, appId);
  notifyOnboardingChange();
}

export function reopenOnboarding(appId: string, step?: SetupStepTarget) {
  if (typeof window === "undefined") {
    return;
  }

  const current = readOnboardingAcknowledgedAppId();

  if (current === appId) {
    window.localStorage.removeItem(ONBOARDING_ACK_STORAGE_KEY);
  }

  if (step) {
    window.sessionStorage.setItem(SETUP_STEP_STORAGE_KEY, step);
  }

  notifyOnboardingChange();
}

export function consumePreferredSetupStep(): SetupStepTarget | null {
  if (typeof window === "undefined") {
    return null;
  }

  const step = window.sessionStorage.getItem(SETUP_STEP_STORAGE_KEY);
  window.sessionStorage.removeItem(SETUP_STEP_STORAGE_KEY);

  if (
    step === "billing" ||
    step === "website" ||
    step === "key" ||
    step === "install" ||
    step === "click" ||
    step === "identify" ||
    step === "payment" ||
    step === "done"
  ) {
    return step;
  }

  return null;
}
