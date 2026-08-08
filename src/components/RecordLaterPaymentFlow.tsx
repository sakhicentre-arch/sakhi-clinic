/**
 * RecordLaterPaymentFlow.tsx
 * Sakhi Clinic — Doctor-requested: "Record Later Payment."
 *
 * Real workflow this closes: a patient doesn't pay at the consultation,
 * later pays via UPI/bank transfer and sends a screenshot on WhatsApp, and
 * the doctor forgets to update Sakhi -- leaving the ledger/outstanding/
 * revenue wrong and no receipt sent. This is a manual-upload flow only
 * (never a WhatsApp inbox integration).
 *
 * Architecture: this is a UI wizard only. It writes through the existing
 * canonical payment path -- paymentService.ts's `recordPayment()` -- via
 * `saveConsultation()`, the exact same write every other payment edit in
 * the app already uses (see paymentService.ts's own file header). There is
 * no second payment model, no parallel ledger, and no new Dexie table:
 * every field this flow writes already exists on Consultation (V54).
 * Screenshot compression reuses `compressPaymentScreenshot()`
 * (already used by ConsultationPage.tsx's inline payment fields) and the
 * "receipt" reuses the existing WhatsApp-via-reminder-queue mechanism
 * (`buildPaymentReceiptMessage` + `enqueueReminder`), exactly like
 * PatientPage.tsx's existing "Send Receipt" button.
 *
 * No OCR/AI text-extraction exists anywhere in this codebase, and none is
 * added here (zero-cost, no external service, no new privacy exposure --
 * see PAYMENT_SCREENSHOT_WORKFLOW_REPORT.md). The screenshot is evidence
 * the doctor visually checks; amount/date/mode/reference are always
 * doctor-entered, never invented.
 */

import React, { useMemo, useState } from "react";
import { AlertTriangle, Camera, Check, ChevronLeft, FolderOpen, Loader2, MessageCircle, Trash2, X } from "lucide-react";
import { usePatientStore } from "../store/usePatientStore";
import { usePatientSearch } from "../hooks/usePatientSearch";
import { haptic } from "../utils/haptics";
import { generateId } from "../utils/generateId";
import type { PaymentMode } from "../services/db";
import {
  compressPaymentScreenshot,
  findLikelyDuplicatePayment,
  getConsultationCollected,
  getConsultationOutstanding,
  recordPayment,
  buildPaymentReceiptMessage,
  type DuplicatePaymentCandidate,
} from "../services/paymentService";
import { enqueueReminder, hasActiveReminder } from "../services/reminderQueueService";
import { useConsultationStore } from "../store/useConsultationStore";

interface Props {
  /** Skips the patient-search step when opened from a screen that already
   * has a patient in context (e.g. Patient Ledger). */
  initialPatientId?: string;
  onClose: () => void;
  /** Optional: lets "Share Receipt" hand off to the Reminders screen the
   * same way PatientPage.tsx's existing "Send Receipt" button does. */
  onNavigateToReminders?: () => void;
}

type Step = "patient" | "visit" | "screenshot" | "review" | "success";

const MAX_RAW_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB -- a sanity cap before we even try to decode it

const PAYMENT_MODE_OPTIONS: Array<{ value: PaymentMode; label: string }> = [
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
];

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatDateLabel(d: string): string {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

export default function RecordLaterPaymentFlow({ initialPatientId, onClose, onNavigateToReminders }: Props) {
  const patients = usePatientStore((s) => s.patients);
  const consultations = useConsultationStore((s) => s.consultations);

  const [step, setStep] = useState<Step>(initialPatientId ? "visit" : "patient");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId || null);
  const [patientConfirmed, setPatientConfirmed] = useState(Boolean(initialPatientId));

  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null);

  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode | undefined>(undefined);
  const [date, setDate] = useState(todayDateOnly());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [duplicate, setDuplicate] = useState<DuplicatePaymentCandidate | null>(null);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [duplicateOverridden, setDuplicateOverridden] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [receiptQueued, setReceiptQueued] = useState(false);
  const [receiptNote, setReceiptNote] = useState<string | null>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  const selectedPatient = useMemo(
    () => patients.find((p) => String(p.id) === String(selectedPatientId)) || null,
    [patients, selectedPatientId]
  );

  const { searchTerm, setSearchTerm, filteredPatients, focusedIndex, handleSearchKeyDown } = usePatientSearch({
    patients,
    onOpen: (id) => {
      setSelectedPatientId(id);
    },
  });

  // Every consultation this patient has actually been billed for, most
  // recent first -- reuses the same store data the Patient Ledger reads,
  // no separate fetch. Outstanding ones are surfaced first since that's
  // the doctor's actual use case, but any billed visit can be picked (a
  // doctor may want to attach evidence to an already-settled visit too).
  const billedConsultations = useMemo(() => {
    if (!selectedPatientId) return [];
    return consultations
      .filter((c) => String(c.patientId) === String(selectedPatientId) && (c.fee || 0) > 0)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .sort((a, b) => {
        const ao = getConsultationOutstanding(a as any) > 0 ? 0 : 1;
        const bo = getConsultationOutstanding(b as any) > 0 ? 0 : 1;
        return ao - bo;
      });
  }, [consultations, selectedPatientId]);

  const selectedConsultation = useMemo(
    () => billedConsultations.find((c) => c.id === selectedConsultationId) || null,
    [billedConsultations, selectedConsultationId]
  );

  const outstandingForSelected = selectedConsultation ? getConsultationOutstanding(selectedConsultation as any) : 0;
  const alreadyReceivedForSelected = selectedConsultation ? getConsultationCollected(selectedConsultation as any) : 0;

  const parsedAmount = Number(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const dateValid = Boolean(date) && !Number.isNaN(new Date(date).getTime());

  const handleConfirmPatient = () => {
    if (!selectedPatientId) return;
    haptic("tap");
    setPatientConfirmed(true);
    setStep("visit");
  };

  const proceedFromVisit = (consultationId: string) => {
    setSelectedConsultationId(consultationId);
    setStep("screenshot");
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setScreenshotError(null);
    if (file.size > MAX_RAW_IMAGE_BYTES) {
      setScreenshotError("That image is too large. Please choose a smaller photo or screenshot.");
      return;
    }
    setScreenshotBusy(true);
    try {
      const dataUrl = await compressPaymentScreenshot(file);
      setScreenshotDataUrl(dataUrl);
    } catch {
      setScreenshotError("Could not read that image. Please try another file.");
    } finally {
      setScreenshotBusy(false);
    }
  };

  const runDuplicateCheck = async () => {
    if (!selectedPatientId || !amountValid || !dateValid) {
      setDuplicate(null);
      setDuplicateChecked(true);
      return;
    }
    const found = await findLikelyDuplicatePayment({
      patientId: selectedPatientId,
      amount: parsedAmount,
      date,
      referenceNumber: reference,
    });
    setDuplicate(found);
    setDuplicateChecked(true);
    setDuplicateOverridden(false);
  };

  const goToReview = () => {
    setDuplicateChecked(false);
    setDuplicate(null);
    setStep("review");
  };

  const canSubmit = amountValid && dateValid && !saving && (!duplicate || duplicateOverridden);

  const handleConfirmPayment = async () => {
    if (!selectedConsultation || !selectedPatient) return;

    // Duplicate check runs right before posting, using the doctor's final
    // edited values -- not just whatever the screenshot suggested.
    if (!duplicateChecked) {
      await runDuplicateCheck();
      return;
    }
    if (duplicate && !duplicateOverridden) return;

    setSaving(true);
    setSaveError(null);
    try {
      const newTotalReceived = alreadyReceivedForSelected + parsedAmount;
      const fee = selectedConsultation.fee || 0;
      const status = newTotalReceived >= fee ? "paid" : "partial";

      await recordPayment(selectedConsultation.id, {
        status,
        amountReceived: newTotalReceived,
        mode,
        date,
        referenceNumber: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        screenshotDataUrl: screenshotDataUrl || undefined,
      });

      // recordPayment() writes straight to Dexie via saveConsultation() --
      // the exact same canonical path every other payment edit uses -- but
      // that bypasses the zustand consultation store's cache. Without this,
      // the Patient Ledger (which reads from that store, not a fresh DB
      // query) would keep showing the pre-payment status until something
      // else happened to reload it. This is the one place this flow
      // touches app state outside the canonical service call, and it's a
      // read-refresh, not a second write path.
      await useConsultationStore.getState().loadPatientConsultations(String(selectedPatient.id));

      haptic("success");
      setStep("success");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not record this payment. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const receiptMessage = useMemo(() => {
    if (!selectedPatient || !selectedConsultation) return "";
    return buildPaymentReceiptMessage(selectedPatient.name || "Patient", {
      fee: selectedConsultation.fee,
      amountReceived: alreadyReceivedForSelected + (amountValid ? parsedAmount : 0),
      paymentMode: mode,
      paymentReferenceNumber: reference.trim() || undefined,
      paymentDate: date,
      date: selectedConsultation.date,
    } as any);
  }, [selectedPatient, selectedConsultation, alreadyReceivedForSelected, parsedAmount, amountValid, mode, reference, date]);

  const handleShareReceipt = async () => {
    if (!selectedPatient) return;
    setReceiptNote(null);
    try {
      const alreadyQueued = await hasActiveReminder(String(selectedPatient.id), "custom");
      if (alreadyQueued) {
        setReceiptNote("A message is already pending or approved for this patient.");
        return;
      }
      await enqueueReminder({
        id: generateId(),
        patientId: String(selectedPatient.id),
        patientName: selectedPatient.name || "Patient",
        phone: selectedPatient.phone,
        type: "custom",
        channel: "whatsapp",
        message: receiptMessage,
        dueAt: new Date().toISOString(),
        sourceRef: `payment-receipt:${selectedConsultation?.id}`,
      });
      setReceiptQueued(true);
      onNavigateToReminders?.();
    } catch {
      setReceiptNote("Couldn't queue the receipt. Please try again.");
    }
  };

  const stepIndex = { patient: 0, visit: 1, screenshot: 2, review: 3, success: 4 }[step];

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" data-testid="record-later-payment-flow">
      <div style={sheetStyle}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={headerStyle}>
          {step !== "patient" && step !== "success" && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => {
                if (step === "visit") setStep(initialPatientId ? "visit" : "patient");
                else if (step === "screenshot") setStep("visit");
                else if (step === "review") setStep("screenshot");
              }}
              style={backBtnStyle}
              disabled={step === "visit" && Boolean(initialPatientId)}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>Record Later Payment</div>
            {step !== "success" && (
              <div style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 700, marginTop: 2 }}>
                Step {stepIndex + 1} of 4
              </div>
            )}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={backBtnStyle} data-testid="record-payment-close">
            <X size={20} />
          </button>
        </div>

        <div style={bodyStyle}>
          {/* ── STEP 1: Select Patient ───────────────────────────────── */}
          {step === "patient" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
                Who made this payment?
              </div>
              <input
                autoFocus
                data-testid="record-payment-patient-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by name or phone…"
                className="sakhi-input sakhi-focus-ring"
                style={{ fontSize: 15 }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "45vh", overflowY: "auto" }}>
                {filteredPatients.slice(0, 30).map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`record-payment-patient-option-${p.id}`}
                    onClick={() => { haptic("tap"); setSelectedPatientId(String(p.id)); }}
                    className="sakhi-tap sakhi-focus-ring sakhi-ripple"
                    style={{
                      ...patientRowStyle,
                      borderColor: i === focusedIndex ? "#0d7377" : "#e2e8f0",
                      background: String(selectedPatientId) === String(p.id) ? "rgba(13,115,119,0.06)" : "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{p.name || "Unnamed"}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      {p.phone || "No phone on file"}
                      {p.lastVisit ? ` · Last visit ${formatDateLabel(p.lastVisit)}` : ""}
                    </div>
                  </button>
                ))}
                {filteredPatients.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>
                    No matching patient. Register them first from the Patients page.
                  </div>
                )}
              </div>

              {selectedPatient && (
                <div style={confirmCardStyle} data-testid="record-payment-patient-confirm-card">
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#0d7377", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Confirm this is the right patient
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#0f172a", marginTop: 6 }}>{selectedPatient.name}</div>
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
                    {selectedPatient.phone || "No phone on file"}
                    {selectedPatient.age ? ` · ${selectedPatient.age} yrs` : ""}
                    {selectedPatient.gender ? ` · ${selectedPatient.gender}` : ""}
                  </div>
                  {selectedPatient.lastVisit && (
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                      Last visit: {formatDateLabel(selectedPatient.lastVisit)}
                    </div>
                  )}
                  <button
                    type="button"
                    data-testid="record-payment-confirm-patient"
                    onClick={handleConfirmPatient}
                    style={primaryBtnStyle}
                  >
                    Confirm Patient
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: pick which visit this payment settles ─────────── */}
          {step === "visit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
                Which visit is this payment for?
              </div>
              {billedConsultations.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>
                  This patient has no billed consultations yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflowY: "auto" }}>
                  {billedConsultations.map((c) => {
                    const outstanding = getConsultationOutstanding(c as any);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        data-testid={`record-payment-visit-option-${c.id}`}
                        onClick={() => { haptic("tap"); proceedFromVisit(c.id); }}
                        className="sakhi-tap sakhi-focus-ring sakhi-ripple"
                        style={patientRowStyle}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{formatDateLabel(c.date)}</div>
                          {outstanding > 0 ? (
                            <span style={badgeAmberStyle}>{formatMoney(outstanding)} outstanding</span>
                          ) : (
                            <span style={badgeGreenStyle}>Fully paid</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          Fee {formatMoney(c.fee || 0)} · Received {formatMoney(getConsultationCollected(c as any))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Upload Payment Screenshot ────────────────────── */}
          {step === "screenshot" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
                Add the payment screenshot as proof (optional but recommended).
              </div>

              {!screenshotDataUrl && (
                <div style={{ display: "flex", gap: 10 }}>
                  <label style={uploadTileStyle} data-testid="record-payment-take-photo">
                    <Camera size={26} color="#0d7377" />
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0d7377", marginTop: 6 }}>Take Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: "none" }}
                      onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                  </label>
                  <label style={uploadTileStyle} data-testid="record-payment-upload-file">
                    <FolderOpen size={26} color="#0d7377" />
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: "#0d7377", marginTop: 6 }}>Upload Screenshot</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                  </label>
                </div>
              )}

              {screenshotBusy && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13 }}>
                  <Loader2 size={16} className="spin" /> Preparing image…
                </div>
              )}

              {screenshotError && (
                <div style={errorBannerStyle} role="alert">{screenshotError}</div>
              )}

              {screenshotDataUrl && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <img
                      src={screenshotDataUrl}
                      alt="Payment screenshot preview"
                      style={{ width: "100%", maxHeight: 320, objectFit: "contain", display: "block" }}
                      data-testid="record-payment-screenshot-preview"
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <label style={{ ...secondaryBtnStyle, flex: 1, textAlign: "center", cursor: "pointer" }}>
                      Replace image
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => handleFile(e.target.files?.[0])}
                      />
                    </label>
                    <button
                      type="button"
                      data-testid="record-payment-remove-screenshot"
                      onClick={() => setScreenshotDataUrl(null)}
                      style={{ ...secondaryBtnStyle, color: "#dc2626" }}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                {!screenshotDataUrl && !screenshotBusy && (
                  <button
                    type="button"
                    data-testid="record-payment-skip-screenshot"
                    onClick={goToReview}
                    style={secondaryBtnStyle}
                  >
                    Continue without screenshot
                  </button>
                )}
                {screenshotDataUrl && (
                  <button type="button" data-testid="record-payment-continue" onClick={goToReview} style={primaryBtnStyle}>
                    Continue
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3/4: Review, edit, confirm ──────────────────────── */}
          {step === "review" && selectedPatient && selectedConsultation && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={reviewCardStyle} data-testid="record-payment-review-card">
                <div style={reviewRowStyle}>
                  <span style={reviewLabelStyle}>Patient</span>
                  <span style={{ fontWeight: 800, color: "#0f172a" }}>{selectedPatient.name}</span>
                </div>
                <div style={reviewRowStyle}>
                  <span style={reviewLabelStyle}>Visit</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{formatDateLabel(selectedConsultation.date)}</span>
                </div>
                {alreadyReceivedForSelected > 0 && (
                  <div style={reviewRowStyle}>
                    <span style={reviewLabelStyle}>Already received</span>
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>{formatMoney(alreadyReceivedForSelected)}</span>
                  </div>
                )}

                <label style={fieldLabelStyle}>
                  Amount received now (₹)
                  <input
                    autoFocus
                    data-testid="record-payment-amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setDuplicateChecked(false); }}
                    placeholder={outstandingForSelected > 0 ? `Outstanding: ${formatMoney(outstandingForSelected)}` : "0"}
                    className="sakhi-input sakhi-focus-ring"
                    style={{ fontSize: 20, fontWeight: 800 }}
                  />
                </label>

                <label style={fieldLabelStyle}>
                  Payment date
                  <input
                    data-testid="record-payment-date"
                    type="date"
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setDuplicateChecked(false); }}
                    max={todayDateOnly()}
                    className="sakhi-input sakhi-focus-ring"
                  />
                </label>

                <div style={fieldLabelStyle}>
                  Payment method
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {PAYMENT_MODE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`record-payment-mode-${opt.value}`}
                        onClick={() => { haptic("tap"); setMode(opt.value); }}
                        className="sakhi-tap sakhi-focus-ring sakhi-ripple"
                        style={{
                          ...chipStyle,
                          borderColor: mode === opt.value ? "#0d7377" : "#e2e8f0",
                          background: mode === opt.value ? "#0d7377" : "#fff",
                          color: mode === opt.value ? "#fff" : "#475569",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label style={fieldLabelStyle}>
                  Transaction reference (optional)
                  <input
                    data-testid="record-payment-reference"
                    type="text"
                    value={reference}
                    onChange={(e) => { setReference(e.target.value); setDuplicateChecked(false); }}
                    placeholder="UPI / transaction ID"
                    className="sakhi-input sakhi-focus-ring"
                  />
                </label>

                <label style={fieldLabelStyle}>
                  Notes (optional)
                  <input
                    data-testid="record-payment-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="sakhi-input sakhi-focus-ring"
                  />
                </label>

                <div style={reviewRowStyle}>
                  <span style={reviewLabelStyle}>Screenshot</span>
                  <span style={{ fontWeight: 700, color: screenshotDataUrl ? "#15803d" : "#94a3b8" }}>
                    {screenshotDataUrl ? "✓ Attached" : "Not attached"}
                  </span>
                </div>
              </div>

              {!amountValid && amount.trim() !== "" && (
                <div style={errorBannerStyle} role="alert">Enter a valid amount greater than ₹0.</div>
              )}
              {!dateValid && (
                <div style={errorBannerStyle} role="alert">Enter a valid payment date.</div>
              )}

              {duplicateChecked && duplicate && (
                <div style={duplicateBannerStyle} data-testid="record-payment-duplicate-warning">
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <AlertTriangle size={18} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5, color: "#92400e" }}>Possible duplicate payment</div>
                      <div style={{ fontSize: 12.5, color: "#78350f", marginTop: 4 }}>
                        A payment of {formatMoney(duplicate.amountReceived)} on {formatDateLabel(duplicate.date)}
                        {duplicate.paymentReferenceNumber ? ` (ref: ${duplicate.paymentReferenceNumber})` : ""} is already recorded for this patient.
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#92400e" }}>
                        <input
                          type="checkbox"
                          data-testid="record-payment-duplicate-override"
                          checked={duplicateOverridden}
                          onChange={(e) => setDuplicateOverridden(e.target.checked)}
                        />
                        This is genuinely a different payment — record it anyway
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {saveError && (
                <div style={errorBannerStyle} role="alert" data-testid="record-payment-save-error">{saveError}</div>
              )}

              <button
                type="button"
                data-testid="record-payment-confirm"
                disabled={!canSubmit}
                onClick={handleConfirmPayment}
                style={{ ...primaryBtnStyle, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? "pointer" : "not-allowed" }}
              >
                {saving ? "Recording…" : duplicateChecked || duplicate ? "Confirm & Record Payment" : "Check & Continue"}
              </button>
            </div>
          )}

          {/* ── SUCCESS ───────────────────────────────────────────────── */}
          {step === "success" && selectedPatient && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "20px 0" }}>
              <div style={successIconStyle}>
                <Check size={32} color="#fff" />
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", textAlign: "center" }}>
                Payment recorded successfully
              </div>
              <div style={{ fontSize: 13, color: "#64748b", textAlign: "center" }}>
                {formatMoney(parsedAmount)} recorded for {selectedPatient.name}
              </div>

              {receiptNote && <div style={{ fontSize: 12.5, color: "#b45309", fontWeight: 700 }}>{receiptNote}</div>}
              {receiptQueued && (
                <div style={{ fontSize: 12.5, color: "#15803d", fontWeight: 700 }}>
                  Receipt queued — review and send it from Reminders.
                </div>
              )}

              <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 6 }}>
                <button
                  type="button"
                  data-testid="record-payment-view-receipt"
                  onClick={() => setShowReceiptPreview(true)}
                  style={{ ...secondaryBtnStyle, flex: 1 }}
                >
                  View Receipt
                </button>
                <button
                  type="button"
                  data-testid="record-payment-share-receipt"
                  disabled={receiptQueued}
                  onClick={handleShareReceipt}
                  style={{ ...primaryBtnStyle, flex: 1, opacity: receiptQueued ? 0.6 : 1 }}
                >
                  <MessageCircle size={15} /> Share Receipt
                </button>
              </div>
              <button type="button" data-testid="record-payment-done" onClick={onClose} style={{ ...secondaryBtnStyle, width: "100%" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      {showReceiptPreview && (
        <div style={overlayStyle} onClick={() => setShowReceiptPreview(false)}>
          <div style={{ ...sheetStyle, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={headerStyle}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>Receipt Preview</div>
              <button
                type="button"
                aria-label="Close"
                data-testid="record-payment-receipt-preview-close"
                onClick={() => setShowReceiptPreview(false)}
                style={backBtnStyle}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ ...bodyStyle, whiteSpace: "pre-wrap", fontSize: 13.5, color: "#0f172a", lineHeight: 1.6 }} data-testid="record-payment-receipt-text">
              {receiptMessage}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
  display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2000,
};
const sheetStyle: React.CSSProperties = {
  background: "#fff", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0",
  maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 -12px 40px rgba(0,0,0,0.2)",
};
const headerStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, padding: "14px 16px",
  borderBottom: "1px solid #f1f5f9", flexShrink: 0,
};
const backBtnStyle: React.CSSProperties = {
  width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "none", borderRadius: 12, color: "#475569", cursor: "pointer", flexShrink: 0,
};
const bodyStyle: React.CSSProperties = { padding: 16, overflowY: "auto", flex: 1 };
const patientRowStyle: React.CSSProperties = {
  textAlign: "left", padding: "12px 14px", borderRadius: 14, border: "1.5px solid #e2e8f0",
  background: "#fff", cursor: "pointer", width: "100%", minHeight: 56,
};
const confirmCardStyle: React.CSSProperties = {
  background: "rgba(13,115,119,0.06)", border: "1.5px solid rgba(13,115,119,0.25)",
  borderRadius: 16, padding: 16,
};
const primaryBtnStyle: React.CSSProperties = {
  width: "100%", minHeight: 52, borderRadius: 14, border: "none", background: "#0d7377",
  color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", marginTop: 8,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
};
const secondaryBtnStyle: React.CSSProperties = {
  minHeight: 48, borderRadius: 14, border: "1.5px solid #e2e8f0", background: "#fff",
  color: "#475569", fontWeight: 800, fontSize: 13.5, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 16px",
};
const uploadTileStyle: React.CSSProperties = {
  flex: 1, minHeight: 96, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  borderRadius: 16, border: "2px dashed rgba(13,115,119,0.35)", background: "rgba(13,115,119,0.05)", cursor: "pointer",
};
const errorBannerStyle: React.CSSProperties = {
  background: "#fef2f2", border: "1.5px solid #fecaca", color: "#991b1b",
  borderRadius: 12, padding: "10px 14px", fontSize: 12.5, fontWeight: 700,
};
const duplicateBannerStyle: React.CSSProperties = {
  background: "rgba(245,158,11,0.08)", border: "1.5px solid rgba(245,158,11,0.35)", borderRadius: 14, padding: 14,
};
const reviewCardStyle: React.CSSProperties = {
  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16,
  display: "flex", flexDirection: "column", gap: 12,
};
const reviewRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const reviewLabelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 };
const fieldLabelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4 };
const chipStyle: React.CSSProperties = { padding: "10px 16px", borderRadius: 999, border: "1.5px solid", fontWeight: 800, fontSize: 13, cursor: "pointer", minHeight: 44 };
const badgeAmberStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "#92400e", background: "#fef3c7", padding: "3px 8px", borderRadius: 6 };
const badgeGreenStyle: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "#166534", background: "#dcfce7", padding: "3px 8px", borderRadius: 6 };
const successIconStyle: React.CSSProperties = {
  width: 64, height: 64, borderRadius: "50%", background: "#22c55e",
  display: "flex", alignItems: "center", justifyContent: "center",
};
