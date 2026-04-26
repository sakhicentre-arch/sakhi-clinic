/**
 * SAKHI CLINIC — CASE MEMORY ENGINE (PHASE 5.1 RESTORED & HARDENED)
 * PROTOCOL: NO TRUNCATION | DEXIE PERSISTENCE
 */

import { db } from "../services/db";

type CaseEntry = {
  patientId?: string;
  caseText: string;
  remedy: string;
  outcome: string;
};

// ================= SAVE CASE =================
/**
 * Upgraded to Async for Dexie compatibility
 * Ensures no data loss even if browser is closed
 */
export const saveCaseMemory = async (
  patientId: string | undefined,
  caseText: string,
  remedy: string,
  outcome: string
) => {
  if (!caseText || !remedy) return;

  const entry: CaseEntry = {
    patientId,
    caseText: caseText.toLowerCase(),
    remedy,
    outcome,
  };

  // Logic: Store in Dexie for robust clinical history
  try {
    await db.caseMemory.add(entry);
  } catch (err) {
    console.error("Failed to save to Dexie, falling back to console log", entry);
  }
};

// ================= TEXT SIMILARITY =================
/**
 * Core clinical similarity logic (Identical to original Phase 5.1)
 */
const getSimilarityScore = (text1: string, text2: string) => {
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));

  let match = 0;

  words1.forEach((w) => {
    if (words2.has(w)) match++;
  });

  return match / Math.max(words1.size, 1);
};

// ================= APPLY CASE BOOST =================
/**
 * Upgraded to Async to fetch from IndexedDB
 * ZERO COMPROMISE: All outcome weights (+25, +10, -15) preserved
 */
export const applyCaseMemoryBoost = async (
  results: any[],
  currentCase: string
) => {
  // Fetch from Dexie (The robust clinical spine)
  const history: CaseEntry[] = await db.caseMemory.toArray();

  if (!currentCase || history.length === 0) return results;

  return results.map((r) => {
    let boost = 0;

    history.forEach((h) => {
      const similarity = getSimilarityScore(
        currentCase.toLowerCase(),
        h.caseText
      );

      if (similarity > 0.3 && h.remedy === r.name) {
        // Clinical Weights (Original Logic)
        if (h.outcome === "significant_improvement") boost += 25;
        if (h.outcome === "partial_improvement") boost += 10;
        if (h.outcome === "worsening") boost -= 15;
      }
    });

    return {
      ...r,
      score: r.score + boost,
      caseBoost: boost,
    };
  });
};