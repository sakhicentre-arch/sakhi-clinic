/**
 * PrescriptionEditor.tsx
 * Sakhi Clinic — Clinical Prescription Management
 * Logic: Simple Default Export for Vite stability.
 */

import React from "react";
import { Medicine } from "../services/db";

interface PrescriptionEditorProps {
  value: Medicine[];
  onChange: (medicines: Medicine[]) => void;
}

const PrescriptionEditor: React.FC<PrescriptionEditorProps> = ({ value, onChange }) => {
  // Ensure at least one row exists for UI rendering
  const meds = value && value.length > 0 ? value : [];

  const update = (idx: number, patch: Partial<Medicine>) => {
    const newList = [...meds];
    newList[idx] = { ...newList[idx], ...patch };
    onChange(newList);
  };

  const addRow = () => {
    const newMed: Medicine = {
      id: crypto.randomUUID(),
      name: "",
      remedy: "", // Supporting both name/remedy for schema safety
      potency: "30C",
      dosage: "Daily",
      duration: "7 Days",
      notes: ""
    } as any;
    onChange([...meds, newMed]);
  };

  const removeRow = (idx: number) => {
    const newList = meds.filter((_, i) => i !== idx);
    onChange(newList);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", gap: "10px", fontWeight: "bold", fontSize: "12px", color: "#64748b" }}>
        <div style={{ flex: 2 }}>Remedy</div>
        <div style={{ flex: 1 }}>Potency</div>
        <div style={{ flex: 1 }}>Dosage</div>
        <div style={{ width: "30px" }}></div>
      </div>
      
      {meds.map((m, i) => (
        <div key={m.id || i} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input 
            style={INPUT_STYLE} 
            placeholder="Remedy" 
            value={m.remedy || m.name || ""} 
            onChange={e => update(i, { remedy: e.target.value, name: e.target.value })} 
          />
          <input 
            style={INPUT_STYLE} 
            value={m.potency || ""} 
            onChange={e => update(i, { potency: e.target.value })} 
          />
          <input 
            style={INPUT_STYLE} 
            value={m.dosage || ""} 
            onChange={e => update(i, { dosage: e.target.value })} 
          />
          <button 
            onClick={() => removeRow(i)} 
            style={{ border: "none", background: "#fee2e2", color: "#ef4444", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      ))}
      <button 
        onClick={addRow} 
        style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: "12px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: "pointer" }}
      >
        + Add Medicine
      </button>
    </div>
  );
};

const INPUT_STYLE = { width: "100%", padding: "8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px" };

// ✅ FIX: Use Default Export
export default PrescriptionEditor;