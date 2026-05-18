/**
 * DictationButton.tsx
 * Sakhi Clinic — Per-field Voice Dictation Button
 *
 * Uses browser Web Speech API only — zero dependencies.
 * Appends transcribed text to whatever the parent field holds.
 * Hides itself silently if the browser does not support SpeechRecognition.
 *
 * Usage:
 *   <DictationButton
 *     onText={(spoken) => patch({ chiefComplaint: formData.chiefComplaint + " " + spoken })}
 *   />
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// BROWSER COMPAT SHIM
// Normalise vendor-prefixed SpeechRecognition into one reference.
// ─────────────────────────────────────────────────────────────────────────────

const SpeechRecognitionAPI: typeof SpeechRecognition | null =
  typeof window !== "undefined"
    ? (window.SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
    : null;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type RecordingState = "idle" | "recording" | "error" | "unsupported";

export interface DictationButtonProps {
  /**
   * Called with the final transcribed text segment.
   * Parent is responsible for appending it to the field value.
   */
  onText: (text: string) => void;

  /** Disables the button — useful when the parent field is disabled. */
  disabled?: boolean;

  /**
   * BCP-47 language tag passed to SpeechRecognition.lang.
   * Defaults to the document language or "en-IN".
   * Pass "gu-IN" for Gujarati, "hi-IN" for Hindi.
   */
  lang?: string;

  /** aria-label for the button. Defaults to "Start dictation". */
  label?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const DictationButton: React.FC<DictationButtonProps> = ({
  onText,
  disabled = false,
  lang,
  label = "Start dictation",
}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>(
    SpeechRecognitionAPI === null ? "unsupported" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Stable ref so event handlers never capture a stale instance
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  // ── Start recording ───────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!SpeechRecognitionAPI) return;

    // Abort any leftover session defensively
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionAPI();

    // Configuration
    recognition.lang =
      lang ?? document.documentElement.lang ?? "en-IN";
    recognition.continuous = false;       // single utterance per click
    recognition.interimResults = false;   // final transcript only
    recognition.maxAlternatives = 1;

    // ── Handlers ──────────────────────────────────────────────────────

    recognition.onstart = () => {
      setRecordingState("recording");
      setErrorMsg("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) {
        onText(transcript.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "aborted" fires when we call .abort() ourselves — not a real error
      if (event.error === "aborted") {
        setRecordingState("idle");
        return;
      }

      let message = "Dictation failed.";
      switch (event.error) {
        case "not-allowed":
        case "service-not-allowed":
          message = "Microphone permission denied.";
          break;
        case "no-speech":
          message = "No speech detected. Try again.";
          break;
        case "network":
          message = "Network error during dictation.";
          break;
        case "audio-capture":
          message = "Microphone not found.";
          break;
        default:
          message = `Dictation error: ${event.error}`;
      }

      setRecordingState("error");
      setErrorMsg(message);

      // Auto-clear error state after 3 seconds so button resets to idle
      setTimeout(() => {
        setRecordingState("idle");
        setErrorMsg("");
      }, 3000);
    };

    recognition.onend = () => {
      // onend always fires after onresult — safe to reset state here
      setRecordingState((prev) =>
        prev === "recording" ? "idle" : prev
      );
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      // start() throws if called while already running
      setRecordingState("idle");
      recognitionRef.current = null;
    }
  }, [lang, onText]);

  // ── Stop recording ────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      // .stop() triggers onresult (if any speech) then onend
      recognitionRef.current.stop();
    }
  }, []);

  // ── Click handler ─────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (disabled) return;
    if (recordingState === "recording") {
      stopRecording();
    } else {
      startRecording();
    }
  }, [disabled, recordingState, startRecording, stopRecording]);

  // ── Don't render if browser has no support ────────────────────────────
  if (recordingState === "unsupported") return null;

  // ── Derived UI state ─────────────────────────────────────────────────
  const isRecording = recordingState === "recording";
  const isError = recordingState === "error";
  const isDisabled = disabled || isError;

  const buttonTitle = isError
    ? errorMsg
    : isRecording
    ? "Stop dictation"
    : label;

  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        title={buttonTitle}
        aria-label={buttonTitle}
        aria-pressed={isRecording}
        style={{
          ...btnStyle,
          ...(isRecording ? btnRecordingStyle : {}),
          ...(isError ? btnErrorStyle : {}),
          ...(isDisabled ? btnDisabledStyle : {}),
        }}
      >
        {isRecording ? (
          // Pulsing red dot while recording
          <span style={dotStyle} aria-hidden="true" />
        ) : isError ? (
          <span aria-hidden="true">⚠️</span>
        ) : (
          <span aria-hidden="true">🎤</span>
        )}
      </button>

      {/* Recording label — visible only while active */}
      {isRecording && (
        <span style={recordingLabelStyle} aria-live="polite">
          Listening…
        </span>
      )}

      {/* Error message — visible briefly on error */}
      {isError && errorMsg && (
        <span style={errorLabelStyle} role="alert">
          {errorMsg}
        </span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// Intentionally minimal — fits inside any field label row without disruption.
// ─────────────────────────────────────────────────────────────────────────────

const wrapperStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  border: "1.5px solid #e2e8f0",
  borderRadius: "50%",
  background: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  transition: "all 0.15s ease",
  flexShrink: 0,
};

const btnRecordingStyle: React.CSSProperties = {
  background: "#fee2e2",
  borderColor: "#fca5a5",
  boxShadow: "0 0 0 3px rgba(239,68,68,0.15)",
};

const btnErrorStyle: React.CSSProperties = {
  background: "#fef3c7",
  borderColor: "#fde68a",
};

const btnDisabledStyle: React.CSSProperties = {
  opacity: 0.4,
  cursor: "not-allowed",
};

// Pulsing red dot shown inside button while recording
const dotStyle: React.CSSProperties = {
  display: "block",
  width: 10,
  height: 10,
  borderRadius: "50%",
  backgroundColor: "#ef4444",
  animation: "dictation-pulse 1s ease-in-out infinite",
};

const recordingLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#ef4444",
  letterSpacing: "0.02em",
};

const errorLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#d97706",
  maxWidth: 180,
  lineHeight: 1.3,
};

// ─────────────────────────────────────────────────────────────────────────────
// PULSE KEYFRAME
// Injected once as a <style> tag — avoids needing a global CSS file.
// ─────────────────────────────────────────────────────────────────────────────

const PULSE_CSS = `
  @keyframes dictation-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.75); }
  }
`;

const StyleInjector: React.FC = () => (
  <style dangerouslySetInnerHTML={{ __html: PULSE_CSS }} />
);

// ─────────────────────────────────────────────────────────────────────────────
// WRAPPED EXPORT
// StyleInjector renders the keyframe once alongside the first DictationButton.
// ─────────────────────────────────────────────────────────────────────────────

const DictationButtonWithStyle: React.FC<DictationButtonProps> = (props) => (
  <>
    <StyleInjector />
    <DictationButton {...props} />
  </>
);

export default DictationButtonWithStyle;