/**
 * RubricReviewPage.tsx — Rubric Intelligence Engine (RC2 Phase 1), Phase 6.
 *
 * UI-only: every action here calls into rubricApprovalService.ts,
 * rubricSearchService.ts, or rubricHistoryService.ts. No approval-queue
 * logic lives in this file. Structurally a near-literal mirror of
 * RemindersPage.tsx (tabs-by-status, bulk-select checkboxes, edit-in-
 * place, per-status action buttons, the same BULK_STAGGER_MS-less
 * simplicity since approving a rubric has no external send step) --
 * same data-testid naming convention, swapped from "reminder-" to
 * "rubric-", for consistency with this codebase's existing E2E patterns.
 *
 * "Add Manual Rubric" is deliberately NOT here -- a manual rubric needs a
 * consultation/patient context this standalone review page doesn't have.
 * That affordance lives in ConsultationPage.tsx (Phase 7), where the
 * doctor is already looking at a specific patient's specific visit.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  ListChecks,
  Check,
  X,
  RotateCcw,
  Trash2,
  Pencil,
  Star,
  Search,
  Combine,
  Split,
} from "lucide-react";
import { MobileCard, MobileSection, ResponsiveContainer } from "../components/layout/ResponsivePrimitives";
import { RubricEntry, RubricStatus, RubricCategory } from "../services/db";
import {
  listRubricsByStatus,
  approveRubric,
  rejectRubric,
  undoRubricDecision,
  editRubric,
  togglePinRubric,
  deleteRubric,
  mergeRubrics,
  splitRubric,
} from "../services/rubricApprovalService";
import { searchRubrics } from "../services/rubricSearchService";
import { RUBRIC_CATEGORY_LABELS, ALL_RUBRIC_CATEGORIES } from "../data/rubricVocabulary";
import { confidenceLabel } from "../services/rubricConfidenceService";
import { usePatientStore } from "../store/usePatientStore";

const TAB_ORDER: RubricStatus[] = ["pending", "approved", "rejected"];
const TAB_LABELS: Record<RubricStatus, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function CategorySelect({ value, onChange, testId }: { value: RubricCategory; onChange: (c: RubricCategory) => void; testId: string }) {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value as RubricCategory)}
      className="sakhi-input"
      style={{ minHeight: 40 }}
    >
      {ALL_RUBRIC_CATEGORIES.map((c) => (
        <option key={c} value={c}>{RUBRIC_CATEGORY_LABELS[c]}</option>
      ))}
    </select>
  );
}

export default function RubricReviewPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RubricStatus>("pending");
  const [rubrics, setRubrics] = useState<RubricEntry[]>([]);
  const [countsByTab, setCountsByTab] = useState<Record<RubricStatus, number>>({ pending: 0, approved: 0, rejected: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ text: "", category: "mind" as RubricCategory });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RubricEntry[] | null>(null);

  const [composeStep, setComposeStep] = useState<"closed" | "merge" | "split">("closed");
  const [mergeDraft, setMergeDraft] = useState({ category: "mind" as RubricCategory, text: "" });
  const [mergeBusy, setMergeBusy] = useState(false);
  const [splitTargetId, setSplitTargetId] = useState<string | null>(null);
  const [splitParts, setSplitParts] = useState<{ category: RubricCategory; text: string }[]>([
    { category: "mind", text: "" },
    { category: "mind", text: "" },
  ]);
  const [splitBusy, setSplitBusy] = useState(false);

  const patients = usePatientStore((s) => s.patients);
  const patientById = useMemo(() => new Map(patients.map((p) => [String(p.id), p])), [patients]);

  const load = async (tab: RubricStatus = activeTab) => {
    setLoading(true);
    try {
      const [list, ...allCounts] = await Promise.all([
        listRubricsByStatus(tab),
        ...TAB_ORDER.map((s) => listRubricsByStatus(s)),
      ]);
      setRubrics(list);
      const counts = {} as Record<RubricStatus, number>;
      TAB_ORDER.forEach((s, i) => { counts[s] = allCounts[i].length; });
      setCountsByTab(counts);
    } catch (err) {
      console.error("[RubricReviewPage] Failed to load rubrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedIds(new Set());
    void load(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    searchRubrics(query).then((results) => {
      if (!cancelled) setSearchResults(results);
    });
    return () => { cancelled = true; };
  }, [query]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (r: RubricEntry) => {
    setEditingId(r.id);
    setEditDraft({ text: r.text, category: r.category });
  };

  const handleSaveEdit = async (id: string) => {
    if (!editDraft.text.trim()) return;
    setSavingEditId(id);
    try {
      await editRubric(id, { text: editDraft.text, category: editDraft.category });
      setEditingId(null);
      await load(activeTab);
    } finally {
      setSavingEditId(null);
    }
  };

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setActionNote("");
    try {
      await action();
      await load(activeTab);
    } catch (err) {
      setActionNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkAction = async (action: (id: string) => Promise<unknown>) => {
    setBulkBusy(true);
    setActionNote("");
    try {
      const ids = Array.from(selectedIds);
      let succeeded = 0;
      let firstError: unknown = null;
      for (const id of ids) {
        try {
          await action(id);
          succeeded++;
        } catch (err) {
          firstError = firstError ?? err;
        }
      }
      if (firstError) {
        setActionNote(`${succeeded} of ${ids.length} completed; ${ids.length - succeeded} failed.`);
      }
      setSelectedIds(new Set());
      await load(activeTab);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeDraft.text.trim() || selectedIds.size < 2) return;
    setMergeBusy(true);
    try {
      await mergeRubrics(Array.from(selectedIds), mergeDraft);
      setComposeStep("closed");
      setSelectedIds(new Set());
      setMergeDraft({ category: "mind", text: "" });
      await load(activeTab);
    } finally {
      setMergeBusy(false);
    }
  };

  const startSplit = (r: RubricEntry) => {
    setSplitTargetId(r.id);
    setSplitParts([{ category: r.category, text: r.text }, { category: r.category, text: "" }]);
    setComposeStep("split");
  };

  const handleSplit = async () => {
    if (!splitTargetId) return;
    const validParts = splitParts.filter((p) => p.text.trim());
    if (validParts.length < 2) return;
    setSplitBusy(true);
    try {
      await splitRubric(splitTargetId, validParts);
      setComposeStep("closed");
      setSplitTargetId(null);
      await load(activeTab);
    } finally {
      setSplitBusy(false);
    }
  };

  const displayedRubrics = searchResults !== null ? searchResults : rubrics;

  return (
    <div className="sakhi-page" data-testid="rubric-review-page">
      <div className="sakhi-stack">
        <header>
          <div className="sakhi-title">Rubric Review</div>
          <div className="sakhi-caption" style={{ marginTop: 4 }}>
            AI-suggested and manually-entered rubrics await your review
          </div>
        </header>

        <ResponsiveContainer>
          <MobileSection>
            {/* ================= Search ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: 8, alignItems: "center" }}>
                <Search size={16} color="#94a3b8" />
                <input
                  type="text"
                  data-testid="rubric-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search rubrics by text or category…"
                  className="sakhi-input"
                  style={{ flex: 1, minHeight: 40 }}
                />
              </div>
            </MobileCard>

            {/* ================= Merge compose ================= */}
            {composeStep === "merge" && (
              <MobileCard data-testid="rubric-merge-compose">
                <div className="sakhi-row" style={{ gap: 8 }}>
                  <Combine size={16} />
                  <div className="sakhi-body" style={{ fontWeight: 950 }}>Merge {selectedIds.size} Rubrics</div>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  <CategorySelect testId="rubric-merge-category" value={mergeDraft.category} onChange={(category) => setMergeDraft((d) => ({ ...d, category }))} />
                  <textarea
                    data-testid="rubric-merge-text"
                    value={mergeDraft.text}
                    onChange={(e) => setMergeDraft((d) => ({ ...d, text: e.target.value }))}
                    placeholder="Combined rubric text…"
                    className="sakhi-input"
                    style={{ minHeight: 60 }}
                  />
                  <div className="sakhi-row" style={{ gap: 8 }}>
                    <button type="button" data-testid="rubric-merge-confirm" disabled={mergeBusy || !mergeDraft.text.trim()} onClick={handleMerge} className="sakhi-btn-primary sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", padding: "0 16px" }}>
                      {mergeBusy ? "Merging…" : "Confirm Merge"}
                    </button>
                    <button type="button" onClick={() => setComposeStep("closed")} className="sakhi-caption" style={{ background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              </MobileCard>
            )}

            {/* ================= Split compose ================= */}
            {composeStep === "split" && (
              <MobileCard data-testid="rubric-split-compose">
                <div className="sakhi-row" style={{ gap: 8 }}>
                  <Split size={16} />
                  <div className="sakhi-body" style={{ fontWeight: 950 }}>Split Rubric</div>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {splitParts.map((part, idx) => (
                    <div key={idx} className="sakhi-row" style={{ gap: 8 }}>
                      <CategorySelect testId={`rubric-split-category-${idx}`} value={part.category} onChange={(category) => setSplitParts((ps) => ps.map((p, i) => (i === idx ? { ...p, category } : p)))} />
                      <input
                        data-testid={`rubric-split-text-${idx}`}
                        value={part.text}
                        onChange={(e) => setSplitParts((ps) => ps.map((p, i) => (i === idx ? { ...p, text: e.target.value } : p)))}
                        placeholder="Rubric text…"
                        className="sakhi-input"
                        style={{ flex: 1, minHeight: 40 }}
                      />
                    </div>
                  ))}
                  <button type="button" onClick={() => setSplitParts((ps) => [...ps, { category: "mind", text: "" }])} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 36, width: "auto" }}>
                    + Add part
                  </button>
                  <div className="sakhi-row" style={{ gap: 8 }}>
                    <button type="button" data-testid="rubric-split-confirm" disabled={splitBusy || splitParts.filter((p) => p.text.trim()).length < 2} onClick={handleSplit} className="sakhi-btn-primary sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", padding: "0 16px" }}>
                      {splitBusy ? "Splitting…" : "Confirm Split"}
                    </button>
                    <button type="button" onClick={() => { setComposeStep("closed"); setSplitTargetId(null); }} className="sakhi-caption" style={{ background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              </MobileCard>
            )}

            {/* ================= Queue ================= */}
            <MobileCard>
              <div className="sakhi-row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)", justifyContent: "space-between" }}>
                <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
                  <ListChecks size={18} />
                  <div className="sakhi-body" style={{ fontWeight: 950 }}>Rubric queue</div>
                </div>
                {selectedIds.size >= 2 && (
                  <button
                    type="button"
                    data-testid="rubric-merge-start"
                    onClick={() => { setMergeDraft({ category: "mind", text: rubrics.filter((r) => selectedIds.has(r.id)).map((r) => r.text).join("; ") }); setComposeStep("merge"); }}
                    className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring"
                    style={{ minHeight: 36, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Combine size={14} /> Merge ({selectedIds.size})
                  </button>
                )}
              </div>

              {searchResults === null && (
                <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {TAB_ORDER.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="sakhi-chip sakhi-tap sakhi-focus-ring sakhi-ripple"
                      data-selected={String(activeTab === status)}
                      data-tone="brand"
                      onClick={() => setActiveTab(status)}
                    >
                      {TAB_LABELS[status]} ({countsByTab[status]})
                    </button>
                  ))}
                </div>
              )}

              {actionNote && (
                <div className="sakhi-caption" style={{ marginTop: "var(--space-2)", color: "#475569", fontWeight: 800 }}>{actionNote}</div>
              )}

              {searchResults === null && (activeTab === "pending" || activeTab === "approved") && rubrics.length > 0 && (
                <div className="sakhi-row" style={{ gap: 10, marginTop: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    data-testid="rubrics-select-all"
                    onClick={() => setSelectedIds(selectedIds.size === rubrics.length ? new Set() : new Set(rubrics.map((r) => r.id)))}
                    className="sakhi-caption"
                    style={{ background: "none", border: "none", padding: 0, color: "#0d7377", fontWeight: 800, cursor: "pointer" }}
                  >
                    {selectedIds.size === rubrics.length ? "Deselect all" : "Select all"}
                  </button>
                  {selectedIds.size > 0 && activeTab === "pending" && (
                    <>
                      <button type="button" data-testid="rubrics-bulk-approve" disabled={bulkBusy} onClick={() => handleBulkAction((id) => approveRubric(id))} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 36, width: "auto", padding: "0 14px" }}>
                        {bulkBusy ? "Working…" : `Approve ${selectedIds.size} selected`}
                      </button>
                      <button type="button" data-testid="rubrics-bulk-reject" disabled={bulkBusy} onClick={() => handleBulkAction((id) => rejectRubric(id))} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 36, width: "auto", padding: "0 14px" }}>
                        {bulkBusy ? "Working…" : `Reject ${selectedIds.size} selected`}
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="sakhi-progress-rail" style={{ marginTop: "var(--space-3)" }}>
                {loading && searchResults === null ? (
                  <div className="sakhi-caption">Loading…</div>
                ) : displayedRubrics.length === 0 ? (
                  <div className="sakhi-caption">{searchResults !== null ? "No rubrics match your search." : "No rubrics in this queue."}</div>
                ) : (
                  displayedRubrics.map((r) => {
                    const patientName = patientById.get(r.patientId)?.name || "Unknown Patient";
                    return (
                      <div key={r.id} className="sakhi-progress-card" data-testid={`rubric-row-${r.id}`}>
                        <div className="sakhi-progress-title">
                          <div className="sakhi-progress-title-left">
                            {(r.status === "pending" || r.status === "approved") && searchResults === null && (
                              <input
                                type="checkbox"
                                data-testid={`rubric-select-${r.id}`}
                                checked={selectedIds.has(r.id)}
                                onChange={() => toggleSelected(r.id)}
                                aria-label={`Select rubric ${r.text}`}
                                style={{ width: 16, height: 16, cursor: "pointer" }}
                              />
                            )}
                            <span className="sakhi-pill" data-tone="brand">{RUBRIC_CATEGORY_LABELS[r.category]}</span>
                            <span className="sakhi-pill" data-tone="muted">{r.source === "ai" ? "AI" : "Manual"}</span>
                            {r.pinned && <Star size={13} fill="#f59e0b" color="#f59e0b" />}
                          </div>
                          <span className="sakhi-caption">{formatDateTime(r.updatedAt)}</span>
                        </div>

                        <div className="sakhi-caption" style={{ marginTop: 2 }}>{patientName}</div>

                        {editingId === r.id ? (
                          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                            <CategorySelect testId={`rubric-edit-category-${r.id}`} value={editDraft.category} onChange={(category) => setEditDraft((d) => ({ ...d, category }))} />
                            <textarea
                              data-testid={`rubric-edit-textarea-${r.id}`}
                              value={editDraft.text}
                              onChange={(e) => setEditDraft((d) => ({ ...d, text: e.target.value }))}
                              className="sakhi-input"
                              style={{ width: "100%", minHeight: 60, fontSize: 13, resize: "vertical" }}
                            />
                            <div className="sakhi-row" style={{ gap: 8 }}>
                              <button type="button" disabled={savingEditId === r.id || !editDraft.text.trim()} onClick={() => handleSaveEdit(r.id)} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 36, width: "auto", padding: "0 12px" }}>
                                {savingEditId === r.id ? "Saving…" : "Save"}
                              </button>
                              <button type="button" onClick={() => setEditingId(null)} className="sakhi-caption" style={{ background: "none", border: "none", padding: "0 8px", color: "#64748b", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="sakhi-progress-snippet" style={{ fontWeight: 800, color: "#0f172a" }}>{r.text}</div>
                            {r.source === "ai" && (
                              <div className="sakhi-caption" style={{ marginTop: 4 }}>
                                {r.reason} — <strong>{confidenceLabel(r.confidence || 0)}</strong> ({Math.round((r.confidence || 0) * 100)}%)
                                {r.matchedSentence && <div style={{ marginTop: 2, fontStyle: "italic" }}>"{r.matchedSentence}"</div>}
                              </div>
                            )}
                            {r.doctorNote && <div className="sakhi-caption" style={{ marginTop: 4 }}>Note: {r.doctorNote}</div>}
                          </>
                        )}

                        <div className="sakhi-row" style={{ gap: 8, flexWrap: "wrap", marginTop: "var(--space-2)" }}>
                          {r.status === "pending" && editingId !== r.id && (
                            <>
                              <button type="button" data-testid={`rubric-edit-${r.id}`} disabled={busyId === r.id} onClick={() => startEdit(r)} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <Pencil size={14} /> Edit
                              </button>
                              <button type="button" data-testid={`rubric-approve-${r.id}`} disabled={busyId === r.id} onClick={() => runAction(r.id, () => approveRubric(r.id))} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <Check size={14} /> Approve
                              </button>
                              <button type="button" data-testid={`rubric-reject-${r.id}`} disabled={busyId === r.id} onClick={() => runAction(r.id, () => rejectRubric(r.id))} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <X size={14} /> Reject
                              </button>
                            </>
                          )}
                          {(r.status === "approved" || r.status === "rejected") && (
                            <button type="button" data-testid={`rubric-undo-${r.id}`} disabled={busyId === r.id} onClick={() => runAction(r.id, () => undoRubricDecision(r.id))} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <RotateCcw size={14} /> Undo
                            </button>
                          )}
                          {r.status === "approved" && (
                            <button type="button" data-testid={`rubric-split-${r.id}`} disabled={busyId === r.id} onClick={() => startSplit(r)} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <Split size={14} /> Split
                            </button>
                          )}
                          <button type="button" data-testid={`rubric-pin-${r.id}`} disabled={busyId === r.id} onClick={() => runAction(r.id, () => togglePinRubric(r.id, !r.pinned))} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Star size={14} fill={r.pinned ? "#f59e0b" : "none"} /> {r.pinned ? "Unpin" : "Pin"}
                          </button>
                          <button type="button" data-testid={`rubric-delete-${r.id}`} disabled={busyId === r.id} onClick={() => runAction(r.id, () => deleteRubric(r.id))} className="sakhi-btn-secondary sakhi-btn-compact sakhi-tap sakhi-focus-ring" style={{ minHeight: 40, width: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "#dc2626" }}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </MobileCard>
          </MobileSection>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
