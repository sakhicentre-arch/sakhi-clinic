import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import { Medicine } from "../services/db";
import { generateId } from "../utils/generateId";
import { loadFavoriteMedicineNames, toggleFavoriteMedicine } from "../utils/favoriteMedicines";

interface Suggestion {
  name: string;
  score: number;
  reason: string;
}

interface Props {
  value: Medicine[];
  onChange: (meds: Medicine[]) => void;
  suggestions?: Suggestion[];
}

const PRIMARY_DOSAGE_PRESETS = ["1-0-1", "1-1-1", "SOS"];
const MORE_DOSAGE_PRESETS = ["BD", "TDS", "0-0-1", "1-0-0", "0-1-0", "1-0-1 x 3 days"];

const createMedicine = (): Medicine => ({
  id: generateId(),
  name: "",
  potency: "30C",
  dosage: "1-1-1",
  duration: "5 Days",
} as Medicine);

interface MedicineRowProps {
  active: boolean;
  autoFocus: boolean;
  index: number;
  medicine: Medicine;
  onChange: (index: number, key: keyof Medicine, val: string) => void;
  onFocus: (index: number) => void;
  onRemove: (index: number) => void;
  suggestions: Suggestion[];
  favorites: string[];
  onToggleFavorite: (name: string) => void;
}

const MedicineRow = memo(function MedicineRow({
  active,
  autoFocus,
  index,
  medicine,
  onChange,
  onFocus,
  onRemove,
  suggestions,
  favorites,
  onToggleFavorite,
}: MedicineRowProps) {
  const remedyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      remedyRef.current?.focus();
    }
  }, [autoFocus]);

  const trimmedName = (medicine.name || "").trim();
  const isFavorite = trimmedName
    ? favorites.some((n) => n.toLowerCase() === trimmedName.toLowerCase())
    : false;

  return (
    <div style={rowStyle}>
      <div style={{ position: "relative", flex: "1 1 220px" }}>
        <input
          ref={remedyRef}
          value={medicine.name || ""}
          onChange={(e) => {
            onChange(index, "name", e.target.value);
            onFocus(index);
          }}
          onFocus={() => onFocus(index)}
          placeholder="Remedy"
          style={{ ...inputStyle, paddingRight: trimmedName ? 34 : 12 }}
        />

        {trimmedName && (
          <button
            type="button"
            data-testid={`favorite-medicine-toggle-${index}`}
            aria-label={isFavorite ? "Unfavorite remedy" : "Favorite remedy"}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onToggleFavorite(trimmedName)}
            style={favoriteButtonStyle}
          >
            <Star size={15} fill={isFavorite ? "#f59e0b" : "none"} color={isFavorite ? "#f59e0b" : "#94a3b8"} />
          </button>
        )}

        {active && suggestions.length > 0 && (
          <div style={dropdownStyle}>
            {suggestions.slice(0, 6).map((s, i) => (
              <button
                key={`${s.name}-${i}`}
                style={suggestionStyle}
                type="button"
                title={s.reason}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(index, "name", s.name)}
              >
                {s.reason === "Favorite" ? "★ " : ""}{s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        value={medicine.potency || ""}
        onChange={(e) => onChange(index, "potency", e.target.value)}
        placeholder="Potency"
        style={{ ...inputStyle, flex: "0 1 110px" }}
      />

      <div style={dosageWrapStyle}>
        {PRIMARY_DOSAGE_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(index, "dosage", d)}
            style={{
              ...dosageButtonStyle,
              borderColor: medicine.dosage === d ? "#2d6a4f" : "#e2e8f0",
              background: medicine.dosage === d ? "#2d6a4f" : "#fff",
              color: medicine.dosage === d ? "#fff" : "#475569",
            }}
          >
            {d}
          </button>
        ))}
        <select
          value={MORE_DOSAGE_PRESETS.includes(medicine.dosage || "") ? medicine.dosage : ""}
          onChange={(e) => e.target.value && onChange(index, "dosage", e.target.value)}
          style={moreDosageStyle}
        >
          <option value="">More...</option>
          {MORE_DOSAGE_PRESETS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <input
        value={medicine.duration || ""}
        onChange={(e) => onChange(index, "duration", e.target.value)}
        placeholder="Duration"
        style={{ ...inputStyle, flex: "0 1 130px" }}
      />

      <button type="button" onClick={() => onRemove(index)} style={removeStyle}>
        Remove
      </button>
    </div>
  );
});

export default function PrescriptionEditor({
  value,
  onChange,
  suggestions = [],
}: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [focusedMedicineId, setFocusedMedicineId] = useState<string | null>(null);
  // Doctor Productivity: Favorite Medicines -- single-remedy favorites
  // (distinct from the existing Rx Templates feature, which saves whole
  // multi-medicine combos). favVersion forces favorites/mergedSuggestions
  // to recompute after a toggle, since favoriteMedicines.ts is plain
  // localStorage with no reactive subscription.
  const [favVersion, setFavVersion] = useState(0);
  const favorites = useMemo(() => loadFavoriteMedicineNames(), [favVersion]);
  const handleToggleFavorite = (name: string) => {
    toggleFavoriteMedicine(name);
    setFavVersion((v) => v + 1);
  };

  const mergedSuggestions = useMemo<Suggestion[]>(() => {
    const favSuggestions: Suggestion[] = favorites
      .filter((n) => !suggestions.some((s) => s.name.toLowerCase() === n.toLowerCase()))
      .map((n) => ({ name: n, score: 0, reason: "Favorite" }));
    return [...favSuggestions, ...suggestions];
  }, [favorites, suggestions]);

  const handleChange = (index: number, key: keyof Medicine, val: string) => {
    const updated = [...value];
    const current = { ...updated[index], [key]: val };
    if (key === "name" && val) {
      if (!current.potency) current.potency = "30C";
      if (!current.dosage) current.dosage = "1-1-1";
      if (!current.duration) current.duration = "5 Days";
    }
    updated[index] = current;
    onChange(updated);
  };

  const addMedicine = () => {
    const newMedicine = createMedicine();
    setFocusedMedicineId(newMedicine.id || null);
    onChange([...value, newMedicine]);
  };

  const removeMedicine = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div>
      {value.length === 0 && (
        <div style={emptyStyle}>
          No medicines added yet — start typing or select suggestion
        </div>
      )}

      {value.map((m, index) => (
        <MedicineRow
          key={m.id || index}
          active={activeIndex === index}
          autoFocus={(m.id || null) === focusedMedicineId}
          index={index}
          medicine={m}
          onChange={handleChange}
          onFocus={setActiveIndex}
          onRemove={removeMedicine}
          suggestions={mergedSuggestions}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
        />
      ))}

      <button type="button" onClick={addMedicine} style={addButtonStyle}>
        + Add Medicine
      </button>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
  padding: 12,
  border: "1.5px solid #e2e8f0",
  borderRadius: 12,
  background: "#fff",
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid #e2e8f0",
  background: "#f8fafc",
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 600,
  outline: "none",
  flex: 1,
  minWidth: 100,
};

const favoriteButtonStyle: React.CSSProperties = {
  position: "absolute",
  right: 6,
  top: "50%",
  transform: "translateY(-50%)",
  width: 26,
  height: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  zIndex: 9999,
  maxHeight: 180,
  overflowY: "auto",
  boxShadow: "0 12px 28px rgba(15,23,42,0.12)",
};

const suggestionStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  cursor: "pointer",
  border: "none",
  borderBottom: "1px solid #f1f5f9",
  background: "#fff",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 700,
  color: "#0f172a",
};

const dosageWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap",
};

const dosageButtonStyle: React.CSSProperties = {
  padding: "7px 9px",
  borderRadius: 8,
  border: "1.5px solid #e2e8f0",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const moreDosageStyle: React.CSSProperties = {
  padding: "7px 9px",
  borderRadius: 8,
  border: "1.5px solid #e2e8f0",
  background: "#fff",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
};

const removeStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "none",
  background: "#fef2f2",
  color: "#dc2626",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
};

const addButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "2px dashed #bfdbfe",
  background: "#eff6ff",
  color: "#2563eb",
  fontWeight: 800,
  cursor: "pointer",
};

const emptyStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "18px 0",
  color: "#94a3b8",
  fontSize: 13,
  fontStyle: "italic",
};
