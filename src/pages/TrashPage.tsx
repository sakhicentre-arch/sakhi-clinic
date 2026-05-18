/**
 * TrashPage.tsx
 * Sakhi Clinic — Deleted Patients Recovery Screen
 * Shows soft-deleted patients with restore functionality.
 */

import React, { useEffect, useState } from "react";
import type { ActivePage } from "../store/uiStore";
import { Patient } from "../services/db";
import { getDeletedPatients, restorePatient } from "../services/patientService";

interface TrashPageProps {
  onNavigate?: (page: ActivePage) => void;
}

const TrashPage: React.FC<TrashPageProps> = ({ onNavigate }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const deleted = await getDeletedPatients();
      setPatients(deleted);
    } catch (err) {
      console.error("[TrashPage] Failed to load deleted patients:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await restorePatient(id);
      await load();
    } catch (err) {
      console.error("[TrashPage] Restore failed:", err);
      alert("⚠️ Failed to restore patient. Please try again.");
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return <div style={loadingStyle}>Loading deleted patients...</div>;
  }

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>🗑️ Trash</h1>
          <p style={subtitleStyle}>Deleted patients can be restored from here.</p>
        </div>
        <button
          onClick={() => {
            if (onNavigate) {
              onNavigate("dashboard" as ActivePage);
            } else {
              window.location.hash = "#/";
            }
          }}
          style={backButtonStyle}
        >
          ← Back to Dashboard
        </button>
      </header>

      {patients.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#475569" }}>
            No deleted patients found.
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
            Patients you delete will appear here for recovery.
          </div>
        </div>
      ) : (
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Gender</th>
                <th style={thStyle}>Age</th>
                <th style={thStyle}>Deleted At</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} style={trStyle}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>
                      {p.name || "—"}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ color: "#475569" }}>{p.phone || "—"}</div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ color: "#475569" }}>{p.gender || "—"}</div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ color: "#475569" }}>
                      {p.age != null ? `${p.age} yrs` : "—"}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>
                      {p.deletedAt
                        ? new Date(p.deletedAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleRestore(p.id)}
                      disabled={restoringId === p.id}
                      style={restoreButtonStyle(restoringId === p.id)}
                    >
                      {restoringId === p.id ? "Restoring..." : "↩️ Restore"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  padding: "32px 40px",
  background: "#f8fafc",
  minHeight: "100vh",
  fontFamily: "'Lora', serif",
};
const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 32,
};
const titleStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
  color: "#0f172a",
  margin: 0,
};
const subtitleStyle: React.CSSProperties = {
  color: "#64748b",
  marginTop: 6,
  fontSize: 14,
};
const backButtonStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "1.5px solid #e2e8f0",
  background: "#fff",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  color: "#475569",
};
const loadingStyle: React.CSSProperties = {
  padding: 100,
  textAlign: "center",
  fontSize: 16,
  color: "#64748b",
  fontWeight: 600,
};
const emptyStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "80px 40px",
  background: "#fff",
  borderRadius: 24,
  border: "1.5px solid #e2e8f0",
};
const tableWrapperStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  border: "1.5px solid #e2e8f0",
  overflow: "hidden",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.04)",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};
const thStyle: React.CSSProperties = {
  padding: "14px 20px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 900,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  background: "#f8fafc",
  borderBottom: "1.5px solid #e2e8f0",
};
const trStyle: React.CSSProperties = {
  borderBottom: "1px solid #f1f5f9",
};
const tdStyle: React.CSSProperties = {
  padding: "16px 20px",
  fontSize: 14,
  verticalAlign: "middle",
};
const restoreButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 10,
  border: "none",
  background: disabled ? "#cbd5e1" : "#2d6a4f",
  color: "#fff",
  fontWeight: 700,
  fontSize: 12,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "0.2s",
});

export default TrashPage;