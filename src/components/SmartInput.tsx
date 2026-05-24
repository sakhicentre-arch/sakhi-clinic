/**
 * SmartInput.tsx
 * Sakhi Clinic — Reusable Hybrid Input with Suggestion Dropdown
 *
 * Supports:
 *   - Single-line <input> and multi-line <textarea>
 *   - Free typing — never restricts doctor input
 *   - Filtered suggestion dropdown (shows on focus + typing)
 *   - Append mode — selecting a suggestion appends to existing value
 *     (used for Family History, Past History where multiple entries stack)
 *   - Replace mode (default) — selecting replaces current value
 *   - Full keyboard navigation (↑ ↓ Enter Escape Tab)
 *   - Clicks outside close the dropdown
 *   - Zero external dependencies
 *   - Forwards all standard input/textarea props transparently
 *
 * Usage:
 *   <SmartInput
 *     value={formData.chiefComplaint}
 *     onChange={(val) => patch({ chiefComplaint: val })}
 *     suggestions={SUGGESTIONS.chiefComplaint}
 *     placeholder="Chief Complaint"
 *   />
 *
 *   <SmartInput
 *     multiline
 *     rows={3}
 *     value={formData.familyHistory}
 *     onChange={(val) => patch({ familyHistory: val })}
 *     suggestions={SUGGESTIONS.familyHistory}
 *     appendMode
 *     appendSeparator=", "
 *     placeholder="Family History"
 *   />
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum characters typed before dropdown appears. 0 = show on focus. */
const MIN_CHARS_TO_SHOW = 0;

/** Maximum suggestions visible before scroll. */
const MAX_VISIBLE = 8;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

// ✅ FIX: Restored missing opening < on generic type argument
type InputChangeEvent = React.ChangeEvent<
  HTMLInputElement | HTMLTextAreaElement
>;

interface SmartInputBaseProps {
  /** Current value — controlled component, always required. */
  value: string;

  /** Called with the new string value on every change. */
  onChange: (value: string) => void;

  /** Full suggestion list. Filtered live as user types. */
  suggestions?: string[];

  /**
   * Append mode — selecting a suggestion appends to existing value
   * instead of replacing it. Use for Family History, Past History.
   */
  appendMode?: boolean;

  /**
   * Separator inserted between existing value and appended suggestion.
   * Only used when appendMode is true.
   * Default: ", "
   */
  appendSeparator?: string;

  /** Render as <textarea> instead of <input>. */
  multiline?: boolean;

  /** Passed directly to <textarea> rows attribute. Only used when multiline. */
  rows?: number;

  /** Standard HTML placeholder. */
  placeholder?: string;

  /** Additional CSS class applied to the input/textarea element. */
  className?: string;

  /** Inline style applied to the input/textarea element. */
  style?: React.CSSProperties;

  /** Called when the input gains focus. */
  onFocus?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;

  /** Called when the input loses focus. */
  onBlur?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;

  /** Optional keyboard event handler. */
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;

  /** Focuses the input automatically when mounted. */
  autoFocus?: boolean;

  /** Passed to the input/textarea for form accessibility. */
  name?: string;

  /** HTML id. Auto-generated if not provided. */
  id?: string;

  /** Disables the input and hides the dropdown. */
  disabled?: boolean;

  /** Marks the field as required for HTML form validation. */
  required?: boolean;

  /** aria-label for accessibility when no visible label exists. */
  "aria-label"?: string;

  /** aria-labelledby — pass the id of an external label element. */
  "aria-labelledby"?: string;
}

export type SmartInputProps = SmartInputBaseProps;

// ─────────────────────────────────────────────────────────────────────────────
// FILTER HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns suggestions that match the query string.
 * In append mode: matches against the last segment after the separator.
 * In replace mode: matches against the full current value.
 * Match is case-insensitive and matches anywhere in the string.
 */
function filterSuggestions(
  suggestions: string[],
  rawValue: string,
  appendMode: boolean,
  appendSeparator: string
): string[] {
  const query = appendMode
    ? rawValue.split(appendSeparator).pop()?.trim() ?? ""
    : rawValue.trim();

  if (query.length < MIN_CHARS_TO_SHOW && MIN_CHARS_TO_SHOW > 0) return [];

  const lower = query.toLowerCase();

  if (!lower) return suggestions.slice(0, MAX_VISIBLE);

  return suggestions
    .filter((s) => s.toLowerCase().includes(lower))
    .slice(0, MAX_VISIBLE);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const SmartInput: React.FC<SmartInputProps> = ({
  value,
  onChange,
  suggestions = [],
  appendMode = false,
  appendSeparator = ", ",
  multiline = false,
  rows = 3,
  placeholder,
  className,
  style,
  onFocus,
  onBlur,
  onKeyDown,
  autoFocus = false,
  name,
  id: idProp,
  disabled = false,
  required = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}) => {
  const autoId = useId();
  const inputId = idProp ?? autoId;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // ── Derived: filtered list shown in dropdown ────────────────────────────
  const filtered = React.useMemo(() => {
    if (!suggestions.length || disabled) return [];
    return filterSuggestions(suggestions, value, appendMode, appendSeparator);
  }, [suggestions, value, appendMode, appendSeparator, disabled]);

  const isOpen = open && filtered.length > 0;

  // ── Close on outside click ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  // ── Scroll active item into view ────────────────────────────────────────
  useEffect(() => {
    if (!listRef.current || activeIndex < 0) return;
    const item = listRef.current.children[activeIndex] as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (e: InputChangeEvent) => {
      onChange(e.target.value);
      setOpen(true);
      setActiveIndex(-1);
    },
    [onChange]
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setOpen(true);
      setActiveIndex(-1);
      onFocus?.(e);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Delay so mousedown on a list item fires before blur closes the list
      setTimeout(() => {
        setOpen(false);
        setActiveIndex(-1);
      }, 150);
      onBlur?.(e);
    },
    [onBlur]
  );

  const selectSuggestion = useCallback(
    (suggestion: string) => {
      if (appendMode) {
        const parts = value.split(appendSeparator);
        parts[parts.length - 1] = suggestion;
        const joined = parts.join(appendSeparator);
        // Add separator at end so doctor can keep typing the next entry
        onChange(joined + appendSeparator);
      } else {
        onChange(suggestion);
      }
      setOpen(false);
      setActiveIndex(-1);
      // Return focus to input after selection
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [appendMode, appendSeparator, value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!isOpen) {
        // Re-open on ArrowDown even if closed
        if (e.key === "ArrowDown") {
          setOpen(true);
          setActiveIndex(0);
          e.preventDefault();
        }
        onKeyDown?.(e);
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;

        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, -1));
          break;

        case "Enter":
          // Only intercept Enter if an item is highlighted
          if (activeIndex >= 0 && filtered[activeIndex]) {
            e.preventDefault();
            selectSuggestion(filtered[activeIndex]);
          }
          break;

        case "Escape":
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
          break;

        case "Tab":
          setOpen(false);
          setActiveIndex(-1);
          break;

        default:
          break;
      }

      if (!e.defaultPrevented) {
        onKeyDown?.(e);
      }
    },
    [isOpen, activeIndex, filtered, selectSuggestion, onKeyDown]
  );

  // ── Shared input props ──────────────────────────────────────────────────
  const sharedProps = {
    ref: inputRef,
    id: inputId,
    name,
    value,
    placeholder,
    disabled,
    required,
    className,
    style,
    autoComplete: "off",
    autoFocus,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-autocomplete": "list" as const,
    "aria-expanded": isOpen,
    "aria-controls": isOpen ? `${inputId}-listbox` : undefined,
    "aria-activedescendant":
      activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined,
    role: "combobox" as const,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%" }}
    >
      {/* Input or Textarea */}
      {multiline ? (
        <textarea {...sharedProps} rows={rows} />
      ) : (
        <input {...sharedProps} type="text" />
      )}

      {/* Dropdown */}
      {isOpen && (
        <ul
          ref={listRef}
          id={`${inputId}-listbox`}
          role="listbox"
          aria-label="Suggestions"
          className="sakhi-menu-panel sakhi-menu-list"
        >
          {filtered.map((suggestion, index) => {
            const isActive = index === activeIndex;
            return (
              <li
                key={suggestion}
                id={`${inputId}-option-${index}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  // mousedown instead of click — fires before blur
                  e.preventDefault();
                  selectSuggestion(suggestion);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                data-active={String(isActive)}
                className="sakhi-menu-item"
              >
                <HighlightMatch
                  text={suggestion}
                  query={
                    appendMode
                      ? value.split(appendSeparator).pop()?.trim() ?? ""
                      : value.trim()
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HIGHLIGHT MATCH
// Bolds the matching substring inside each suggestion label.
// ─────────────────────────────────────────────────────────────────────────────

const HighlightMatch: React.FC<{ text: string; query: string }> = ({
  text,
  query,
}) => {
  if (!query) return <>{text}</>;

  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, index)}
      <strong style={{ fontWeight: 900, color: "#064e52" }}>
        {text.slice(index, index + query.length)}
      </strong>
      {text.slice(index + query.length)}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// Minimal — does not override the parent form's input styles.
// Parent passes its own style/className to the input element directly.
// ─────────────────────────────────────────────────────────────────────────────

// Dropdown / item presentation is driven by `sakhi-menu-*` primitives in App.css for consistency.

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export default SmartInput;
