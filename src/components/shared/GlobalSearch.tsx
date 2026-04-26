import React, { useState, useMemo, useRef, useEffect } from "react";
import { usePatientStore } from "../../store/usePatientStore";
import { X, Search } from "lucide-react";

interface GlobalSearchProps {
  onSelectPatient: (patientId: string) => void;
}

// Simple fuzzy match function
const fuzzyMatch = (query: string, text: string): boolean => {
  const q = query.toLowerCase();
  let t = text.toLowerCase();
  let qi = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }

  return qi === q.length;
};

// Highlight matching text
const highlightMatch = (text: string, query: string): Array<{ text: string; highlight: boolean }> => {
  if (!query) return [{ text, highlight: false }];
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let qi = 0;
  let lastIndex = 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  for (let ti = 0; ti < t.length; ti++) {
    if (qi < q.length && t[ti] === q[qi]) {
      if (ti > lastIndex) {
        parts.push({ text: text.slice(lastIndex, ti), highlight: false });
      }
      parts.push({ text: text[ti], highlight: true });
      lastIndex = ti + 1;
      qi++;
    }
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }
  return parts;
};
export default function GlobalSearch({ onSelectPatient }: GlobalSearchProps) {
  const patients = usePatientStore((s) => s.patients);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !open) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && open) {
        e.preventDefault();
        const maxIndex = results.length - 1;
        setSelectedIndex((prev) =>
          e.key === "ArrowDown"
            ? prev < maxIndex ? prev + 1 : 0
            : prev > 0 ? prev - 1 : maxIndex
        );
      } else if (e.key === "Enter" && open && results.length > 0) {
        e.preventDefault();
        const patient = results[selectedIndex];
        onSelectPatient(patient.id);
        setOpen(false);
        setQuery("");
        setSelectedIndex(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, query, selectedIndex]);

  const results = useMemo(() => {
    if (!query.trim()) return patients;
    return patients.filter(
      (p) =>
        fuzzyMatch(query, p.name) ||
        fuzzyMatch(query, p.phone || "")
    );
  }, [query, patients]);

  return (
    <div style={{ position: "relative", flex: 1, maxWidth: "400px" }}>
      {/* Search Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#f8fafc",
          border: open ? "2px solid #0ea5e9" : "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "8px 12px",
          transition: "all 0.2s ease",
        }}
      >
        <Search size={16} color="#94a3b8" />
        <input
          ref={inputRef}
          type="text"
          placeholder='Search patients... (press "/" to focus)'
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: "14px",
            color: "#0f172a",
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} color="#94a3b8" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {open && results.length > 0 && (
        <div
          ref={listRef}
          style={{
            position: "absolute",
            top: "100%",
            left: "0",
            right: "0",
            marginTop: "8px",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
            zIndex: 1000,
            maxHeight: "360px",
            overflowY: "auto",
          }}
        >
          {results.map((patient, index) => {
            const highlightedName = highlightMatch(patient.name, query);
            const lastVisitDate = patient.lastVisit
              ? new Date(patient.lastVisit).toLocaleDateString()
              : "Never";

            return (
              <button
                key={patient.id}
                onClick={() => {
                  onSelectPatient(patient.id);
                  setOpen(false);
                  setQuery("");
                  setSelectedIndex(0);
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  background:
                    index === selectedIndex ? "#f0f9ff" : "transparent",
                  borderBottom: index < results.length - 1 ? "1px solid #f1f5f9" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  transition: "background 0.15s ease",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#e0f2fe",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    fontWeight: "700",
                    color: "#0284c7",
                    flexShrink: 0,
                  }}
                >
                  {patient.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "#0f172a" }}>
                    {highlightedName.map((part, i) => (
                      <span
                        key={i}
                        style={{
                          fontWeight: part.highlight ? "700" : "600",
                          background: part.highlight ? "#fef3c7" : "transparent",
                          borderRadius: part.highlight ? "2px" : "0",
                          padding: part.highlight ? "0 2px" : "0",
                        }}
                      >
                        {part.text}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    {patient.phone} • {patient.age || "N/A"} Y • Last: {lastVisitDate}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No Results */}
      {open && query && results.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "0",
            right: "0",
            marginTop: "8px",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "16px",
            textAlign: "center",
            fontSize: "14px",
            color: "#64748b",
            zIndex: 1000,
          }}
        >
          No patients found for "{query}"
        </div>
      )}
    </div>
  );
}
