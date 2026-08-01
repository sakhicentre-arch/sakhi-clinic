import { normalizePhone } from "../utils/whatsapp";

type OpenOptions = {
  phone?: string | null;
  message: string;
  windowName?: string;
};

const DEFAULT_WINDOW = "sakhi_whatsapp_window";

export function buildWhatsAppUrls(opts: { phone?: string | null; message: string }) {
  const normalized = opts.phone ? normalizePhone(opts.phone) : null;
  const text = encodeURIComponent((opts.message || "").trim());

  if (normalized) {
    const phoneE164 = `91${normalized}`;
    return {
      appUrl: `whatsapp://send?phone=${phoneE164}&text=${text}`,
      webUrl: `https://wa.me/${phoneE164}?text=${text}`,
    };
  }

  return {
    appUrl: `whatsapp://send?text=${text}`,
    webUrl: `https://wa.me/?text=${text}`,
  };
}

function isStandaloneDisplayMode(): boolean {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      window.matchMedia?.("(display-mode: fullscreen)")?.matches === true ||
      // iOS legacy
      (window.navigator as any)?.standalone === true
    );
  } catch {
    return false;
  }
}

function showWhatsAppFallbackToast(opts: { onOpenWeb: () => void }) {
  const existing = document.getElementById("sakhi-wa-fallback");
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.id = "sakhi-wa-fallback";
  root.setAttribute("role", "status");
  root.style.position = "fixed";
  root.style.left = "12px";
  root.style.right = "12px";
  root.style.bottom = "calc(env(safe-area-inset-bottom, 0px) + 12px)";
  root.style.zIndex = "2500";
  root.style.background = "rgba(15, 23, 42, 0.92)";
  root.style.color = "#fff";
  root.style.borderRadius = "16px";
  root.style.padding = "12px 14px";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "space-between";
  root.style.gap = "12px";
  root.style.boxShadow = "0 12px 30px rgba(15, 23, 42, 0.28)";
  root.style.backdropFilter = "blur(12px)";


  const text = document.createElement("div");
  text.style.fontSize = "13px";
  text.style.fontWeight = "800";
  text.textContent = "WhatsApp not available";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.alignItems = "center";
  actions.style.gap = "10px";

  const web = document.createElement("button");
  web.type = "button";
  web.textContent = "Open via Web";
  web.style.minHeight = "40px";
  web.style.padding = "8px 12px";
  web.style.borderRadius = "14px";
  web.style.border = "1px solid rgba(255,255,255,0.18)";
  web.style.background = "rgba(255,255,255,0.08)";
  web.style.color = "#fff";
  web.style.fontWeight = "900";
  web.style.fontSize = "12px";
  web.style.cursor = "pointer";
  web.onclick = () => {
    try {
      opts.onOpenWeb();
    } finally {
      root.remove();
    }
  };

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close");
  close.style.minHeight = "40px";
  close.style.width = "40px";
  close.style.borderRadius = "14px";
  close.style.border = "1px solid rgba(255,255,255,0.10)";
  close.style.background = "transparent";
  close.style.color = "rgba(255,255,255,0.8)";
  close.style.fontWeight = "900";
  close.style.cursor = "pointer";
  close.onclick = () => root.remove();

  actions.appendChild(web);
  actions.appendChild(close);
  root.appendChild(text);
  root.appendChild(actions);
  document.body.appendChild(root);

  window.setTimeout(() => {
    if (!document.getElementById("sakhi-wa-fallback")) return;
    root.remove();
  }, 4200);
}

/**
 * Opens WhatsApp in a native-app-first way on Android PWA.
 * Primary: `whatsapp://send?...`
 * Fallback: `https://wa.me/...` only if the app protocol likely failed.
 */
export function openWhatsApp({ phone, message, windowName = DEFAULT_WINDOW }: OpenOptions): boolean {
  const urls = buildWhatsAppUrls({ phone, message });
  if (!urls.appUrl) return false;

  const isStandalone = isStandaloneDisplayMode();

  // Attempt native scheme first.
  // In installed Android PWA mode, prefer same-tab intent to avoid Chrome intermediaries.
  let didBackground = false;
  const markBackground = () => {
    didBackground = document.hidden || (typeof document.visibilityState === "string" && document.visibilityState === "hidden");
  };

  const onVis = () => markBackground();
  window.addEventListener("visibilitychange", onVis, { passive: true } as any);
  window.addEventListener("pagehide", onVis, { passive: true } as any);
  window.addEventListener("blur", onVis, { passive: true } as any);

  try {
    if (isStandalone) {
      window.location.href = urls.appUrl;
    } else {
      // In browser mode, prefer a new window so tests and desktop browsing don't hard-navigate.
      window.open(urls.appUrl, windowName);
    }
  } catch {
    // Fall back to open if location assign fails.
    try {
      window.open(urls.appUrl, windowName);
    } catch {
      // ignore
    }
  }

  // Fallback after a delay only if the app protocol likely failed (we stayed foreground).
  window.setTimeout(() => {
    window.removeEventListener("visibilitychange", onVis as any);
    window.removeEventListener("pagehide", onVis as any);
    window.removeEventListener("blur", onVis as any);

    markBackground();
    if (didBackground) return;

    if (isStandalone) {
      // PWA-Strict policy: never auto-open Chrome. Offer explicit manual fallback.
      showWhatsAppFallbackToast({
        onOpenWeb: () => {
          try {
            window.location.href = urls.webUrl;
          } catch {
            window.open(urls.webUrl, windowName);
          }
        },
      });
      return;
    }

    // Browser mode: controlled fallback is acceptable.
    try {
      window.open(urls.webUrl, windowName);
    } catch {
      // ignore
    }
  }, 950);

  return true;
}

// Back-compat: existing "shareOnWhatsApp" callers (e.g. PrescriptionPrint)
export const shareOnWhatsApp = (data: any) => {
  const complaint = data.totality?.complaint || "-";
  const miasm = data.totality?.miasm || "Awaiting Analysis";

  let message = `*Sakhi Homeopathic Clinic*\n`;
  message += `*Dr. Amisha (BHMS)*\n`;
  message += `--------------------------\n`;
  message += `*Patient:* ${data.patient}\n`;
  message += `*Date:* ${data.date}\n`;
  message += `--------------------------\n`;
  message += `*Clinical Totality:*\n`;
  message += `• Complaint: ${complaint}\n`;
  message += `• Miasm: ${miasm}\n`;
  message += `--------------------------\n`;
  message += `*Rx / Prescription:*\n`;

  (data.medicines || []).forEach((m: any) => {
    message += `💊 *${m.name}*\n   ${m.dosage || "-"} | ${m.duration || "-"}\n`;
  });

  if (data.advice?.length) {
    message += `\n*Advice:*\n`;
    data.advice.forEach((a: string) => {
      message += `• ${a}\n`;
    });
  }

  message += `\n*Follow-up:* ${data.followUp || "15 Days"}\n`;
  message += `--------------------------\n`;
  message += `_This is a digitally authenticated clinical record._`;

  openWhatsApp({ message });
};
