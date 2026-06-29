/**
 * DictationButton.tsx
 * Sakhi Clinic — Continuous clinical dictation
 *
 * Uses the browser Web Speech API only — zero dependencies.
 * Keeps a single speech-recognition session alive while the doctor is speaking,
 * and only stops when the doctor explicitly presses Stop.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

const getSpeechRecognitionAPI = (): typeof SpeechRecognition | null => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
};

type RecordingState = "idle" | "recording" | "error" | "unsupported";

export interface DictationButtonProps {
  onText: (text: string) => void;
  disabled?: boolean;
  lang?: string;
  label?: string;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

const DictationButton: React.FC<DictationButtonProps> = ({
  onText,
  disabled = false,
  lang,
  label = "Start Recording",
}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>(
    getSpeechRecognitionAPI() === null ? "unsupported" : "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("Ready");
  const [durationSeconds, setDurationSeconds] = useState<number>(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const manualStopRef = useRef(false);
  const durationTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const activeSessionRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (durationTimerRef.current !== null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current !== null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    stopDurationTimer();
    setDurationSeconds(0);
    durationTimerRef.current = window.setInterval(() => {
      setDurationSeconds((value) => value + 1);
    }, 1000);
  }, [stopDurationTimer]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, [clearTimers]);

  const startRecording = useCallback(() => {
    const SpeechRecognitionAPI = getSpeechRecognitionAPI();
    if (!SpeechRecognitionAPI) {
      setRecordingState("unsupported");
      setStatusText("Voice dictation unavailable");
      return;
    }

    manualStopRef.current = false;
    clearTimers();
    setErrorMsg("");
    setStatusText("Recording...");
    setRecordingState("recording");
    startDurationTimer();

    const recognition = new SpeechRecognitionAPI();
    const sessionId = activeSessionRef.current + 1;
    activeSessionRef.current = sessionId;

    recognition.lang = lang ?? document.documentElement.lang ?? "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecordingState("recording");
      setStatusText("Recording...");
      setErrorMsg("");
      startDurationTimer();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const finalTranscript = Array.from(event.results || [])
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript?.trim() ?? "")
        .filter(Boolean)
        .join(" ")
        .trim();

      if (finalTranscript) {
        onText(finalTranscript);
        setStatusText("Added to consultation");
        window.setTimeout(() => {
          setStatusText((current) => (current === "Added to consultation" ? "Recording..." : current));
        }, 1200);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted") {
        setRecordingState("idle");
        setStatusText("Stopped");
        stopDurationTimer();
        return;
      }

      let message = "Dictation interrupted.";
      switch (event.error) {
        case "not-allowed":
        case "service-not-allowed":
          message = "Microphone permission denied.";
          break;
        case "audio-capture":
          message = "Microphone unavailable.";
          break;
        case "network":
          message = "Recording interrupted.";
          break;
        case "no-speech":
          message = "Recording active. Continue speaking.";
          break;
        default:
          message = "Recording interrupted.";
      }

      setRecordingState("error");
      setErrorMsg(message);
      setStatusText(message);
      stopDurationTimer();
      recognitionRef.current = null;

      if (event.error !== "not-allowed" && event.error !== "service-not-allowed") {
        restartTimerRef.current = window.setTimeout(() => {
          if (!manualStopRef.current) {
            startRecording();
          }
        }, 300);
      }
    };

    recognition.onend = () => {
      if (manualStopRef.current) {
        setRecordingState("idle");
        setStatusText("Stopped");
        stopDurationTimer();
        recognitionRef.current = null;
        return;
      }

      if (activeSessionRef.current !== sessionId) return;

      setRecordingState("recording");
      setStatusText("Recording...");
      startDurationTimer();
      recognitionRef.current = null;
      restartTimerRef.current = window.setTimeout(() => {
        if (!manualStopRef.current) {
          startRecording();
        }
      }, 120);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setRecordingState("error");
      setErrorMsg("Recording interrupted.");
      setStatusText("Recording interrupted.");
      stopDurationTimer();
      recognitionRef.current = null;
    }
  }, [clearTimers, lang, onText, startDurationTimer, stopDurationTimer]);

  const stopRecording = useCallback(() => {
    manualStopRef.current = true;
    clearTimers();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.stop();
      recognitionRef.current = null;
    }
    setRecordingState("idle");
    setStatusText("Stopped");
    stopDurationTimer();
  }, [clearTimers, stopDurationTimer]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (recordingState === "recording") {
      stopRecording();
    } else {
      startRecording();
    }
  }, [disabled, recordingState, startRecording, stopRecording]);

  if (recordingState === "unsupported") {
    return (
      <div style={wrapperStyle}>
        <span style={unsupportedLabelStyle}>Voice dictation unavailable</span>
      </div>
    );
  }

  const isRecording = recordingState === "recording";
  const isError = recordingState === "error";
  const buttonTitle = isError
    ? errorMsg || "Recording interrupted"
    : isRecording
    ? "Stop Recording"
    : label;

  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        onClick={handleClick}
        title={buttonTitle}
        aria-label={buttonTitle}
        aria-pressed={isRecording}
        style={{
          ...btnStyle,
          ...(isRecording ? btnRecordingStyle : {}),
          ...(isError ? btnErrorStyle : {}),
          ...(disabled ? btnDisabledStyle : {}),
        }}
      >
        {isRecording ? <span style={dotStyle} aria-hidden="true" /> : isError ? <span aria-hidden="true">⚠️</span> : <span aria-hidden="true">🎤</span>}
        <span style={buttonLabelStyle}>{isRecording ? "Stop" : isError ? "Resume" : "Start Recording"}</span>
      </button>

      <div style={metaStyle} aria-live="polite">
        <span style={statusStyle(isRecording, isError)}>{isRecording ? "● Recording" : isError ? "⚠️ Interrupted" : "Ready"}</span>
        <span style={mutedTextStyle}>{formatDuration(durationSeconds)}</span>
        <span style={mutedTextStyle}>{statusText}</span>
      </div>
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

const StyleInjector: React.FC = () => <style dangerouslySetInnerHTML={{ __html: PULSE_CSS }} />;

const DictationButtonWithStyle: React.FC<DictationButtonProps> = (props) => (
  <>
    <StyleInjector />
    <DictationButton {...props} />
  </>
);

export default DictationButtonWithStyle;