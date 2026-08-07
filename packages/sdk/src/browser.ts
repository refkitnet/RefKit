const STORAGE_KEY = "refkit_click_id";
const COOKIE_NAME = "refkit_click_id";
const VIA_PARAM = "via";
const APP_HINT_PARAM = "refkit_app";
const LEGACY_PROGRAM_PARAM = "refkit_program";

type InitOptions = {
  baseUrl?: string;
};

let memoryClickId: string | null = null;
let sdkConfig: InitOptions | null = null;
let inflightCapture: Promise<string | null> | null = null;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  const parts = document.cookie.split(";");

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }

  return null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }

  // 30 days to match the attribution window. Safari caps JS-written cookies
  // at ~7 days regardless; localStorage remains the primary store.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=2592000; SameSite=Lax`;
}

function persistClickId(clickId: string) {
  memoryClickId = clickId;

  try {
    localStorage.setItem(STORAGE_KEY, clickId);
  }
  catch {
    // Safari private mode or storage blocked.
  }

  writeCookie(COOKIE_NAME, clickId);
}

function stripTrackingParamsFromUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (
    !url.searchParams.has(VIA_PARAM)
    && !url.searchParams.has(APP_HINT_PARAM)
    && !url.searchParams.has(LEGACY_PROGRAM_PARAM)
  ) {
    return;
  }

  url.searchParams.delete(VIA_PARAM);
  url.searchParams.delete(APP_HINT_PARAM);
  url.searchParams.delete(LEGACY_PROGRAM_PARAM);
  window.history.replaceState({}, "", url.toString());
}

async function recordClickFromVia(
  via: string,
  refkitApp: string | null
): Promise<string | null> {
  if (!sdkConfig) {
    return null;
  }

  const baseUrl = (sdkConfig.baseUrl ?? "https://app.refkit.net").replace(
    /\/$/,
    ""
  );

  try {
    const response = await fetch(`${baseUrl}/v1/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        via,
        page: window.location.href,
        referrer: document.referrer || undefined,
        ...(refkitApp ? { refkit_app: refkitApp } : {}),
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { click_id?: string | null };

    if (data.click_id) {
      persistClickId(data.click_id);
      return data.click_id;
    }
  }
  catch {
    return null;
  }

  return null;
}

export function init(options: InitOptions = {}) {
  sdkConfig = {
    baseUrl: options.baseUrl ?? "https://app.refkit.net",
  };
}

export async function capture(): Promise<string | null> {
  if (typeof window === "undefined") {
    return memoryClickId;
  }

  // Concurrent calls share one request so a click is never recorded twice.
  if (inflightCapture) {
    return inflightCapture;
  }

  const searchParams = new URL(window.location.href).searchParams;
  const fromUrl = searchParams.get(VIA_PARAM);

  if (!fromUrl) {
    return getClickId();
  }

  const refkitApp = searchParams.get(APP_HINT_PARAM);

  inflightCapture = (async () => {
    const clickId = await recordClickFromVia(fromUrl, refkitApp);
    stripTrackingParamsFromUrl();

    if (clickId) {
      return clickId;
    }

    return getClickId();
  })();

  try {
    return await inflightCapture;
  }
  finally {
    inflightCapture = null;
  }
}

export function getClickId(): string | null {
  if (typeof window === "undefined") {
    return memoryClickId;
  }

  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY);

    if (fromStorage) {
      memoryClickId = fromStorage;
      return fromStorage;
    }
  }
  catch {
    // Fall through to cookie and memory.
  }

  const fromCookie = readCookie(COOKIE_NAME);

  if (fromCookie) {
    memoryClickId = fromCookie;
    return fromCookie;
  }

  return memoryClickId;
}

export function getStripeMetadata(): Record<string, string> {
  const clickId = getClickId();

  if (!clickId) {
    return {};
  }

  return {
    refkit_click_id: clickId,
  };
}

export const RefKit = {
  init,
  capture,
  getClickId,
  getStripeMetadata,
};
