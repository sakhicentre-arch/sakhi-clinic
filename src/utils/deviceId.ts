const KEY = "sakhi.deviceId.v1";

function generateDeviceId(): string {
  // Short, stable, URL/file friendly id.
  // No crypto assumptions beyond Web Crypto availability (falls back if missing).
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing && existing.trim()) return existing.trim();
    const next = generateDeviceId();
    window.localStorage.setItem(KEY, next);
    return next;
  } catch {
    // In non-browser environments, return a deterministic-ish placeholder.
    return "unknown-device";
  }
}

