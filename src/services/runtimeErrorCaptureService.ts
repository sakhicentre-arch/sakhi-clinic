import { logOperationalEvent } from "./operationalEventLogService";

export type OperationName =
  | "consultation.save"
  | "appointment.create"
  | "appointment.update"
  | "patient.create"
  | "patient.update"
  | "queue.action"
  | "runtime.unhandled"
  | "patients.csv_import";

const nowIso = () => new Date().toISOString();

function isStandalonePwa(): boolean {
  try {
    // iOS Safari: navigator.standalone; others: display-mode.
    const nav = navigator as any;
    if (typeof nav?.standalone === "boolean") return Boolean(nav.standalone);
    return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  } catch {
    return false;
  }
}

function safeJsonStringify(value: unknown, maxLen = 12_000): string {
  try {
    const str = JSON.stringify(value);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + "…";
  } catch {
    return "[unserializable]";
  }
}

function redact(value: any): any {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(redact);

  const out: Record<string, any> = {};
  const keys = Object.keys(value);
  for (const key of keys.slice(0, 40)) {
    const v = (value as any)[key];
    const lower = key.toLowerCase();
    if (lower.includes("phone") || lower.includes("mobile")) {
      const s = String(v || "");
      out[key] = s ? s.slice(0, 2) + "******" + s.slice(-2) : s;
      continue;
    }
    if (lower.includes("message") && typeof v === "string" && v.length > 160) {
      out[key] = v.slice(0, 160) + "…";
      continue;
    }
    out[key] = redact(v);
  }
  if (keys.length > 40) out.__truncatedKeys = keys.length - 40;
  return out;
}

export function getRuntimeContext() {
  return {
    timestamp: nowIso(),
    href: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    language: typeof navigator !== "undefined" ? navigator.language : "",
    platform: typeof navigator !== "undefined" ? (navigator as any).platform : "",
    standalone: typeof window !== "undefined" ? isStandalonePwa() : false,
    viewport: typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio } : null,
  };
}

export function toErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { name: "UnknownError", message: String(error), stack: undefined as string | undefined };
}

export async function logOperationAttempt(input: {
  op: OperationName;
  message: string;
  payload?: any;
}): Promise<void> {
  await logOperationalEvent({
    level: "info",
    type: `op.${input.op}.attempt`,
    message: input.message,
    data: {
      ctx: getRuntimeContext(),
      payload: redact(input.payload),
    },
  }).catch(() => {});
}

export async function logOperationSuccess(input: {
  op: OperationName;
  message: string;
  data?: any;
}): Promise<void> {
  await logOperationalEvent({
    level: "info",
    type: `op.${input.op}.success`,
    message: input.message,
    data: {
      ctx: getRuntimeContext(),
      ...redact(input.data),
    },
  }).catch(() => {});
}

export async function captureOperationError(input: {
  op: OperationName;
  message: string;
  error: unknown;
  payload?: any;
  extra?: any;
}): Promise<void> {
  const err = toErrorDetails(input.error);
  await logOperationalEvent({
    level: "error",
    type: `op.${input.op}.failure`,
    message: input.message,
    data: {
      ctx: getRuntimeContext(),
      error: err,
      payload: redact(input.payload),
      extra: redact(input.extra),
      // Helpful for quickly inspecting without opening nested objects.
      payloadJson: safeJsonStringify(redact(input.payload)),
    },
  }).catch(() => {});
}

export function installGlobalErrorCapture(): void {
  if (typeof window === "undefined") return;
  const handlerInstalledKey = "__sakhi_global_error_capture_installed__";
  if ((window as any)[handlerInstalledKey]) return;
  (window as any)[handlerInstalledKey] = true;

  window.addEventListener("error", (ev) => {
    void captureOperationError({
      op: "runtime.unhandled",
      message: "Unhandled runtime error",
      error: (ev as any).error || new Error(String((ev as any).message || "Unknown window.error")),
      extra: {
        filename: (ev as any).filename,
        lineno: (ev as any).lineno,
        colno: (ev as any).colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    void captureOperationError({
      op: "runtime.unhandled",
      message: "Unhandled promise rejection",
      error: (ev as any).reason,
    });
  });
}

