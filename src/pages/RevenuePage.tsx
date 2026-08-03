/**
 * RevenuePage.tsx
 * Sakhi Clinic — Payment Dashboard (Module 6).
 *
 * NOT accounting software (see paymentService.ts's own header) -- six
 * cards over the same getPaymentSummary()/getOutstandingPatients()/
 * getPaymentDashboardDrilldowns() data the Doctor Action Dashboard and
 * Patient Ledger already use, so these numbers can never drift from what
 * a patient's own ledger shows. Every card opens a filtered patient list
 * (Module 6's explicit requirement), reusing FilteredPatientList exactly
 * like DashboardPage.tsx's action cards -- including its bulk "Send
 * Reminders" action for chasing outstanding payments over WhatsApp
 * (manual only, per Module 2).
 */

import React, { useEffect, useState } from "react";
import { ActivePage, useUIStore } from "../store/uiStore";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import FilteredPatientList, { FilteredListEntry } from "../components/FilteredPatientList";
import {
  getPaymentSummary,
  getOutstandingPatients,
  getPaymentDashboardDrilldowns,
  getPaymentHistoryInRange,
  PaymentSummary,
  OutstandingPatientEntry,
  PaymentPatientRef,
  PaymentHistoryEntry,
} from "../services/paymentService";
import { enqueueReminder, hasActiveReminder } from "../services/reminderQueueService";
import { exportPaymentsCsv } from "../services/csvExportService";
import { Download, Search } from "lucide-react";

interface Props {
  onNavigate?: (page: ActivePage) => void;
}

type PaymentCardKey = "billedToday" | "outstanding" | "collectedToday" | "collectedThisMonth" | "pendingCollectionToday";

interface PaymentCardConfig {
  key: PaymentCardKey;
  label: string;
  color: string;
  value: (summary: PaymentSummary | null) => string;
}

const CARDS: PaymentCardConfig[] = [
  { key: "billedToday", label: "Payments Today", color: "#2563eb", value: (s) => `₹${Math.round(s?.billedToday || 0).toLocaleString("en-IN")}` },
  { key: "outstanding", label: "Pending Payments", color: "#d97706", value: (s) => `${s?.pendingPaymentsCount ?? 0}` },
  { key: "outstanding", label: "Outstanding Amount", color: "#dc2626", value: (s) => `₹${Math.round(s?.outstandingAmount || 0).toLocaleString("en-IN")}` },
  { key: "collectedToday", label: "Collected Today", color: "#16a34a", value: (s) => `₹${Math.round(s?.collectedToday || 0).toLocaleString("en-IN")}` },
  { key: "collectedThisMonth", label: "Collected This Month", color: "#0d7377", value: (s) => `₹${Math.round(s?.collectedThisMonth || 0).toLocaleString("en-IN")}` },
  { key: "pendingCollectionToday", label: "Pending Collection", color: "#b91c1c", value: (s) => `₹${Math.round(s?.pendingCollectionToday || 0).toLocaleString("en-IN")}` },
];

const CARD_EMPTY_MESSAGE: Record<PaymentCardKey, string> = {
  billedToday: "No consultations billed today.",
  outstanding: "No outstanding payments.",
  collectedToday: "No payments collected today.",
  collectedThisMonth: "No payments collected this month.",
  pendingCollectionToday: "Nothing pending from today's visits.",
};

const CARD_TITLE: Record<PaymentCardKey, string> = {
  billedToday: "Billed Today",
  outstanding: "Outstanding Payments",
  collectedToday: "Collected Today",
  collectedThisMonth: "Collected This Month",
  pendingCollectionToday: "Pending Collection (Today)",
};

function buildPaymentReminderMessage(patientName: string, amountDetail: string): string {
  return `*Sakhi Homeopathic Clinic*\nHi ${patientName}, ${amountDetail}. Please arrange payment at your convenience or reply here if you've already paid.`;
}

export default function RevenuePage({ onNavigate }: Props) {
  const setActivePatientId = useUIStore((s) => s.setActivePatientId);

  const [loading, setLoading] = useState(true);
  const [activeClinic, setActiveClinic] = useState<string>("All");
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingPatientEntry[]>([]);
  const [drilldowns, setDrilldowns] = useState<{
    billedToday: PaymentPatientRef[];
    collectedToday: PaymentPatientRef[];
    collectedThisMonth: PaymentPatientRef[];
    pendingCollectionToday: PaymentPatientRef[];
  } | null>(null);
  const [activeCardKey, setActiveCardKey] = useState<PaymentCardKey | null>(null);

  // Payment Workflow completion: date-range history + search, separate
  // from the five fixed cards above (today/this-month/all-time-outstanding
  // buckets) -- a doctor picking a custom range needs getPaymentHistoryInRange,
  // not a widened version of getPaymentSummary's fixed buckets.
  const todayIso = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [rangeStart, setRangeStart] = useState(thirtyDaysAgoIso);
  const [rangeEnd, setRangeEnd] = useState(todayIso);
  const [rangeHistory, setRangeHistory] = useState<PaymentHistoryEntry[]>([]);
  const [rangeLoading, setRangeLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const clinicId = activeClinic === "All" ? undefined : activeClinic;
        const [summaryResult, outstandingResult, drilldownResult] = await Promise.all([
          getPaymentSummary(new Date(), clinicId),
          getOutstandingPatients(clinicId),
          getPaymentDashboardDrilldowns(new Date(), clinicId),
        ]);
        if (cancelled) return;
        setSummary(summaryResult);
        setOutstanding(outstandingResult);
        setDrilldowns(drilldownResult);
      } catch (err) {
        console.error("[RevenuePage] Failed to load payment dashboard:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeClinic]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRangeLoading(true);
      try {
        const clinicId = activeClinic === "All" ? undefined : activeClinic;
        const history = await getPaymentHistoryInRange(rangeStart, rangeEnd, clinicId);
        if (!cancelled) setRangeHistory(history);
      } catch (err) {
        console.error("[RevenuePage] Failed to load payment history range:", err);
      } finally {
        if (!cancelled) setRangeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd, activeClinic]);

  const visibleHistory = historySearch.trim()
    ? rangeHistory.filter((h) => h.patientName.toLowerCase().includes(historySearch.trim().toLowerCase()))
    : rangeHistory;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportPaymentsCsv();
    } catch (err) {
      console.error("[RevenuePage] CSV export failed:", err);
      alert("Couldn't export the CSV. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const activeEntries: FilteredListEntry[] =
    activeCardKey === "outstanding"
      ? outstanding.map((o) => ({
          patientId: o.patientId,
          name: o.name,
          phone: o.phone,
          subtitle: `₹${o.amount.toLocaleString("en-IN")} outstanding across ${o.consultationCount} visit${o.consultationCount === 1 ? "" : "s"}`,
        }))
      : activeCardKey && drilldowns
        ? drilldowns[activeCardKey].map((r) => ({ patientId: r.patientId, name: r.name, phone: r.phone, subtitle: r.detail }))
        : [];

  const handleSelectPatient = (patientId: string) => {
    setActivePatientId(patientId);
    onNavigate?.("patients");
  };

  // Manual reminders only (Module 2) -- queues a doctor-editable reminder
  // per selected patient and hands off to the Reminder Center for
  // review/edit/approve before anything is actually sent via WhatsApp.
  const handleSendReminders = async (patientIds: string[]) => {
    if (!activeCardKey) return;
    const entries = activeEntries;
    for (const patientId of patientIds) {
      const entry = entries.find((e) => e.patientId === patientId);
      if (!entry) continue;
      const alreadyQueued = await hasActiveReminder(patientId, "custom");
      if (alreadyQueued) continue;
      await enqueueReminder({
        patientId,
        patientName: entry.name,
        phone: entry.phone,
        type: "custom",
        message: buildPaymentReminderMessage(entry.name, entry.subtitle),
        dueAt: new Date().toISOString(),
        sourceRef: `revenue:${activeCardKey}`,
      });
    }
    setActiveCardKey(null);
    onNavigate?.("reminders");
  };

  if (activeCardKey) {
    return (
      <FilteredPatientList
        title={CARD_TITLE[activeCardKey]}
        entries={activeEntries}
        loading={loading}
        emptyMessage={CARD_EMPTY_MESSAGE[activeCardKey]}
        onSelectPatient={handleSelectPatient}
        onBack={() => setActiveCardKey(null)}
        selectable={activeCardKey === "outstanding" || activeCardKey === "pendingCollectionToday"}
        onSendReminders={handleSendReminders}
        searchable
      />
    );
  }

  return (
    <div className="sakhi-page" data-testid="revenue-page">
      <div className="sakhi-stack">
        <header className="sakhi-row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="sakhi-title">Payment Dashboard</div>
            <div className="sakhi-caption" style={{ marginTop: 4 }}>Every card opens the patients behind it</div>
          </div>
          <div className="sakhi-row" style={{ gap: 8 }}>
            <select
              value={activeClinic}
              onChange={(e) => setActiveClinic(e.target.value)}
              className="sakhi-input"
              style={{ width: 170, height: 44 }}
            >
              <option value="All">All Branches</option>
              <option value="Dabholi">Dabholi</option>
              <option value="City Light">City Light</option>
            </select>
            <button
              type="button"
              data-testid="revenue-export-csv"
              disabled={exporting}
              onClick={handleExport}
              className="sakhi-btn-secondary sakhi-tap sakhi-focus-ring"
              style={{ height: 44, width: "auto", padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Download size={15} /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </header>

        <ResponsiveContainer>
          <MobileSection>
            <MobileCard>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-2)" }}>
                {CARDS.map((card) => (
                  <button
                    key={card.label}
                    type="button"
                    data-testid={`revenue-card-${card.label.replace(/\s+/g, "-").toLowerCase()}`}
                    className="sakhi-tap sakhi-focus-ring sakhi-ripple"
                    onClick={() => setActiveCardKey(card.key)}
                    style={{
                      textAlign: "left",
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-3)",
                      border: `1px solid ${card.color}33`,
                      background: `${card.color}0f`,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 950, color: card.color }}>
                      {loading ? "…" : card.value(summary)}
                    </div>
                    <div className="sakhi-caption" style={{ marginTop: 2 }}>{card.label}</div>
                  </button>
                ))}
              </div>
            </MobileCard>

            {/* Payment History: date-range filter + search, separate from
                the fixed cards above -- getPaymentHistoryInRange, not a
                widened getPaymentSummary bucket. */}
            <MobileCard style={{ marginTop: "var(--space-3)" }}>
              <div className="sakhi-row" style={{ justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                <div className="sakhi-body" style={{ fontWeight: 950 }}>Payment History</div>
                <span className="sakhi-caption">{visibleHistory.length} record{visibleHistory.length === 1 ? "" : "s"}</span>
              </div>

              <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
                <input
                  type="date"
                  data-testid="revenue-range-start"
                  value={rangeStart}
                  max={rangeEnd}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="sakhi-input"
                  style={{ height: 40, width: 150, fontSize: 13 }}
                />
                <span className="sakhi-caption" style={{ alignSelf: "center" }}>to</span>
                <input
                  type="date"
                  data-testid="revenue-range-end"
                  value={rangeEnd}
                  min={rangeStart}
                  max={todayIso}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="sakhi-input"
                  style={{ height: 40, width: 150, fontSize: 13 }}
                />
              </div>

              <div className="sakhi-row" style={{ gap: 8, alignItems: "center", marginBottom: "var(--space-3)", padding: "0 var(--space-2)", border: "1px solid var(--border, #e2e8f0)", borderRadius: "var(--radius-2)", height: 40 }}>
                <Search size={14} color="#94a3b8" />
                <input
                  type="text"
                  data-testid="revenue-history-search"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search by patient name…"
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13 }}
                />
              </div>

              {rangeLoading ? (
                <div className="sakhi-caption">Loading…</div>
              ) : visibleHistory.length === 0 ? (
                <div className="sakhi-caption">No payment records in this range.</div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  <table width="100%" style={{ borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                      <tr style={{ textAlign: "left", fontSize: 11, color: "#94a3b8" }}>
                        <th style={{ padding: "8px" }}>Date</th>
                        <th style={{ padding: "8px" }}>Patient</th>
                        <th style={{ padding: "8px" }}>Fee</th>
                        <th style={{ padding: "8px" }}>Received</th>
                        <th style={{ padding: "8px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistory.map((h) => (
                        <tr
                          key={h.consultationId}
                          data-testid={`revenue-history-row-${h.consultationId}`}
                          onClick={() => handleSelectPatient(h.patientId)}
                          style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer", fontSize: 13 }}
                        >
                          <td style={{ padding: "8px" }}>{new Date(h.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                          <td style={{ padding: "8px", fontWeight: 700 }}>{h.patientName}</td>
                          <td style={{ padding: "8px" }}>₹{h.fee.toLocaleString("en-IN")}</td>
                          <td style={{ padding: "8px", color: h.amountReceived >= h.fee ? "#16a34a" : "#d97706" }}>₹{h.amountReceived.toLocaleString("en-IN")}</td>
                          <td style={{ padding: "8px" }}>{h.paymentStatus || "pending"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </MobileCard>
          </MobileSection>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
