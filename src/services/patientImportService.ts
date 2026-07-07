import { addPatient, updatePatient } from "./patientService";
import { getAllPatients } from "./patientService";
import type { Patient } from "./db";
import { logOperationalEvent } from "./operationalEventLogService";
import { captureOperationError } from "./runtimeErrorCaptureService";
import { generateId } from "../utils/generateId";

export type PatientImportMode = "skip-duplicates" | "merge-duplicates" | "import-all";

export type PatientImportRow = {
  fullName: string;
  age?: string;
  gender?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export type PatientImportResult = {
  imported: number;
  skipped: number;
  duplicates: number;
  failed: number;
  failures: Array<{ rowIndex: number; reason: string }>;
};

function normHeader(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeName(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(s: string): string {
  const digits = String(s || "").replace(/\D+/g, "");
  if (!digits) return "";
  // Prefer last 10 digits (India mobile), but keep full digits if shorter.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeGender(s: string): string {
  const raw = String(s || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "m" || raw === "male" || raw === "man") return "Male";
  if (raw === "f" || raw === "female" || raw === "woman") return "Female";
  return String(s || "").trim();
}

function safeIntAge(s: string): number | null {
  const n = Number(String(s || "").trim());
  if (!Number.isFinite(n)) return null;
  const age = Math.floor(n);
  if (age <= 0 || age > 130) return null;
  return age;
}

// Minimal RFC4180-ish CSV parser: handles quotes, commas, CRLF.
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    // ignore completely empty trailing row
    if (row.length === 1 && row[0] === "" && out.length > 0) {
      row = [];
      return;
    }
    out.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }

    if (ch === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }

    if (ch === "\r") {
      // swallow CR and optional LF
      if (text[i + 1] === "\n") {
        i += 2;
      } else {
        i += 1;
      }
      pushCell();
      pushRow();
      continue;
    }

    cell += ch;
    i += 1;
  }

  pushCell();
  pushRow();
  return out;
}

function matchColumns(headers: string[]): Record<keyof PatientImportRow, number | null> {
  const normalized = headers.map(normHeader);

  const find = (candidates: string[]) => {
    for (let i = 0; i < normalized.length; i++) {
      if (candidates.includes(normalized[i])) return i;
    }
    return null;
  };

  return {
    fullName: find(["fullname", "name", "patientname", "full", "patient"]),
    age: find(["age", "years", "yr", "yrs"]),
    gender: find(["gender", "sex"]),
    phone: find(["phone", "mobile", "mobileno", "number", "phoneno", "contact"]),
    address: find(["address", "addr", "location"]),
    notes: find(["notes", "note", "remark", "remarks", "comment", "comments"]),
  };
}

function buildRow(headersMap: Record<keyof PatientImportRow, number | null>, row: string[]): PatientImportRow {
  const get = (k: keyof PatientImportRow) => {
    const idx = headersMap[k];
    if (idx == null) return "";
    return String(row[idx] || "").trim();
  };

  return {
    fullName: get("fullName"),
    age: get("age") || undefined,
    gender: get("gender") || undefined,
    phone: get("phone") || undefined,
    address: get("address") || undefined,
    notes: get("notes") || undefined,
  };
}

function mergePatientPreferExisting(existing: Patient, incoming: Partial<Patient>): Partial<Patient> {
  const pick = (key: keyof Patient) => {
    const prev = (existing as any)[key];
    const next = (incoming as any)[key];
    if (prev == null || String(prev).trim() === "") return next;
    return prev;
  };

  return {
    name: pick("name") as any,
    phone: pick("phone") as any,
    gender: pick("gender") as any,
    age: pick("age") as any,
    address: pick("address") as any,
  };
}

function detectDuplicate(existingPatients: Patient[], incoming: { name: string; phone: string; age?: number | string }): Patient | null {
  const inPhone = normalizePhone(incoming.phone);
  if (inPhone) {
    const byPhone = existingPatients.find((p) => normalizePhone(p.phone) && normalizePhone(p.phone) === inPhone);
    if (byPhone) return byPhone;
  }

  const inName = normalizeName(incoming.name);
  const inAge = typeof incoming.age === "number" ? incoming.age : safeIntAge(String(incoming.age || ""));
  if (!inName) return null;

  const byNameAge = existingPatients.find((p) => {
    const pn = normalizeName(p.name);
    if (!pn || pn !== inName) return false;
    if (inAge == null) return true; // name-only match
    const pa = typeof p.age === "number" ? p.age : safeIntAge(String(p.age || ""));
    if (pa == null) return true;
    return pa === inAge;
  });
  return byNameAge || null;
}

export async function importPatientsFromCsv(file: File, mode: PatientImportMode): Promise<PatientImportResult> {
  const result: PatientImportResult = { imported: 0, skipped: 0, duplicates: 0, failed: 0, failures: [] };
  const startedAt = new Date().toISOString();

  await logOperationalEvent({
    level: "info",
    type: "patients.csv_import.start",
    message: "Patient CSV import started",
    data: { filename: file.name, size: file.size, mode },
    timestamp: startedAt,
  }).catch(() => {});

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSV is empty or missing rows");

    const headers = rows[0].map((h) => String(h || "").trim());
    const map = matchColumns(headers);
    if (map.fullName == null) throw new Error("CSV missing a name column (e.g. fullName / name)");

    const existingPatients = await getAllPatients();

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const r = rows[rowIndex];
      if (!r || r.length === 0) continue;

      try {
        const row = buildRow(map, r);
        const name = String(row.fullName || "").trim();
        if (!name) {
          result.failed += 1;
          result.failures.push({ rowIndex, reason: "Missing name" });
          continue;
        }

        const phone = normalizePhone(row.phone || "");
        const gender = normalizeGender(row.gender || "");
        const ageNum = row.age ? safeIntAge(row.age) : null;

        const incoming: Partial<Patient> = {
          name,
          phone: phone || "",
          gender: gender || "",
          age: ageNum == null ? (row.age || "") : ageNum,
          address: row.address || "",
        };

        const dup = detectDuplicate(existingPatients, { name, phone: incoming.phone || "", age: incoming.age });
        if (dup) {
          result.duplicates += 1;

          if (mode === "skip-duplicates") {
            result.skipped += 1;
            continue;
          }

          if (mode === "merge-duplicates") {
            const merged = mergePatientPreferExisting(dup, incoming);
            await updatePatient(String(dup.id), merged);
            continue;
          }
        }

        const id = generateId();
        await addPatient({
          id,
          name: incoming.name || "",
          phone: incoming.phone || "",
          gender: incoming.gender || "",
          age: incoming.age,
          address: incoming.address,
        } as Patient);
        existingPatients.push({ ...(incoming as any), id } as Patient);
        result.imported += 1;
      } catch (rowErr) {
        result.failed += 1;
        result.failures.push({ rowIndex, reason: rowErr instanceof Error ? rowErr.message : String(rowErr) });
      }
    }

    await logOperationalEvent({
      level: "info",
      type: "patients.csv_import.success",
      message: "Patient CSV import completed",
      data: { mode, result },
    }).catch(() => {});

    return result;
  } catch (error) {
    await captureOperationError({
      op: "patients.csv_import",
      message: "Patient CSV import failed",
      error,
      payload: { filename: file.name, size: file.size, mode },
    });
    throw error;
  }
}

