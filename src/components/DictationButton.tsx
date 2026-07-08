import React, { useCallback } from "react";
import { useVoiceSessionContext } from "../hooks/VoiceSessionContext";

export interface DictationButtonProps {
  fieldId: string;
  onDelta: (text: string) => void;
  disabled?: boolean;
  lang?: string;
  label?: string;
  compact?: boolean;
}

const DictationButton: React.FC<DictationButtonProps> = ({
  fieldId,
  onDelta,
  disabled = false,
  lang,
  label = "Start Recording",
  compact = false,
}) => {
  const { state, startRecording, stopRecording, isFieldActive } = useVoiceSessionContext();

  const isRecording = state.recording && state.activeField === fieldId;
  const isOtherRecording = state.recording && state.activeField !== null && state.activeField !== fieldId;
  const isError = !state.recording && state.errorMsg !== "" && state.activeField === null;

  const handleClick = useCallback(() => {
    if (disabled || state.unsupported) return;
    if (isRecording) {
      stopRecording();
    } else if (isOtherRecording) {
      startRecording(fieldId, lang || "en-IN", onDelta);
    } else {
      startRecording(fieldId, lang || "en-IN", onDelta);
    }
  }, [disabled, state.unsupported, isRecording, isOtherRecording, stopRecording, startRecording, fieldId, lang, onDelta]);

  if (state.unsupported) {
    return (
      <div style={wrapperStyle}>
        <span style={unsupportedLabelStyle}>Voice dictation unavailable</span>
      </div>
    );
  }

  const buttonTitle = isError
    ? state.errorMsg || "Recording interrupted"
    : isRecording
    ? "Stop Recording"
    : isOtherRecording
    ? `Switch recording to this field`
    : label;

  const showTimer = isRecording && !compact;
  const showStatus = !compact;

  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        onClick={handleClick}
        title={buttonTitle}
        aria-label={buttonTitle}
        aria-pressed={isRecording}
        disabled={disabled || state.unsupported}
        style={{
          ...btnStyle,
          ...(isRecording ? btnRecordingStyle : {}),
          ...(isError ? btnErrorStyle : {}),
          ...(disabled || state.unsupported ? btnDisabledStyle : {}),
          ...(isOtherRecording ? btnOtherRecordingStyle : {}),
        }}
      >
        {isRecording ? (
          <span style={dotStyle} aria-hidden="true" />
        ) : isOtherRecording ? (
          <span aria-hidden="true">🎤</span>
        ) : isError ? (
          <span aria-hidden="true">⚠️</span>
        ) : (
          <span aria-hidden="true">🎤</span>
        )}
        <span style={buttonLabelStyle}>
          {isRecording ? "Stop" : isOtherRecording ? "Switch" : isError ? "Retry" : "Start"}
        </span>
      </button>

      {showTimer && (
        <div style={metaStyle} aria-live="polite">
          <span style={statusStyle(true, false)}>● Recording</span>
          <span style={mutedTextStyle}>{state.durationFormatted}</span>
        </div>
      )}

      {showStatus && !isRecording && state.statusText && state.statusText !== "Ready" && (
        <div style={metaStyle}>
          <span style={mutedTextStyle}>{state.statusText}</span>
        </div>
      )}
    </div>
  );
};

const wrapperStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const btnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 34,
  padding: "0 10px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 999,
  background: "#ffffff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  transition: "all 0.15s ease",
  flexShrink: 0,
};

const btnRecordingStyle: React.CSSProperties = {
  background: "#fee2e2",
  borderColor: "#fca5a5",
  boxShadow: "0 0 0 3px rgba(239,68,68,0.15)",
};

const btnOtherRecordingStyle: React.CSSProperties = {
  background: "#fefce8",
  borderColor: "#fde68a",
};

const btnErrorStyle: React.CSSProperties = {
  background: "#fef3c7",
  borderColor: "#fde68a",
};

const btnDisabledStyle: React.CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed",
};

const buttonLabelStyle: React.CSSProperties = {
  fontWeight: 800,
};

const metaStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: "#475569",
};

const statusStyle = (isRecording: boolean, isError: boolean): React.CSSProperties => ({
  fontWeight: 800,
  color: isRecording ? "#dc2626" : isError ? "#d97706" : "#0f172a",
});

const mutedTextStyle: React.CSSProperties = {
  color: "#64748b",
};

const unsupportedLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
};

const dotStyle: React.CSSProperties = {
  display: "block",
  width: 8,
  height: 8,
  borderRadius: "50%",
  backgroundColor: "#ef4444",
  animation: "dictation-pulse 1s ease-in-out infinite",
};

const PULSE_CSS = `
  @keyframes dictation-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.75); }
  }
`;

const DictationButtonWithStyle: React.FC<DictationButtonProps> = (props) => (
  <>
    <style>{PULSE_CSS}</style>
    <DictationButton {...props} />
  </>
);

export default DictationButtonWithStyle;
