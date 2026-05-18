import { useState, useCallback, useMemo } from "react";

export interface UsePatientSearchProps {
  patients: Array<{ id: string; name?: string; phone?: string; [key: string]: any }>;
  onOpen: (patientId: string) => void;
}

/**
 * usePatientSearch - Filters patients array based on search term
 * Manages keyboard navigation (up/down arrows, Enter)
 * Returns filtered patients that are direct references to original array
 */
export function usePatientSearch({ patients, onOpen }: UsePatientSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);

  // ✅ CRITICAL: Return filtered list as DIRECT REFERENCES from patients array
  // NOT copies, to ensure selectedPatient useMemo can find them by ID
  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) {
      return patients;
    }

    const lowerSearch = searchTerm.toLowerCase();
    return patients.filter((p) => {
      const nameMatch = p.name && p.name.toLowerCase().includes(lowerSearch);
      const phoneMatch = p.phone && p.phone.includes(searchTerm);
      const idMatch = p.id && String(p.id).includes(searchTerm);
      return nameMatch || phoneMatch || idMatch;
    });
  }, [searchTerm, patients]);

  // Reset focused index when filtered list changes
  const safelyAdjustedIndex = useMemo(() => {
    return Math.min(focusedIndex, Math.max(0, filteredPatients.length - 1));
  }, [focusedIndex, filteredPatients.length]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (filteredPatients.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < filteredPatients.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredPatients.length - 1
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        const focusedPatient = filteredPatients[safelyAdjustedIndex];
        if (focusedPatient && focusedPatient.id) {
          onOpen(focusedPatient.id);
        }
      }
    },
    [filteredPatients, safelyAdjustedIndex, onOpen]
  );

  return {
    searchTerm,
    setSearchTerm,
    filteredPatients,
    focusedIndex: safelyAdjustedIndex,
    setFocusedIndex,
    handleSearchKeyDown,
  };
}