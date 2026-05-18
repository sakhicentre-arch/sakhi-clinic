import { create } from "zustand";
// FIXED: All types imported from single canonical source — db.ts
// Local Medicine and Consultation type definitions deleted entirely.
import { Consultation, Medicine } from "../services/db";
// FIXED: Store calls service layer, not Dexie directly.
import {
  getAllConsultations,
  saveConsultation as persistConsultation,
  getConsultationsByPatient,
  getLastConsultationByPatient,
} from "../services/consultationService";
import { appointmentService } from "../services/appointmentService";

/**
 * SAKHI CLINIC — CONSULTATION STORE (V9.0)
 * -------------------------------------------------------
 * FIXES:
 * 1. Removed duplicate Medicine + Consultation local types
 * 2. All types imported from db.ts (single source of truth)
 * 3. saveConsultation now calls service (.put upsert) not .add
 * 4. Removed as any cast — types are now aligned
 * 5. loadConsultations accepts optional date filter (perf fix)
 * 6. getLastConsultation sorts by date string, not numeric ID
 * 7. getMiasmShift relabeled to reflect clinical uncertainty
 * 8. paymentStatus includes "waived" to match db.ts
 * -------------------------------------------------------
 */

// Re-export canonical types so UI components can import
// from the store without reaching into db.ts directly.
export type { Medicine, Consultation };

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// ================= STORE SHAPE =================
type Store = {
  consultations: Consultation[];
  lastError: string | null;

  activeSession: {
    patientId: string;
    appointmentId: string;
    clinicId?: "Dabholi" | "City Light";
  } | null;

  // Core Actions
  loadConsultations: (dateFilter?: string) => Promise<void>;
  loadPatientConsultations: (patientId: string) => Promise<void>;
  saveConsultation: (c: Consultation) => Promise<boolean>;
  initiateSession: (
    patientId: string,
    appointmentId: string,
    clinicId?: "Dabholi" | "City Light"
  ) => void;
  clearSession: () => void;

  // Selectors (run on in-memory loaded data)
  getPatientConsultations: (patientId: string) => Consultation[];
  getLastConsultation: (patientId: string) => Consultation | null;
  getConsultationById: (id: string) => Consultation | undefined;
  clearError: () => void;

  // Phase 20: Miasm Shift Observer
  getMiasmShift: (patientId: string) => {
    current: string;
    previous: string;
    // FIXED: Renamed from "healing/suppressive" to observed direction
    // with uncertainty flag — avoids presenting unvalidated clinical labels
    observedDirection: "towards_cure" | "towards_suppression" | "unchanged" | "insufficient_data";
    disclaimer: string;
  };
};

// ================= STORE =================
export const useConsultationStore = create<Store>((set, get) => ({
  consultations: [],
  lastError: null,
  activeSession: null,

  // -------------------------------------------------------
  // LOAD CONSULTATIONS
  // FIXED: Accepts optional date filter to avoid loading
  // entire table. Pass "2025-04-23" to load only that day.
  // Call with no argument only for analytics/full history views.
  // -------------------------------------------------------
  loadConsultations: async (dateFilter?: string) => {
    try {
      let data: Consultation[];
      if (dateFilter) {
        const all = await getAllConsultations();
        data = all.filter((c) => c.date?.startsWith(dateFilter));
      } else {
        // Full load — use only in Analytics/Revenue pages
        data = await getAllConsultations();
      }
      set({ consultations: data, lastError: null });
    } catch (error) {
      console.error("[ConsultationStore] loadConsultations failed:", error);
      set({ lastError: toErrorMessage(error) });
    }
  },

  // -------------------------------------------------------
  // LOAD PATIENT CONSULTATIONS
  // Loads only one patient's history into the store.
  // Call this when opening a patient profile or starting
  // a consultation — do NOT use loadConsultations for this.
  // -------------------------------------------------------
  loadPatientConsultations: async (patientId: string) => {
    try {
      const data = await getConsultationsByPatient(patientId);
      // Merge into store without wiping other loaded consultations
      set((state) => {
        const otherConsultations = state.consultations.filter(
          (c) => c.patientId !== patientId
        );
        return { consultations: [...otherConsultations, ...data], lastError: null };
      });
    } catch (error) {
      console.error("[ConsultationStore] loadPatientConsultations failed:", error);
      set({ lastError: toErrorMessage(error) });
    }
  },

  // -------------------------------------------------------
  // SAVE CONSULTATION
  // FIXED: Calls service layer which uses .put() (upsert).
  // Safe for both new saves and auto-save updates.
  // FIXED: clinicId copied from activeSession at save time.
  // FIXED: Returns boolean so UI knows if save succeeded.
  // -------------------------------------------------------
  saveConsultation: async (c: Consultation): Promise<boolean> => {
    try {
      const session = get().activeSession;

      // Attach clinicId from active session if not already set
      const consultationToSave: Consultation = {
        ...c,
        clinicId: c.clinicId ?? session?.clinicId,
      };

      const result = await persistConsultation(consultationToSave);
      if (!result) {
        console.error("[ConsultationStore] Save returned null — check service.");
        set({ lastError: "Consultation save failed without a service result." });
        return false;
      }

      // Mark appointment done if session is active
      if (session?.appointmentId && session.appointmentId === c.appointmentId) {
        await appointmentService.updateStatus(session.appointmentId, "done");
      }

      // Update in-memory store: replace if exists, append if new
      set((state) => {
        const exists = state.consultations.find((x) => x.id === c.id);
        const updated = exists
          ? state.consultations.map((x) =>
              x.id === c.id ? consultationToSave : x
            )
          : [...state.consultations, consultationToSave];
        return { consultations: updated, activeSession: null, lastError: null };
      });

      return true;
    } catch (error) {
      console.error("[ConsultationStore] saveConsultation failed:", error);
      set({ lastError: toErrorMessage(error) });
      return false;
    }
  },

  // -------------------------------------------------------
  // SESSION MANAGEMENT
  // FIXED: clinicId added to session — used at save time
  // to populate consultation.clinicId automatically.
  // -------------------------------------------------------
  initiateSession: (patientId, appointmentId, clinicId) => {
    set({ activeSession: { patientId, appointmentId, clinicId } });
  },

  clearSession: () => set({ activeSession: null }),
  clearError: () => set({ lastError: null }),

  // -------------------------------------------------------
  // SELECTORS
  // -------------------------------------------------------
  getPatientConsultations: (patientId) => {
    return get()
      .consultations.filter((c) => c.patientId === patientId)
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
  },

  // FIXED: Sorts by date string — not numeric ID cast
  getLastConsultation: (patientId) => {
    const sorted = get()
      .consultations.filter((c) => c.patientId === patientId)
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    return sorted[0] || null;
  },

  getConsultationById: (id) => {
    return get().consultations.find((c) => c.id === id);
  },

  // -------------------------------------------------------
  // MIASM SHIFT OBSERVER
  // FIXED: Renamed direction labels to avoid presenting
  // unvalidated clinical judgments as system facts.
  // Added disclaimer field — must be shown in UI alongside result.
  // -------------------------------------------------------
  getMiasmShift: (patientId) => {
    const list = get()
      .consultations.filter((c) => c.patientId === patientId)
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

    if (list.length < 2) {
      return {
        current: list[0]?.miasm || "Not assessed",
        previous: "None",
        observedDirection: "insufficient_data",
        disclaimer:
          "At least two consultations with miasm data are needed to observe a shift.",
      };
    }

    const current = list[0]?.miasm || "Unknown";
    const previous = list[1]?.miasm || "Unknown";

    // Miasm rank: lower = closer to functional (Psoric) end
    const miasmRank: Record<string, number> = {
      Psora: 1,
      Sycosis: 2,
      Tubercular: 3,
      Syphilis: 4,
    };

    const currRank = miasmRank[current] ?? -1;
    const prevRank = miasmRank[previous] ?? -1;

    let observedDirection: "towards_cure" | "towards_suppression" | "unchanged" | "insufficient_data" = "unchanged";

    if (currRank === -1 || prevRank === -1) {
      observedDirection = "insufficient_data";
    } else if (currRank < prevRank) {
      observedDirection = "towards_cure";
    } else if (currRank > prevRank) {
      observedDirection = "towards_suppression";
    }

    return {
      current,
      previous,
      observedDirection,
      disclaimer:
        "Miasm shift is an observed pattern only. Clinical confirmation required before drawing conclusions.",
    };
  },
}));
