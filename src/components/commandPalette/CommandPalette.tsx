import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Search, X } from "lucide-react";
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

  const normalizedQuery = query.trim().toLowerCase();

  const score = (haystack: string) => {
    const h = haystack.toLowerCase();
    if (!normalizedQuery) return 0;
    if (h.startsWith(normalizedQuery)) return 0;
    if (h.includes(normalizedQuery)) return 1;
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
          kind: "queue" as const,
          key: `queue:${e.queueId}`,
          title: e.patientName || `Patient ${e.patientId}`,
          subtitle: e.complaint ? `Complaint: ${e.complaint}` : e.status,
          hint: e.status,
          entry: e,
          actionLabel: "Open",
          run: () => {
            setActivePatientId(String(e.patientId));
            setActiveAppointmentId(String(e.appointmentId || ""));
            onSelectPatient(String(e.patientId));
            onNavigate("today");
          },
        };
      });

    const patientItems = (patients || [])
      .map((p) => {
        const s = Math.min(score(p.name || ""), score(String(p.id || "")));
        return { p, s };
      })
      .filter(({ s }) => s < 999)
      .sort((a, b) => a.s - b.s)
      .slice(0, 10)
      .map(({ p }) => {
        return {
          kind: "patient" as const,
          key: `patient:${p.id}`,
          title: p.name || `Patient ${p.id}`,
          subtitle: p.phone ? `Phone: ${p.phone}` : undefined,
          patientId: String(p.id),
          actionLabel: "Open",
          run: () => {
            setActivePatientId(String(p.id));
            onSelectPatient(String(p.id));
            onNavigate("patients");
          },
        };
      });

    const recentItems = (recentConsultations || [])
      .map((c) => {
        const patient = (patients || []).find((p) => String(p.id) === String(c.patientId));
        const title = patient?.name ? patient.name : `Patient ${c.patientId}`;
        const subtitle = c.chiefComplaint ? c.chiefComplaint : c.date ? String(c.date).slice(0, 10) : undefined;
        const s = Math.min(score(title), score(String(c.patientId)));
        return { c, s, title, subtitle };
      })
      .filter(({ s }) => s < 999)
      .sort((a, b) => a.s - b.s)
      .slice(0, 6)
      .map(({ c, title, subtitle }) => {
        return {
          kind: "consultation" as const,
          key: `consultation:${c.patientId}:${c.date}`,
          title,
          subtitle,
          patientId: String(c.patientId),
          actionLabel: "Consult",
          run: () => {
            setActivePatientId(String(c.patientId));
            onSelectPatient(String(c.patientId));
            onNavigate("consultation");
          },
        };
      });

    items.push(...queueItems);
    items.push(...patientItems);
    items.push(...recentItems);
    return items;
  }, [isOpen, query, patients, queue, recentConsultations]);

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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, selectedIndex, results]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector(`[data-palette-index="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  const content = (
    <div
      data-testid="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="sakhi-palette-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onTouchStart={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sakhi-palette-panel">
        <div className="sakhi-palette-header">
          <div
            style={{
              width: "var(--space-6)",
              height: "var(--space-6)",
              borderRadius: "var(--radius-2)",
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
            style={{ flex: 1, minWidth: 0, height: 48 }}
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="sakhi-tap sakhi-focus-ring"
            style={{
              width: 48,
              height: 48,
              borderRadius: "var(--radius-2)",
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
          className="sakhi-palette-list"
          style={{ maxHeight: "min(520px, calc(var(--app-vh, 100vh) - 220px))" }}
        >
          {loadingRecent && results.length === 0 ? (
            <div style={{ padding: "var(--space-3)" }}>
              <div className="sakhi-skeleton" style={{ height: 16, width: "60%", marginBottom: 16 }} />
              <div className="sakhi-skeleton" style={{ height: 48, borderRadius: "var(--radius-2)", marginBottom: 8 }} />
              <div className="sakhi-skeleton" style={{ height: 48, borderRadius: "var(--radius-2)", marginBottom: 8 }} />
              <div className="sakhi-skeleton" style={{ height: 48, borderRadius: "var(--radius-2)" }} />
            </div>
          ) : results.length === 0 ? (
            <div className="sakhi-caption" style={{ padding: "var(--space-3)" }}>
              No results.
            </div>
          ) : (
            results.map((item, idx) => (
              <button
                key={item.key}
                type="button"
                data-palette-index={idx}
                data-selected={idx === selectedIndex}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  haptic("tap");
                  item.run();
                  close();
                }}
                className="sakhi-palette-item sakhi-focus-ring sakhi-tap sakhi-ripple"
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
                    <div className="sakhi-body" style={{ fontWeight: 900, color: "#0f172a" }}>
                      {item.title}
                    </div>
                    <span className="sakhi-kbd-hint" style={{ fontWeight: 800 }}>
                      {item.kind === "queue" ? "Queue" : item.kind === "patient" ? "Patient" : "Recent"}
                    </span>
                  </div>
                  {item.subtitle && (
                    <div style={{ marginTop: "var(--space-1)" }}>
                      <span className="sakhi-caption">{item.subtitle}</span>
                    </div>
                  )}
                </div>
                <div className="sakhi-row" style={{ flex: "0 0 auto", color: "#64748b" }}>
                  <div className="sakhi-caption" style={{ fontWeight: 900 }}>
                    {item.actionLabel}
                  </div>
                  <CornerDownLeft size={16} />
                </div>
              </button>
            ))
          )}
        </div>

        <div className="sakhi-palette-footer">
          <div className="sakhi-row" style={{ gap: "var(--space-2)" }}>
            <span>Esc</span>
            <span style={{ opacity: 0.6 }}>•</span>
            <span>↑↓</span>
            <span style={{ opacity: 0.6 }}>•</span>
            <span>Enter</span>
          </div>
          <div style={{ opacity: 0.85 }}>{keyboard.isOpen ? "Keyboard active" : "Ctrl/Cmd+K"}</div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
