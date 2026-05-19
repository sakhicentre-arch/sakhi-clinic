import React, { useMemo } from "react";
import { useConsultationStore } from "../store/useConsultationStore";
import { normalizePatientPhone } from "../utils/whatsapp";
import { usePatientStore } from "../store/usePatientStore";

export default function RevenuePage() {
  const consultations = useConsultationStore((s) => s.consultations);
  const patients = usePatientStore((s) => s.patients);

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = new Date().getMonth();

  const revenue = useMemo(() => {
    let todayPaid = 0;
    let todayPending = 0;
    let monthPaid = 0;
    let monthPending = 0;

    const outstandingMap: Record<string, number> = {};
    const recent: any[] = [];

    consultations.forEach((c) => {
      const date = c.date?.slice(0, 10);
      const fee = c.fee || 0;
      const status = c.paymentStatus || "pending";
      const consultMonth = new Date(c.date).getMonth();

      // TODAY
      if (date === today) {
        if (status === "paid") todayPaid += fee;
        else todayPending += fee;
      }

      // MONTH
      if (consultMonth === currentMonth) {
        if (status === "paid") monthPaid += fee;
        else monthPending += fee;
      }

      // OUTSTANDING
      if (status === "pending" && fee > 0) {
        outstandingMap[c.patientId] =
          (outstandingMap[c.patientId] || 0) + fee;
      }

      // RECENT
      recent.push({
        date: c.date,
        patientId: c.patientId,
        amount: fee,
        status,
      });
    });

    const outstandingPatients = Object.entries(outstandingMap)
      .map(([id, amount]) => {
        const p = patients.find((x) => x.id === id);
        return {
          name: p?.name || "Unknown",
          phone: p?.phone || "",
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const paidTotal = todayPaid + monthPaid;
    const pendingTotal = todayPending + monthPending;

    const paidPercent =
      paidTotal + pendingTotal === 0
        ? 0
        : Math.round((paidTotal / (paidTotal + pendingTotal)) * 100);

    return {
      todayPaid,
      todayPending,
      monthPaid,
      monthPending,
      outstandingPatients,
      recent: recent.slice(-10).reverse(),
      paidPercent,
    };
  }, [consultations, patients]);

  const sendReminder = (p: any) => {
    const rawNumber = p.phone || (p as any).mobile || "";
    const msg = `Dear ${p.name}, your pending amount of ₹${p.amount} is due. Please clear at Sakhi Clinic.`;
    const link = generateWhatsAppLink(rawNumber, msg);
    if (!link) return;
    window.open(link);
  };

  const S = {
    container: { padding: "30px", background: "#f8fafc", minHeight: "100vh" } as React.CSSProperties,
    card: {
      background: "#fff",
      padding: "20px",
      borderRadius: "16px",
      border: "1px solid #e2e8f0",
    } as React.CSSProperties,
  };

  return (
    <div style={S.container}>
      <h1 style={{ fontSize: "26px", fontWeight: "900" }}>💰 Revenue Dashboard</h1>

      {/* TODAY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "20px" }}>
        <div style={{ ...S.card, background: "#ecfdf5" }}>
          <p>Today Paid</p>
          <h2>₹ {revenue.todayPaid}</h2>
        </div>

        <div style={{ ...S.card, background: "#fef2f2" }}>
          <p>Today Pending</p>
          <h2>₹ {revenue.todayPending}</h2>
        </div>
      </div>

      {/* MONTH */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "20px" }}>
        <div style={S.card}>
          <p>Month Paid</p>
          <h2>₹ {revenue.monthPaid}</h2>
        </div>

        <div style={S.card}>
          <p>Month Pending</p>
          <h2 style={{ color: "red" }}>₹ {revenue.monthPending}</h2>
        </div>
      </div>

      {/* OUTSTANDING */}
      <div style={{ ...S.card, marginTop: "20px" }}>
        <h3>⚠ Outstanding Patients</h3>

        {revenue.outstandingPatients.map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
            <div>
              <b>{p.name}</b>
              <div>₹ {p.amount}</div>
            </div>

            <button onClick={() => sendReminder(p)}>Remind</button>
          </div>
        ))}
      </div>

      {/* FLOW */}
      <div style={{ ...S.card, marginTop: "20px" }}>
        <h3>📊 Payment Flow</h3>
        <div style={{ height: "10px", background: "#eee", borderRadius: "10px" }}>
          <div
            style={{
              width: `${revenue.paidPercent}%`,
              background: "green",
              height: "100%",
            }}
          />
        </div>
        <p>{revenue.paidPercent}% Paid</p>
      </div>

      {/* RECENT */}
      <div style={{ ...S.card, marginTop: "20px" }}>
        <h3>🧾 Recent Transactions</h3>

        {revenue.recent.map((r, i) => {
          const p = patients.find((x) => x.id === r.patientId);
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
              <span>{r.date?.slice(0, 10)}</span>
              <span>{p?.name}</span>
              <span>₹ {r.amount}</span>
              <span style={{ color: r.status === "paid" ? "green" : "red" }}>
                {r.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}