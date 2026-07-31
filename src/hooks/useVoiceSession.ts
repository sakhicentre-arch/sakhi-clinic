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
  const langRef = useRef<string>("en-IN");
  const manualStopRef = useRef(false);
  const sessionIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const durationTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const networkRetryCountRef = useRef(0);
  const restartScheduledRef = useRef(false);
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
    const timestamp = new Date().toISOString();
    console.log(
      `[VoiceSession START] fieldId="${fieldId}" lang="${lang}"`,
      {
        timestamp,
        existingSessionId: sessionIdRef.current,
      }
    );

    setRecording(true);
    setActiveField(fieldId);
    setDuration(0);
    startDurationTimer();

    activeFieldRef.current = fieldId;
    callbacksRef.current[fieldId] = onDelta;
    lastProcessedRef.current[fieldId] = 0;

    const recognition = new SpeechRecognitionAPI();
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    console.log(
      `[VoiceSession NEW] sessionId=${sessionId} fieldId="${fieldId}" lastProcessedReset=0`,
      { timestamp }
    );

    const resolvedLang = lang ?? document.documentElement.lang ?? "en-IN";
    langRef.current = resolvedLang;
    recognition.lang = resolvedLang;
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
      const timestamp = new Date().toISOString();

      // CRITICAL FIX: Check if this event is from the current session
      // On Android, old recognition's onresult can fire after new session starts
      if (sessionIdRef.current !== sessionId) {
        console.log(`[VoiceSession STALE] sessionId=${sessionId} vs current=${sessionIdRef.current} IGNORED`, {
          timestamp,
          resultIndex: event.resultIndex ?? 0,
          resultsLength: event.results.length,
        });
        return;
      }

      const field = activeFieldRef.current;
      if (!field) return;
      const callback = callbacksRef.current[field];
      if (!callback) return;

      const resultIndex = event.resultIndex ?? 0;
      const totalResults = event.results.length;
      const lastProcessed = lastProcessedRef.current[field] ?? 0;
      const startIdx = Math.max(resultIndex, lastProcessed);

      // DIAGNOSTIC: Log complete event for debugging
      const diagnosticResults = Array.from(event.results).map((r, idx) => ({
        idx,
        isFinal: r.isFinal,
        transcript: r[0]?.transcript ?? "",
      }));

      console.log(`[VoiceSession CURRENT] sessionId=${sessionId} field=${field}`, {
        timestamp,
        resultIndex,
        totalResults,
        lastProcessed,
        startIdx,
        results: diagnosticResults,
        currentSessionId: sessionIdRef.current,
      });

      const newFinalTexts: string[] = [];
      let maxIdx = lastProcessed;

      for (let i = startIdx; i < totalResults; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;
        console.log(
          `[VoiceSession PROCESS] sessionId=${sessionId} field=${field} resultIndex=${i} transcript="${transcript}"`,
          { timestamp, isFinal: result.isFinal }
        );
        newFinalTexts.push(transcript);
        maxIdx = i + 1;
      }

      if (newFinalTexts.length === 0) {
        console.log(`[VoiceSession SKIP] sessionId=${sessionId} field=${field} no new finals`, { timestamp });
        return;
      }

      lastProcessedRef.current[field] = maxIdx;
      const delta = newFinalTexts.join(" ");
      console.log(
        `[VoiceSession EMIT] sessionId=${sessionId} field=${field} delta="${delta}" maxIdx=${maxIdx}`,
        { timestamp }
      );
      callback(delta);
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

      // "no-speech" and a first "network" error recover on their own: the
      // "end" event that always follows "error" will trigger the existing
      // onend auto-restart, but only if activeFieldRef is still set. Every
      // other error is fatal (permission denied, no mic, etc.) and must
      // clear the field so no restart is attempted.
      const willAutoRecover =
        event.error === "no-speech" ||
        (event.error === "network" && networkRetryCountRef.current === 0);
      if (!willAutoRecover) {
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
            startRecording(savedField, langRef.current, savedCallback);
          }
        }, 400);
      }
    };

    recognition.onend = () => {
      console.log("[VoiceSession] onend:", {
        sessionId,
        currentSessionId: sessionIdRef.current,
        manualStop: manualStopRef.current,
        isMounted: isMountedRef.current,
        restartScheduled: restartScheduledRef.current,
        timestamp: new Date().toISOString().split("T")[1],
      });

      if (manualStopRef.current || !isMountedRef.current) {
        console.log("[VoiceSession] onend skipped (manual stop or unmounted)");
        setRecording(false);
        setActiveField(null);
        activeFieldRef.current = null;
        setStatusText("Stopped");
        stopDurationTimer();
        recognitionRef.current = null;
        return;
      }

      if (sessionIdRef.current !== sessionId || restartScheduledRef.current) {
        console.log("[VoiceSession] onend skipped (stale session or already scheduled)");
        return;
      }

      console.log("[VoiceSession] Scheduling restart from onend");
      recognitionRef.current = null;
      restartScheduledRef.current = true;
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        restartScheduledRef.current = false;
        if (!manualStopRef.current && isMountedRef.current && activeFieldRef.current) {
          const field = activeFieldRef.current;
          const cb = callbacksRef.current[field];
          console.log("[VoiceSession] Executing onend restart:", { field, sessionId });
          if (cb) startRecording(field, langRef.current, cb);
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
      // Do not null recognitionRef/activeFieldRef here: recognition.stop() is
      // async and the engine may still deliver one trailing final onresult
      // for audio already captured. Nulling the field ref now would cause
      // that trailing result to be dropped (or, if a new field starts
      // recording before it arrives, misrouted into the new field). The
      // onend handler's manual-stop branch performs the ref cleanup once the
      // engine actually finishes.
      recognition.stop();
    }
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
