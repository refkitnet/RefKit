export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "refkit-theme";

export function isValidThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidThemePreference(stored)) {
      return stored;
    }
  }
  catch {
    // ignore
  }

  return "system";
}

export function resolveIsDark(preference: ThemePreference): boolean {
  if (preference === "dark") {
    return true;
  }

  if (preference === "light") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemePreference(preference: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolveIsDark(preference));
}

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
