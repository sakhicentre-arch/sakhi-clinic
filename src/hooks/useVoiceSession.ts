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

const words = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);

// Zero-width joiners/non-joiners appear inconsistently in Indic output and are
// invisible, so they must not affect whether two words are considered equal.
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
// Latin punctuation plus the Devanagari/Gujarati danda and double danda. Chrome
// finalises a result with punctuation that the interim form did not carry.
const PUNCTUATION = /[.,!?;:।॥'"“”‘’()[\]{}—–-]/g;

/**
 * Comparison form of a word. Never emitted — only used to decide equality.
 * Chrome capitalises and punctuates on finalisation ("i have" -> "I have."),
 * and Indic text arrives in inconsistent Unicode composition, so raw string
 * equality misses overlaps that are plainly the same word.
 */
const normalizeWord = (w: string): string =>
  w.normalize("NFC").replace(ZERO_WIDTH, "").replace(PUNCTUATION, "").toLowerCase();

// Punctuation that attaches to the END of the word before it, so a delta
// starting with one of these must not be preceded by a space.
const LEADING_PUNCT = /^[.,!?;:।॥]/;
const TRAILING_PUNCT = /[.,!?;:।॥]+$/;

/**
 * Joins an emitted delta onto existing text. The single source of truth for
 * how deltas are concatenated: the hook uses it to keep its overlap history in
 * step with what the textarea actually contains, and the page uses it to build
 * the textarea. If these two ever disagreed, the next comparison would be made
 * against text that was never written and the duplicate would return.
 */
export const joinDelta = (base: string, delta: string): string => {
  if (!base) return delta;
  if (!delta) return base;
  return LEADING_PUNCT.test(delta) ? base + delta : `${base} ${delta}`;
};

/**
 * Trailing punctuation present on the incoming word but not on the committed
 * word it matched. Chrome adds sentence punctuation when it finalises, so the
 * refinement "मुझे बुखार है" -> "मुझे बुखार है।" is pure overlap at the word
 * level and would otherwise be dropped whole, losing the danda.
 *
 * The return value is drawn from the punctuation set only and can therefore
 * never re-emit a word. That is what makes carrying it safe.
 */
const carriedPunct = (incomingWord: string, committedWord: string): string => {
  if (TRAILING_PUNCT.test(committedWord)) return ""; // already punctuated
  const m = incomingWord.match(TRAILING_PUNCT);
  return m ? m[0] : "";
};

// Overlap can only ever occur at the seam between what was just committed and
// what is arriving, so comparing against the whole transcript is wasted work.
// Bounding it keeps cost constant instead of growing with dictation length —
// without this, a five-minute dictation degrades to O(n²) on every result event.
const OVERLAP_WINDOW_WORDS = 120;

export const tailWords = (s: string, limit = OVERLAP_WINDOW_WORDS): string => {
  const w = words(s);
  return w.length <= limit ? w.join(" ") : w.slice(-limit).join(" ");
};

/**
 * Android Chrome's speech engine does not deliver disjoint final results.
 * Consecutive finals overlap: after committing "મને", the next final arrives as
 * "મને તાવ" at a NEW result index. Index-based de-duplication cannot see this,
 * because each index really is emitted only once — the duplication lives in the
 * *content*, not the index.
 *
 * This returns the portion of `incoming` that is genuinely new, by finding the
 * longest suffix of what has already been committed that is also a prefix of
 * `incoming`, and dropping it. Comparison is word-wise, never character-wise,
 * so Indic grapheme clusters are never split.
 *
 * Examples (all three observed on-device):
 *   ("મને",       "મને તાવ")   -> "તાવ"
 *   ("શરદી",      "શરદી છે")   -> "છે"
 *   ("એકદ લેતા",  "લેતા આવશે") -> "આવશે"
 *   ("મને તાવ",   "મને તાવ")   -> ""      (pure replay, emit nothing)
 */
export const stripOverlap = (committed: string, incoming: string): string => {
  const nextRaw = words(incoming);
  if (nextRaw.length === 0) return "";

  const prevRaw = words(committed);
  if (prevRaw.length === 0) return nextRaw.join(" ");

  const max = Math.min(prevRaw.length, nextRaw.length);
  // Only the first `max` words of the incoming result can ever participate in a
  // match, so normalising beyond that is wasted work on every result event.
  const prev = prevRaw.slice(-max).map(normalizeWord);
  const next = nextRaw.slice(0, max).map(normalizeWord);

  for (let k = max; k > 0; k--) {
    let matches = true;
    for (let i = 0; i < k; i++) {
      if (prev[max - k + i] !== next[i]) {
        matches = false;
        break;
      }
    }
    // Emit the RAW words, never the normalised ones — normalisation exists only
    // to decide equality and would otherwise strip the doctor's punctuation.
    if (matches) {
      const rest = nextRaw.slice(k).join(" ");
      // next[k-1] is the last word of the overlap, and by construction it
      // matched the LAST committed word, so that is what to compare against.
      const punct = carriedPunct(nextRaw[k - 1], prevRaw[prevRaw.length - 1]);
      if (!punct) return rest;
      return rest ? `${punct} ${rest}` : punct;
    }
  }
  return nextRaw.join(" ");
};

// ── RVC-2 diagnostics ──────────────────────────────────────────────────────
// Observability only. None of this participates in transcript processing.

const isVerbose = (): boolean => {
  try {
    return (
      (globalThis as any).DEBUG_VOICE_VERBOSE === true ||
      window.localStorage?.getItem("DEBUG_VOICE_VERBOSE") === "true"
    );
  } catch {
    return false;
  }
};

// djb2. Cheap and stable — enough to tell at a glance whether two committed
// states are identical without printing either of them.
const hashText = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * Compact description of the overlap history. The full text is printed only
 * under DEBUG_VOICE_VERBOSE, because it is re-logged on every result event and
 * dominates log volume on a long dictation.
 *
 * committedHash is the useful field: if it differs from the hash of the text
 * the textarea actually holds, history and record have diverged.
 */
const describeCommitted = (s: string) => {
  const base = {
    committedLength: s.length,
    committedHash: hashText(s),
    committedTail: s.slice(-40),
  };
  return isVerbose() ? { ...base, committed: s } : base;
};

/**
 * The onresult event currently being processed. `callback(delta)` runs
 * synchronously inside onresult, so ConsultationPage.appendField can read this
 * to tag its own log with the same eventId without changing the callback
 * signature or rippling through every DictationButton call site.
 */
let currentEvent = { eventId: 0, sessionId: 0, fieldId: "" };
export const getCurrentVoiceEvent = () => currentEvent;

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
  // Text this field has already emitted, used to strip Android's overlapping
  // finals. Survives automatic restarts (the overlap frequently straddles a
  // restart boundary); cleared only on a user-initiated start.
  const committedRef = useRef<Record<string, string>>({});
  const autoRestartRef = useRef(false);
  // Diagnostics only: groups every log emitted while one onresult is processed.
  const eventIdRef = useRef(0);

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
      `[VoiceSession START] fieldId="${fieldId}" lang="${lang}" lastEventId=${eventIdRef.current}`,
      {
        timestamp,
        fieldId,
        lang,
        lastEventId: eventIdRef.current,
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

    // An automatic restart is a continuation of the same dictation, so the
    // overlap history must carry over. A user-initiated start is a new
    // dictation and begins with a clean slate.
    const isAutoRestart = autoRestartRef.current;
    autoRestartRef.current = false;
    if (!isAutoRestart) {
      committedRef.current[fieldId] = "";
    }

    const recognition = new SpeechRecognitionAPI();
    const sessionId = sessionIdRef.current + 1;
    sessionIdRef.current = sessionId;
    console.log(
      `[VoiceSession NEW] sessionId=${sessionId} fieldId="${fieldId}" lastEventId=${eventIdRef.current} lastProcessedReset=0 autoRestart=${isAutoRestart}`,
      {
        timestamp,
        sessionId,
        fieldId,
        lastEventId: eventIdRef.current,
        autoRestart: isAutoRestart,
        ...describeCommitted(committedRef.current[fieldId] ?? ""),
      }
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
      const eventId = ++eventIdRef.current;

      // CRITICAL FIX: Check if this event is from the current session
      // On Android, old recognition's onresult can fire after new session starts
      if (sessionIdRef.current !== sessionId) {
        console.log(
          `[VoiceSession STALE] eventId=${eventId} sessionId=${sessionId} fieldId="${activeFieldRef.current ?? ""}" vs current=${sessionIdRef.current} IGNORED`,
          {
            timestamp,
            eventId,
            sessionId,
            fieldId: activeFieldRef.current,
            currentSessionId: sessionIdRef.current,
            resultIndex: event.resultIndex ?? 0,
            resultsLength: event.results.length,
          }
        );
        return;
      }

      const field = activeFieldRef.current;
      if (!field) return;
      const callback = callbacksRef.current[field];
      if (!callback) return;

      // Read synchronously inside onresult by appendField, so its log carries
      // the same eventId as the logs above and below it.
      currentEvent = { eventId, sessionId, fieldId: field };

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

      console.log(
        `[VoiceSession CURRENT] eventId=${eventId} sessionId=${sessionId} fieldId="${field}"`,
        {
          timestamp,
          eventId,
          sessionId,
          fieldId: field,
          resultIndex,
          totalResults,
          lastProcessed,
          startIdx,
          results: diagnosticResults,
          ...describeCommitted(committedRef.current[field] ?? ""),
        }
      );

      const newFinalTexts: string[] = [];
      let maxIdx = lastProcessed;
      // Local running copy so that when one event carries several new finals,
      // each is stripped against the ones emitted earlier in this same loop.
      let committed = committedRef.current[field] ?? "";

      for (let i = startIdx; i < totalResults; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;
        maxIdx = i + 1;

        // Android re-states already-committed words inside the next final.
        // Emit only the genuinely new tail.
        const fresh = stripOverlap(committed, transcript);
        console.log(
          `[VoiceSession PROCESS] eventId=${eventId} sessionId=${sessionId} fieldId="${field}" resultIndex=${i} transcript="${transcript}" fresh="${fresh}"`,
          {
            timestamp,
            eventId,
            sessionId,
            fieldId: field,
            resultIndex: i,
            isFinal: result.isFinal,
            transcript,
            fresh,
            ...describeCommitted(committed),
          }
        );
        if (!fresh) continue;

        newFinalTexts.push(fresh);
        // joinDelta, not plain concatenation: a carried "।" attaches to the
        // previous word exactly as it will in the textarea. If history and
        // textarea diverged, the next overlap check would compare against text
        // that was never written and the duplicate would come back.
        committed = tailWords(joinDelta(committed, fresh));
      }

      lastProcessedRef.current[field] = maxIdx;

      if (newFinalTexts.length === 0) {
        console.log(
          `[VoiceSession SKIP] eventId=${eventId} sessionId=${sessionId} fieldId="${field}" no new text`,
          { timestamp, eventId, sessionId, fieldId: field, maxIdx, ...describeCommitted(committed) }
        );
        return;
      }

      committedRef.current[field] = committed;
      // Same joining rule again: a later piece may itself begin with carried
      // punctuation that must attach rather than sit after a space.
      const delta = newFinalTexts.reduce((a, b) => joinDelta(a, b), "");
      console.log(
        `[VoiceSession EMIT] eventId=${eventId} sessionId=${sessionId} fieldId="${field}" delta="${delta}" maxIdx=${maxIdx}`,
        { timestamp, eventId, sessionId, fieldId: field, delta, maxIdx, ...describeCommitted(committed) }
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
            autoRestartRef.current = true; // continuation, keep overlap history
            startRecording(savedField, langRef.current, savedCallback);
          }
        }, 400);
      }
    };

    recognition.onend = () => {
      const endFieldId = activeFieldRef.current;
      console.log(
        `[VoiceSession ONEND] sessionId=${sessionId} fieldId="${endFieldId ?? ""}" lastEventId=${eventIdRef.current}`,
        {
          timestamp: new Date().toISOString(),
          sessionId,
          fieldId: endFieldId,
          lastEventId: eventIdRef.current,
          currentSessionId: sessionIdRef.current,
          manualStop: manualStopRef.current,
          isMounted: isMountedRef.current,
          restartScheduled: restartScheduledRef.current,
        }
      );

      if (manualStopRef.current || !isMountedRef.current) {
        console.log(
          `[VoiceSession ONEND-STOP] sessionId=${sessionId} fieldId="${endFieldId ?? ""}" lastEventId=${eventIdRef.current} manual stop or unmounted`
        );
        setRecording(false);
        setActiveField(null);
        activeFieldRef.current = null;
        setStatusText("Stopped");
        stopDurationTimer();
        recognitionRef.current = null;
        return;
      }

      if (sessionIdRef.current !== sessionId || restartScheduledRef.current) {
        console.log(
          `[VoiceSession ONEND-SKIP] sessionId=${sessionId} fieldId="${endFieldId ?? ""}" lastEventId=${eventIdRef.current} stale session or restart already scheduled`
        );
        return;
      }

      console.log(
        `[VoiceSession RESTART-SCHEDULED] sessionId=${sessionId} fieldId="${endFieldId ?? ""}" lastEventId=${eventIdRef.current} in 120ms`
      );
      recognitionRef.current = null;
      restartScheduledRef.current = true;
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        restartScheduledRef.current = false;
        if (!manualStopRef.current && isMountedRef.current && activeFieldRef.current) {
          const field = activeFieldRef.current;
          const cb = callbacksRef.current[field];
          console.log(
            `[VoiceSession RESTART-FIRE] sessionId=${sessionId} fieldId="${field}" lastEventId=${eventIdRef.current}`,
            { fieldId: field, sessionId, lastEventId: eventIdRef.current, ...describeCommitted(committedRef.current[field] ?? "") }
          );
          if (cb) {
            autoRestartRef.current = true; // continuation, keep overlap history
            startRecording(field, langRef.current, cb);
          }
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
