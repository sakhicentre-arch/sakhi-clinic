/**
 * encryptionLayer.ts
 * Sakhi Clinic — Backup Engine: encryption layer (NOT YET IMPLEMENTED).
 *
 * This is a deliberate, disclosed gap, not an oversight. Real encryption
 * needs a key-management decision this codebase has never made: where does
 * the key come from (a doctor-chosen passphrase? a device-bound key? a key
 * escrowed with a future Module B account?), and what happens if it's
 * lost -- an unrecoverable encrypted backup is worse than an unencrypted
 * one for a solo doctor with no IT department. PRODUCTION_V1_ARCHITECTURE_
 * ASSESSMENT.md already flags this as a "Section 14" decision, not
 * something to invent unilaterally inside a backup-engine refactor.
 *
 * This stage exists so the pipeline's SHAPE is correct now (Serializer ->
 * Encryption -> Compression -> IntegrityValidator -> StorageProvider) and a
 * real implementation can be dropped in later without moving any other
 * layer. It must never claim to encrypt when it doesn't: every caller gets
 * `encrypted: false` back, explicitly, and the backup file's own metadata
 * is never marked as encrypted by this pass-through.
 */

export interface EncryptionResult {
  encrypted: boolean;
  content: string;
}

export async function encrypt(content: string): Promise<EncryptionResult> {
  return { encrypted: false, content };
}

export async function decrypt(content: string, wasEncrypted: boolean): Promise<string> {
  if (wasEncrypted) {
    // A file claims to be encrypted but this build has no decryption
    // capability -- fail loudly rather than silently returning ciphertext
    // as if it were the real data.
    throw new Error("This backup file is encrypted, but encryption support is not yet implemented in this build.");
  }
  return content;
}
