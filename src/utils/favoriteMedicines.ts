const KEY = "sakhi.favoriteMedicines.v1";

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadFavoriteMedicineNames(): string[] {
  const parsed = safeJsonParse<string[]>(window.localStorage.getItem(KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((n) => typeof n === "string" && n.trim()).slice(0, 50);
}

function saveFavoriteMedicineNames(names: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(names.slice(0, 50)));
  } catch {
    // ignore
  }
}

export function isFavoriteMedicine(name: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return loadFavoriteMedicineNames().some((n) => n.toLowerCase() === key);
}

export function toggleFavoriteMedicine(name: string): string[] {
  const key = name.trim();
  if (!key) return loadFavoriteMedicineNames();
  const list = loadFavoriteMedicineNames();
  const idx = list.findIndex((n) => n.toLowerCase() === key.toLowerCase());
  const next = idx >= 0 ? list.filter((_, i) => i !== idx) : [key, ...list];
  saveFavoriteMedicineNames(next);
  return next;
}
