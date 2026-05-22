export type RemedyDefaults = {
  potency: string;
  dosage: string;
  duration: string;
};

const KEY = "sakhi.remedyDefaults.v1";

export function loadRemedyDefaults(fallback: RemedyDefaults): RemedyDefaults {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<RemedyDefaults>;
    return {
      potency: parsed.potency || fallback.potency,
      dosage: parsed.dosage || fallback.dosage,
      duration: parsed.duration || fallback.duration,
    };
  } catch {
    return fallback;
  }
}

export function saveRemedyDefaults(next: RemedyDefaults) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

