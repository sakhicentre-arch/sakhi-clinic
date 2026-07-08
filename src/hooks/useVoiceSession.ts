import { useCallback, useEffect, useRef, useState } from "react";

const getSpeechRecognitionAPI = (): typeof SpeechRecognition | null => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

export interface VoiceSessionState {
  recording: boolean;
  activeField: string | null;
  duration: number;
  durationFormatted: string;
  statusText: string;
  errorMsg: string;
  unsupported: boolean;
}

export type OnDeltaCallback = (delta: string) => void;

export function useVoiceSession() {
  const [recording, setRecording] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [statusText, setStatusText] = useState("Ready");
  const [errorMsg, setErrorMsg] = useState("");
  const [unsupported, setUnsupported] = useState(() => getSpeechRecognitionAPI() === null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const activeFieldRef = useRef<string | null>(null);
  const manualStopRef = useRef(false);
  const sessionIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const durationTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const networkRetryCountRef = useRef(0);
  const restartScheduledRef = useRef(false);
  const lastCommittedRef = useRef<Record<string, string>>({});
  const lastProcessedRef = useRef<Record<string, number>>({});
  const callbacksRef = useRef<Record<string, OnDeltaCallback>>({});

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopDurationTimer();
      cancelPendingRestart();
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current !== null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    stopDurationTimer();
    setDuration(0);
    durationTimerRef.current = window.setInterval(() => {
      setDuration((v) => v + 1);
    }, 1000);
  }, [stopDurationTimer]);

  const cancelPendingRestart = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    restartScheduledRef.current = false;
  }, []);

  const getFullFinalTranscript = (results: SpeechRecognitionResultList): string => {
    return Array.from(results)
      .filter((r) => r.isFinal)
      .map((r) => r[0]?.transcript?.trim() ?? "")
      .filter(Boolean)
      .join(" ")
      .trim();
  };

  const startRecording = useCallback((fieldId: string, lang: string, onDelta: OnDeltaCallback) => {
    const SpeechRecognitionAPI = getSpeechRecognitionAPI();
    if (!SpeechRecognitionAPI) {
      setUnsupported(true);
      setStatusText("Voice dictation unavailable");
      return;
    }

    if (recognitionRef.current) {
      manualStopRef.current = true;
      cancelPendingRestart();
      stopDurationTimer();
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current = null;
    }

    manualStopRef.current = false;
    cancelPendingRestart();
    setErrorMsg("");
    networkRetryCountRef.current = 0;
    setStatusText("Recording...");
    setRecording(true);
    setActiveField(fieldId);
    setDuration(0);
    startDurationTimer();

    activeFieldRef.current = fieldId;
    callbacksRef.current[fieldId] = onDelta;
    lastProcessedRef.current[fieldId] = 0;
    if (!(fieldId in lastCommittedRef.current)) {
      lastCommittedRef.current[fieldId] = "";
    }

    const recognition = new SpeechRecognitionAPI();
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;

    recognition.lang = lang ?? document.documentElement.lang ?? "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecording(true);
      setStatusText("Recording...");
      setErrorMsg("");
      startDurationTimer();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const field = activeFieldRef.current;
      if (!field) return;
      const callback = callbacksRef.current[field];
      if (!callback) return;

      const resultIndex = event.resultIndex ?? 0;
      const totalResults = event.results.length;

      const startIdx = Math.max(resultIndex, lastProcessedRef.current[field] ?? 0);
      const newFinalTexts: string[] = [];
      let maxIdx = lastProcessedRef.current[field] ?? 0;

      for (let i = startIdx; i < totalResults; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;
        newFinalTexts.push(transcript);
        maxIdx = i + 1;
      }

      if (newFinalTexts.length === 0) return;

      lastProcessedRef.current[field] = maxIdx;
      const delta = newFinalTexts.join(" ");
      callback(delta);
      const currentFull = getFullFinalTranscript(event.results);
      if (currentFull) lastCommittedRef.current[field] = currentFull;
      setStatusText("Added to consultation");
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const savedField = activeFieldRef.current;
      const savedCallback = savedField ? callbacksRef.current[savedField] : undefined;

      if (event.error === "aborted") {
        setRecording(false);
        setActiveField(null);
        activeFieldRef.current = null;
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
          message = "No speech detected. Continue speaking or stop recording.";
          break;
        default:
          message = "Recording interrupted.";
      }

      if (event.error !== "network" || networkRetryCountRef.current > 0) {
        activeFieldRef.current = null;
      }

      setRecording(false);
      setActiveField(null);
      setErrorMsg(message);
      setStatusText(message);
      stopDurationTimer();
      recognitionRef.current = null;

      if (event.error === "network" && networkRetryCountRef.current === 0 && !restartScheduledRef.current) {
        networkRetryCountRef.current += 1;
        restartScheduledRef.current = true;
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          restartScheduledRef.current = false;
          if (!manualStopRef.current && isMountedRef.current && savedField && savedCallback) {
            const l = document.documentElement.lang || "en-IN";
            startRecording(savedField, l, savedCallback);
          }
        }, 400);
      }
    };

    recognition.onend = () => {
      if (manualStopRef.current || !isMountedRef.current) {
        setRecording(false);
        setActiveField(null);
        activeFieldRef.current = null;
        setStatusText("Stopped");
        stopDurationTimer();
        recognitionRef.current = null;
        return;
      }

      if (sessionIdRef.current !== sessionId || restartScheduledRef.current) return;

      recognitionRef.current = null;
      restartScheduledRef.current = true;
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        restartScheduledRef.current = false;
        if (!manualStopRef.current && isMountedRef.current && activeFieldRef.current) {
          const field = activeFieldRef.current;
          const cb = callbacksRef.current[field];
          const l = document.documentElement.lang || "en-IN";
          if (cb) startRecording(field, l, cb);
        }
      }, 120);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setRecording(false);
      setActiveField(null);
      activeFieldRef.current = null;
      setErrorMsg("Recording interrupted.");
      setStatusText("Recording interrupted.");
      stopDurationTimer();
      recognitionRef.current = null;
    }
  }, [startDurationTimer, stopDurationTimer, cancelPendingRestart]);

  const stopRecording = useCallback(() => {
    manualStopRef.current = true;
    cancelPendingRestart();
    stopDurationTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.stop();
      recognitionRef.current = null;
    }
    activeFieldRef.current = null;
    setRecording(false);
    setActiveField(null);
    setStatusText("Stopped");
  }, [cancelPendingRestart, stopDurationTimer]);

  const switchRecording = useCallback((fieldId: string, lang: string, onDelta: OnDeltaCallback) => {
    startRecording(fieldId, lang, onDelta);
  }, [startRecording]);

  const cancelRecording = useCallback(() => {
    manualStopRef.current = true;
    cancelPendingRestart();
    stopDurationTimer();
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    activeFieldRef.current = null;
    setRecording(false);
    setActiveField(null);
    setStatusText("Stopped");
  }, [cancelPendingRestart, stopDurationTimer]);

  const isFieldActive = useCallback((fieldId: string): boolean => {
    return recording && activeFieldRef.current === fieldId;
  }, [recording]);

  const state: VoiceSessionState = {
    recording,
    activeField,
    duration,
    durationFormatted: formatDuration(duration),
    statusText,
    errorMsg,
    unsupported,
  };

  return {
    state,
    startRecording,
    stopRecording,
    switchRecording,
    cancelRecording,
    isFieldActive,
  };
}
