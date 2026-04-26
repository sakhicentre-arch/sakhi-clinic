/**
 * SAKHI CLINIC — LEARNING ENGINE (PHASE 5.1 RESTORED & HARDENED)
 * PROTOCOL: NO TRUNCATION | DEXIE PERSISTENCE
 */

import { db } from "../services/db";

type LearningEntry = {
  keywords: string[];
  remedy: string;
};

// ================= SAVE LEARNING =================
/**
 * Captures doctor intuition into the Dexie DB
 */
export const saveLearning = async (input: string, remedy: string) => {
  const words = input.toLowerCase().split(/\s+/);

  const entry: LearningEntry = {
    keywords: words,
    remedy,
  };

  try {
    await db.learning.add(entry);
  } catch (err) {
    console.warn("Learning save failed", err);
  }
};

// ================= APPLY LEARNING =================
/**
 * ZERO COMPROMISE: Boost weight (+15) preserved from original
 */
export const applyLearningBoost = async (results: any[], input: string) => {
  const words = input.toLowerCase().split(/\s+/);

  // Fetch history from robust local storage
  const history: LearningEntry[] = await db.learning.toArray();

  return results.map((r) => {
    let boost = 0;

    history.forEach((h) => {
      const match = h.keywords.some((k) => words.includes(k));

      if (match && h.remedy === r.name) {
        boost += 15; // Original learning weight
      }
    });

    return {
      ...r,
      score: r.score + boost,
      learned: boost > 0,
    };
  });
};