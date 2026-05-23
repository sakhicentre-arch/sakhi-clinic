import React, { useEffect, useMemo, useRef, useState } from "react";
import { haptic } from "../utils/haptics";

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  suggestions?: string[];
  recentRemedies?: string[];
  recentPrescriptions?: Array<{
    name: string;
    potency?: string;
    dosage?: string;
    duration?: string;
  }>;
  onPrescriptionCommit?: (rx: { name: string; potency?: string; dosage?: string; duration?: string }) => void;
  onCommit?: () => void;
  potency?: string;
  potencies?: string[];
  onPotencyChange?: (potency: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
};

export default function RemedyInput({
  value,
  onChange,
  placeholder = "Remedy name",
  suggestions = [],
  recentRemedies = [],
  recentPrescriptions = [],
  onPrescriptionCommit,
  onCommit,
  potency,
  potencies = [],
  onPotencyChange,
  autoFocus = false,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const filtered = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    const pool = q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions;
    const ranked = q
      ? [...pool].sort((a, b) => {
          const al = a.toLowerCase();
          const bl = b.toLowerCase();
          const ap = al.startsWith(q) ? 0 : 1;
          const bp = bl.startsWith(q) ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return al.localeCompare(bl);
        })
      : pool;
    return ranked.slice(0, 7);
  }, [value, suggestions]);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of recentRemedies || []) {
      const key = (r || "").trim();
      if (!key) continue;
      if (seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      out.push(key);
      if (out.length >= 10) break;
    }
    return out;
  }, [recentRemedies]);

  const recentRx = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; potency?: string; dosage?: string; duration?: string }> = [];
    for (const r of recentPrescriptions || []) {
      const name = (r?.name || "").trim();
      if (!name) continue;
      const key = `${name.toLowerCase()}|${(r.potency || "").toLowerCase()}|${(r.dosage || "").toLowerCase()}|${(r.duration || "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, potency: r.potency, dosage: r.dosage, duration: r.duration });
      if (out.length >= 10) break;
    }
    return out;
  }, [recentPrescriptions]);

  const commitValue = (nextValue?: string) => {
    const v = (nextValue ?? value ?? "").trim();
    if (!v) return;
    onChange(v);
    setOpen(false);
    onCommit?.();
  };

  return (
    <div className="min-w-0">
      {/* Recent prescriptions */}
      {recentRx.length > 0 && (
        <div className="mb-2">
          <div className="sakhi-micro mb-2">Recent Rx</div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {recentRx.map((r) => (
              <button
                key={`${r.name}|${r.potency || ""}|${r.dosage || ""}|${r.duration || ""}`}
                type="button"
                disabled={disabled}
                onClick={() => {
                  haptic("tap");
                  onPrescriptionCommit?.(r);
                  commitValue(r.name);
                }}
                className="sakhi-tap sakhi-focus-ring sakhi-ripple flex-none"
                style={{ minHeight: 48, borderRadius: "var(--radius-3)", border: "1px solid var(--border)", background: "var(--surface)", padding: "var(--space-2) var(--space-3)", color: "#0f172a", fontSize: "var(--type-caption)", fontWeight: 900 }}
                title="Reuse prescription"
              >
                <span className="block max-w-[220px] truncate">{r.name}</span>
                {(r.potency || r.dosage) && (
                  <span className="mt-0.5 block text-[11px] font-bold text-slate-500">
                    {[r.potency, r.dosage].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recents strip */}
      {recent.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {recent.map((r) => (
            <button
              key={r}
              type="button"
              disabled={disabled}
              onClick={() => { haptic("tap"); commitValue(r); }}
              className="sakhi-tap sakhi-focus-ring sakhi-ripple flex-none"
              style={{ minHeight: 48, borderRadius: "var(--radius-3)", border: "1px solid var(--border)", background: "var(--surface)", padding: "var(--space-2) var(--space-3)", color: "#334155", fontSize: "var(--type-caption)", fontWeight: 900 }}
              title="Use recent remedy"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          disabled={disabled}
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // allow click selection
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              if (!open) setOpen(true);
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const selected = filtered[activeIndex];
              commitValue(selected || value);
              return;
            }
            if (e.key === "Tab") {
              if (!open) return;
              const selected = filtered[activeIndex];
              if (!selected) return;
              commitValue(selected);
              return;
            }
          }}
          placeholder={placeholder}
          className="sakhi-input sakhi-focus-ring sakhi-tap"
        />

        {/* Suggestions dropdown */}
        {open && filtered.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden border border-slate-200 bg-white shadow-xl"
            style={{ borderRadius: "var(--radius-4)" }}
          >
            {filtered.map((s, idx) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { haptic("tap"); commitValue(s); }}
                className={
                  "w-full px-4 py-3 text-left text-sm font-semibold " +
                  (idx === activeIndex ? "bg-slate-50 text-slate-900" : "bg-white text-slate-900 hover:bg-slate-50")
                }
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Potency quick actions */}
      {potencies.length > 0 && onPotencyChange && (
        <div className="mt-2 flex flex-wrap gap-2">
          {potencies.slice(0, 6).map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => { haptic("tap"); onPotencyChange(p); }}
              className="sakhi-tap sakhi-focus-ring sakhi-ripple"
              style={{ minHeight: 40, borderRadius: "var(--radius-3)", border: potency === p ? "1px solid rgba(16,185,129,0.25)" : "1px solid var(--border)", background: potency === p ? "rgba(16,185,129,0.10)" : "var(--surface)", color: potency === p ? "#065f46" : "#334155", padding: "var(--space-2) var(--space-3)", fontSize: "var(--type-caption)", fontWeight: 900 }}
              title="Set potency"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
