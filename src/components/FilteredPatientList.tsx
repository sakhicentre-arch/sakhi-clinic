/**
 * FilteredPatientList.tsx
 * Sakhi Clinic — reusable drill-down list (Doctor Action Dashboard, Module 1).
 *
 * Every dashboard card ("Today's Follow-ups", "Overdue", "Missed Patients",
 * "Outstanding Payments", ...) needs the exact same shape of interaction:
 * a filtered list of patients, each clickable through to their record.
 * Rather than one bespoke list per filter type, this is that one reusable
 * view -- purely presentational, following FollowUpPage.tsx/
 * RemindersPage.tsx's sakhi-progress-card convention (not PatientPage.tsx's
 * bespoke list markup, which isn't extracted into a reusable component).
 * The caller (DashboardPage.tsx) computes WHICH patients belong on the
 * list and why (reusing followUpIntelligenceService.ts/paymentService.ts
 * for that) -- this component never queries data itself.
 *
 * Doubles as the Reminder Center's bulk-select surface (Module 2): passing
 * `selectable` + `onSendReminders` turns each row into a checkbox row with
 * a "Send Reminders" action bar, reusing the exact same list rendering
 * rather than a second, parallel selectable-list component.
 */

import { useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "./layout/ResponsivePrimitives";

export interface FilteredListEntry {
  patientId: string;
  name: string;
  phone?: string;
  /** Why this patient is on this particular list, e.g. "3 days overdue" or "₹500 outstanding". */
  subtitle: string;
  badge?: { label: string; tone: "success" | "muted" | "brand" };
}

export interface FilteredPatientListProps {
  title: string;
  subtitle?: string;
  entries: FilteredListEntry[];
  loading?: boolean;
  emptyMessage?: string;
  onSelectPatient: (patientId: string) => void;
  onBack: () => void;
  selectable?: boolean;
  onSendReminders?: (patientIds: string[]) => void;
}

export default function FilteredPatientList({
  title,
  subtitle,
  entries,
  loading,
  emptyMessage = "No patients match this right now.",
  onSelectPatient,
  onBack,
  selectable,
  onSendReminders,
}: FilteredPatientListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (patientId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) next.delete(patientId);
      else next.add(patientId);
      return next;
    });
  };

  return (
    <div className="sakhi-page" data-testid="filtered-patient-list">
      <div className="sakhi-stack">
        <header>
          <button
            type="button"
            onClick={onBack}
            className="sakhi-row sakhi-tap sakhi-focus-ring"
            style={{ gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
          >
            <ArrowLeft size={16} />
            <span className="sakhi-caption" style={{ fontWeight: 800 }}>Back to Dashboard</span>
          </button>
          <div className="sakhi-title">{title}</div>
          {subtitle && <div className="sakhi-caption" style={{ marginTop: 4 }}>{subtitle}</div>}
        </header>

        <ResponsiveContainer>
          <MobileSection>
            <MobileCard>
              <div className="sakhi-row" style={{ justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
                <span className="sakhi-caption">{entries.length} patient{entries.length === 1 ? "" : "s"}</span>
                {selectable && selected.size > 0 && onSendReminders && (
                  <button
                    type="button"
                    onClick={() => onSendReminders(Array.from(selected))}
                    className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring sakhi-ripple"
                    style={{ minHeight: 36, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <MessageCircle size={14} />
                    Send Reminders ({selected.size})
                  </button>
                )}
              </div>

              <div className="sakhi-progress-rail">
                {loading ? (
                  <div className="sakhi-caption">Loading…</div>
                ) : entries.length === 0 ? (
                  <div className="sakhi-caption">{emptyMessage}</div>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.patientId} className="sakhi-progress-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {selectable && (
                        <input
                          type="checkbox"
                          checked={selected.has(entry.patientId)}
                          onChange={() => toggle(entry.patientId)}
                          aria-label={`Select ${entry.name}`}
                          style={{ width: 18, height: 18, flexShrink: 0 }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectPatient(entry.patientId)}
                        className="sakhi-tap sakhi-focus-ring"
                        style={{ textAlign: "left", flex: 1, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <div className="sakhi-progress-title">
                          <div className="sakhi-progress-title-left">
                            <span className="sakhi-body" style={{ fontSize: 13, fontWeight: 950, color: "#0f172a" }}>{entry.name}</span>
                          </div>
                          {entry.badge && <span className="sakhi-pill" data-tone={entry.badge.tone}>{entry.badge.label}</span>}
                        </div>
                        <div className="sakhi-progress-snippet">{entry.subtitle}</div>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </MobileCard>
          </MobileSection>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
