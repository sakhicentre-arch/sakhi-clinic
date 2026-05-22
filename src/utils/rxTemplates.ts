import { Medicine } from "../services/db";

export type RxTemplate = {
  id: string;
  name: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  medicines: Array<Pick<Medicine, "name" | "potency" | "notes"> & { dosage?: string; duration?: string }>;
};

const KEY = "sakhi.rxTemplates.v1";

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadRxTemplates(): RxTemplate[] {
  const parsed = safeJsonParse<RxTemplate[]>(window.localStorage.getItem(KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((t) => t && typeof t.id === "string" && typeof t.name === "string")
    .slice(0, 50);
}

export function saveRxTemplates(next: RxTemplate[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next.slice(0, 50)));
  } catch {
    // ignore
  }
}

export function upsertRxTemplate(input: Omit<RxTemplate, "createdAt" | "updatedAt"> & Partial<Pick<RxTemplate, "createdAt" | "updatedAt">>) {
  const list = loadRxTemplates();
  const now = Date.now();
  const existingIndex = list.findIndex((t) => t.id === input.id);
  const createdAt = input.createdAt ?? (existingIndex >= 0 ? list[existingIndex].createdAt : now);
  const updatedAt = input.updatedAt ?? now;
  const next: RxTemplate = {
    id: input.id,
    name: input.name.trim() || "Template",
    pinned: Boolean(input.pinned),
    createdAt,
    updatedAt,
    medicines: input.medicines || [],
  };
  const filtered = list.filter((t) => t.id !== input.id);
  filtered.unshift(next);
  saveRxTemplates(filtered);
  return next;
}

export function deleteRxTemplate(id: string) {
  const list = loadRxTemplates();
  saveRxTemplates(list.filter((t) => t.id !== id));
}

export function togglePinTemplate(id: string, pinned: boolean) {
  const list = loadRxTemplates();
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], pinned, updatedAt: Date.now() };
  saveRxTemplates(list);
}

