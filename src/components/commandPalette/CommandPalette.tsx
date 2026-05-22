import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, CornerDownLeft } from "lucide-react";
import { ActivePage, useUIStore } from "../../store/uiStore";
import { usePatientStore } from "../../store/usePatientStore";
import { QueueEntry, useQueueStore } from "../../store/queueStore";
import { db } from "../../services/db";
import useKeyboardInset from "../../hooks/useKeyboardInset";
import { haptic } from "../../utils/haptics";

type PaletteItem =
  | {
      kind: "queue";
      key: string;
      title: string;
      subtitle?: string;
      hint?: string;
      entry: QueueEntry;
      actionLabel: string;
      run: () => void;
    }
  | {
      kind: "patient";
      key: string;
      title: string;
      subtitle?: string;
      hint?: string;
      patientId: string;
      actionLabel: string;
      run: () => void;
    }
  | {
      kind: "consultation";
      key: string;
      title: string;
      subtitle?: string;
      hint?: string;
      patientId: string;
      actionLabel: string;
      run: () => void;
    };

export default function CommandPalette({
  onNavigate,
  onSelectPatient,
}: {
  onNavigate: (page: ActivePage) => void;
  onSelectPatient: (patientId: string) => void;
}) {
  const isOpen = useUIStore((s) => s.globalSearchOpen);
  const setOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const setActivePatientId = useUIStore((s) => s.setActivePatientId);
  const setActiveAppointmentId = useUIStore((s) => s.setActiveAppointmentId);
  const patients = usePatientStore((s) => s.patients);
  const queue = useQueueStore((s) => s.queue);
  const keyboard = useKeyboardInset();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentConsultations, setRecentConsultations] = useState<
    Array<{ patientId: string; date: string; chiefComplaint?: string }>
  >([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  };

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => inputRef.current?.focus(), 0);
    setLoadingRecent(true);
    db.consultations
      .orderBy("date")
      .reverse()
      .limit(12)
      .toArray()
      .then((rows) => {
        const safe = (rows || [])
          .filter((c) => !c.deletedAt)
          .map((c) => ({
            patientId: String(c.patientId),
            date: String(c.date || ""),
            chiefComplaint: c.chiefComplaint || "",
          }));
        setRecentConsultations(safe);
      })
      .catch(() => {
        setRecentConsultations([]);
      })
      .finally(() => setLoadingRecent(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        const item = results[selectedIndex];
        if (!item) return;
        e.preventDefault();
        haptic("tap");
        item.run();
        close();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, selectedIndex, query, patients, queue, recentConsultations]);

  const normalizedQuery = query.trim().toLowerCase();

  const score = (haystack: string) => {
    const h = haystack.toLowerCase();
    if (!normalizedQuery) return 0;
    if (h.startsWith(normalizedQuery)) return 0;
    if (h.includes(normalizedQuery)) return 1;
    // simple subsequence match
    let qi = 0;
    for (let i = 0; i < h.length && qi < normalizedQuery.length; i++) {
      if (h[i] === normalizedQuery[qi]) qi++;
    }
    return qi === normalizedQuery.length ? 2 : 999;
  };

  const results: PaletteItem[] = useMemo(() => {
    if (!isOpen) return [];

    const items: PaletteItem[] = [];

    const queueItems = (queue || [])
      .filter((e) => e.status !== "done")
      .map((e) => {
        const s = Math.min(score(e.patientName || ""), score(String(e.patientId)));
        return { e, s };
      })
      .filter(({ s }) => s < 999)
      .sort((a, b) => a.s - b.s)
      .slice(0, 8)
      .map(({ e }) => {
        return {
          kind: "queue",
          key: `queue:${e.queueId}`,
          title: e.patientName,
          subtitle: `Queue • ${e.status === "in-progress" ? "In progress" : "Waiting"} • ${e.clinic}`,
          hint: "Enter",
          entry: e,
          actionLabel: "Start",
          run: () => {
            setActivePatientId(e.patientId);
            setActiveAppointmentId(e.appointmentId);
            onNavigate("consultation");
          },
        } satisfies PaletteItem;
      });

    if (queueItems.length) items.push(...queueItems);

    const patientItems = (patients || [])
      .map((p) => {
        const label = `${p.name || ""} ${p.phone || ""}`.trim();
        const s = score(label);
        return { p, s };
      })
      .filter(({ s }) => (normalizedQuery ? s < 999 : true))
      .sort((a, b) => a.s - b.s)
      .slice(0, normalizedQuery ? 12 : 8)
      .map(({ p }) => {
        const last = p.lastVisit ? new Date(p.lastVisit).toLocaleDateString() : "Never";
        const age = p.age ? `${p.age}Y` : "Age N/A";
        return {
          kind: "patient",
          key: `patient:${p.id}`,
          title: p.name || "Unknown patient",
          subtitle: `${p.phone || "No phone"} • ${age} • Last: ${last}`,
          hint: "Enter",
          patientId: String(p.id),
          actionLabel: "Open",
          run: () => onSelectPatient(String(p.id)),
        } satisfies PaletteItem;
      });

    items.push(...patientItems);

    const consultItems = (recentConsultations || [])
      .map((c) => {
        const patient = (patients || []).find((p) => String(p.id) === String(c.patientId));
        const title = patient?.name ? patient.name : `Patient ${String(c.patientId).slice(-6)}`;
        const when = c.date ? new Date(c.date).toLocaleString() : "";
        const hintText = c.chiefComplaint ? c.chiefComplaint : "Consultation";
        const label = `${title} ${hintText}`.trim();
        const s = score(label);
        return { c, s, title, when, hintText };
      })
      .filter(({ s }) => (normalizedQuery ? s < 999 : true))
      .sort((a, b) => a.s - b.s)
      .slice(0, normalizedQuery ? 6 : 5)
      .map(({ c, title, when, hintText }) => {
        return {
          kind: "consultation",
          key: `consult:${c.patientId}:${c.date}`,
          title,
          subtitle: `${hintText} • ${when}`,
          hint: "Enter",
          patientId: String(c.patientId),
          actionLabel: "Open",
          run: () => onSelectPatient(String(c.patientId)),
        } satisfies PaletteItem;
      });

    if (consultItems.length) items.push(...consultItems);

    return items;
  }, [isOpen, normalizedQuery, queue, patients, recentConsultations]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-palette-index="${selectedIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  const content = (
    <div
      data-testid="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(2, 6, 23, 0.42)",
        display: "grid",
        alignItems: "start",
        justifyItems: "center",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)",
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(
          16,
          keyboard.insetPx + 12
        )}px)`,
        boxSizing: "border-box",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onTouchStart={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          maxWidth: "100%",
          borderRadius: 20,
          background: "var(--surface, #ffffff)",
          border: "1px solid var(--border, #e2e8f0)",
          boxShadow: "var(--shadow-3, 0 24px 80px rgba(2, 6, 23, 0.28))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 12px",
            borderBottom: "1px solid var(--border, #e2e8f0)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              background: "rgba(2, 132, 199, 0.10)",
              display: "grid",
              placeItems: "center",
              color: "#0284c7",
              flex: "0 0 auto",
            }}
          >
            <Search size={18} />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patients, queue, recent consultations…"
            className="sakhi-input"
            style={{
              flex: 1,
              minWidth: 0,
              height: 44,
              borderRadius: 14,
            }}
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="sakhi-tap sakhi-focus-ring"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              border: "1px solid var(--border, #e2e8f0)",
              background: "rgba(2, 6, 23, 0.02)",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          ref={listRef}
          style={{
            maxHeight: "min(520px, calc(var(--app-vh, 100vh) - 220px))",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {loadingRecent && results.length === 0 ? (
            <div style={{ padding: 16 }}>
              <div className="sakhi-skeleton" style={{ height: 14, width: "60%", marginBottom: 12 }} />
              <div className="sakhi-skeleton" style={{ height: 52, borderRadius: 14, marginBottom: 10 }} />
              <div className="sakhi-skeleton" style={{ height: 52, borderRadius: 14, marginBottom: 10 }} />
              <div className="sakhi-skeleton" style={{ height: 52, borderRadius: 14 }} />
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: 18, color: "var(--muted, #64748b)", fontWeight: 700 }}>
              No results.
            </div>
          ) : (
            results.map((item, idx) => (
              <button
                key={item.key}
                type="button"
                data-palette-index={idx}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  haptic("tap");
                  item.run();
                  close();
                }}
                className="sakhi-focus-ring"
                style={{
                  width: "100%",
                  border: "none",
                  background: idx === selectedIndex ? "rgba(2, 132, 199, 0.10)" : "transparent",
                  textAlign: "left",
                  padding: "12px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>{item.title}</div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "var(--muted, #64748b)",
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(226, 232, 240, 0.9)",
                        background: "rgba(2, 6, 23, 0.02)",
                        flex: "0 0 auto",
                      }}
                    >
                      {item.kind === "queue" ? "Queue" : item.kind === "patient" ? "Patient" : "Recent"}
                    </div>
                  </div>
                  {item.subtitle && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--muted, #64748b)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.subtitle}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: "0 0 auto",
                    color: "var(--muted, #64748b)",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900 }}>{item.actionLabel}</div>
                  <CornerDownLeft size={16} />
                </div>
              </button>
            ))
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            borderTop: "1px solid var(--border, #e2e8f0)",
            color: "var(--muted, #64748b)",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span>Esc</span>
            <span style={{ opacity: 0.6 }}>•</span>
            <span>↑↓</span>
            <span style={{ opacity: 0.6 }}>•</span>
            <span>Enter</span>
          </div>
          <div style={{ opacity: 0.85 }}>
            {keyboard.isOpen ? "Keyboard active" : "Ctrl/Cmd+K"}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

