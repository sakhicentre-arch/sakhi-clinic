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
  PaymentSummary,
  OutstandingPatientEntry,
  PaymentPatientRef,
} from "../services/paymentService";
import { enqueueReminder, hasActiveReminder } from "../services/reminderQueueService";

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
          </MobileSection>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
