/**
 * SAKHI CLINIC — LEARNING ENGINE (PHASE 5.1 RESTORED & HARDENED)
 * PROTOCOL: NO TRUNCATION | DEXIE PERSISTENCE
 */

import { db, LearningPattern } from "../services/db";

type LearningEntry = LearningPattern & { keywords?: string[] };

// ================= SAVE LEARNING =================
/**
 * Captures doctor intuition into the Dexie DB
 */
export const saveLearning = async (input: string, remedy: string) => {
  const words = input.toLowerCase().split(/\s+/);

  const entry: LearningEntry = {
    symptomKey: words.sort().join("|"),
    keywords: words,
    remedy,
    score: 1,
    count: 1,
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
      const keywords = h.keywords || h.symptomKey?.split("|") || [];
      const match = keywords.some((k) => words.includes(k));

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
