/**
 * compressionLayer.ts
 * Sakhi Clinic — Backup Engine: compression layer.
 *
 * Real gzip compression via the standard CompressionStream/DecompressionStream
 * Web APIs (available in this app's only supported browser, current Chrome
 * -- see MODULE_A_RELEASE_CHECKLIST.md's browser requirement). No new
 * dependency. Falls back to storing content uncompressed if the API is
 * unavailable, rather than failing the backup.
 *
 * The compressed bytes are base64-encoded so every layer's I/O stays a
 * plain string (matches StorageProvider.save's `content: string` and this
 * app's existing all-JSON backup file convention) -- a deliberate
 * simplicity/size trade-off, not an oversight. JSON still compresses well
 * enough after the base64 overhead to be worthwhile.
 */

export interface CompressionResult {
  compressed: boolean;
  content: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // avoid call-stack limits from String.fromCharCode(...largeArray) on big backups
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function streamsSupported(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

export async function compress(content: string): Promise<CompressionResult> {
  if (!streamsSupported()) {
    return { compressed: false, content };
  }
  try {
    const stream = new Blob([content]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressedBlob = await new Response(stream).blob();
    const buffer = await compressedBlob.arrayBuffer();
    return { compressed: true, content: arrayBufferToBase64(buffer) };
  } catch {
    // Compression is an optimization, never a requirement -- fall back to
    // uncompressed rather than failing the whole backup.
    return { compressed: false, content };
  }
}

export async function decompress(content: string, wasCompressed: boolean): Promise<string> {
  if (!wasCompressed) return content;
  if (!streamsSupported()) {
    throw new Error("This backup file is compressed, but this browser does not support decompression.");
  }
  const buffer = base64ToArrayBuffer(content);
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const decompressedBlob = await new Response(stream).blob();
  return decompressedBlob.text();
}
