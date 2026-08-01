/**
 * integrityValidator.ts
 * Sakhi Clinic — Backup Engine: integrity validation layer.
 *
 * Two distinct checks, both reused rather than reinvented where possible:
 * 1. Shape/roundtrip validation -- verifyExportBundle() from
 *    storageIntegrityService.ts, already exists, already used by the
 *    periodic maintenance runtime. Not duplicated here, just called.
 * 2. A SHA-256 checksum of the final serialized (post-compression) bytes,
 *    via the standard Web Crypto digest API -- genuinely new, but this is
 *    hashing, not encryption: no key-management decision is involved, so
 *    it doesn't carry the same risk as encryptionLayer.ts's open question.
 *    Its purpose is corruption detection (did storage/transport mangle the
 *    file?), not confidentiality.
 */

import { verifyExportBundle } from "../storageIntegrityService";
import type { ClinicExportBundleV2 } from "../clinicExportService";

export type IntegrityCheckResult = {
  ok: boolean;
  error?: string;
  checksum?: string;
};

export async function computeChecksum(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function validateBundleShape(bundle: ClinicExportBundleV2): Promise<IntegrityCheckResult> {
  const result = verifyExportBundle(bundle);
  return { ok: result.ok, error: result.error };
}

export async function validateAndChecksum(bundle: ClinicExportBundleV2, finalContent: string): Promise<IntegrityCheckResult> {
  const shape = verifyExportBundle(bundle);
  if (!shape.ok) return { ok: false, error: shape.error };

  const checksum = await computeChecksum(finalContent);
  return { ok: true, checksum };
}

export async function verifyChecksum(content: string, expectedChecksum: string): Promise<boolean> {
  const actual = await computeChecksum(content);
  return actual === expectedChecksum;
}
