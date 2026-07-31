import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceSession, stripOverlap, tailWords, joinDelta } from "../../hooks/useVoiceSession";

class MockSpeechRecognition {
  public continuous = false;
  public interimResults = false;
  public maxAlternatives = 1;
  public lang = "";
  public onstart: ((event: Event) => void) | null = null;
  public onresult: ((event: any) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onend: ((event: Event) => void) | null = null;

  public start = vi.fn(() => {
    this.onstart?.(new Event("start"));
  });

  // Real engines call stop() asynchronously: onend (and any final trailing
  // onresult) fires later, not synchronously within stop(). Tests that need
  // onend must fire it explicitly via recognition.onend?.(...).
  public stop = vi.fn();

  public abort = vi.fn();
}

function setupSpeechRecognitionMock() {
  const recognition = new MockSpeechRecognition();
  const RecognitionCtor = vi.fn(() => recognition);
  (window as any).SpeechRecognition = RecognitionCtor;
  (window as any).webkitSpeechRecognition = RecognitionCtor;
  return { recognition, RecognitionCtor };
}

describe("useVoiceSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  it("creates a single SpeechRecognition instance", () => {
    const { recognition, RecognitionCtor } = setupSpeechRecognitionMock();
    const onDelta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", onDelta);
    });

    expect(RecognitionCtor).toHaveBeenCalledTimes(1);
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });

  it("only allows one active field at a time", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta1 = vi.fn();
    const delta2 = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta1);
    });

    expect(result.current.state.activeField).toBe("field1");
    expect(result.current.state.recording).toBe(true);

    act(() => {
      result.current.startRecording("field2", "en-IN", delta2);
    });

    expect(recognition.abort).toHaveBeenCalled();
    expect(result.current.state.activeField).toBe("field2");
    expect(result.current.state.recording).toBe(true);
  });

  it("emits only transcript deltas, not full accumulated text", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "મને છેલ્લા 15 દિવસથી" } },
        ],
      } as any);
    });

    expect(delta).toHaveBeenCalledTimes(1);
    expect(delta).toHaveBeenCalledWith("મને છેલ્લા 15 દિવસથી");

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "મને છેલ્લા 15 દિવસથી" } },
          { isFinal: true, 0: { transcript: "માથાનો દુખાવો છે." } },
        ],
      } as any);
    });

    expect(delta).toHaveBeenCalledTimes(2);
    expect(delta).toHaveBeenLastCalledWith("માથાનો દુખાવો છે.");
  });

  it("never emits the same transcript delta twice", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "hello world" } },
        ],
      } as any);
    });

    expect(delta).toHaveBeenCalledTimes(1);

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "hello world" } },
        ],
      } as any);
    });

    expect(delta).toHaveBeenCalledTimes(1);
  });

  it("switching fields commits current delta and starts new field", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta1 = vi.fn();
    const delta2 = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta1);
    });

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "complaint text" } },
        ],
      } as any);
    });

    act(() => {
      result.current.startRecording("field2", "en-IN", delta2);
    });

    expect(result.current.state.activeField).toBe("field2");
    expect(result.current.state.recording).toBe(true);
  });

  it("stops recording and resets state", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    expect(result.current.state.recording).toBe(true);

    act(() => {
      result.current.stopRecording();
    });

    expect(recognition.stop).toHaveBeenCalled();
    expect(result.current.state.recording).toBe(false);
    expect(result.current.state.activeField).toBe(null);
  });

  it("delivers a trailing final result received after stop() to the field that was recording", () => {
    // Regression test: recognition.stop() is asynchronous in real browsers —
    // the engine can still deliver one more final onresult for audio already
    // captured before onend fires. That trailing result must reach the field
    // that was recording, not be dropped.
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.state.recording).toBe(false);

    act(() => {
      recognition.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "trailing words" } }],
      } as any);
    });

    expect(delta).toHaveBeenCalledWith("trailing words");

    act(() => {
      recognition.onend?.(new Event("end"));
    });

    expect(result.current.isFieldActive("field1")).toBe(false);
  });

  it("does not misroute a stopped field's trailing result into a newly started field", () => {
    // Regression test: if the doctor stops field1 and immediately starts
    // field2 before field1's recognition instance has fully ended, field1's
    // late-arriving onresult must not be attributed to field2.
    const instances: MockSpeechRecognition[] = [];
    const RecognitionCtor = vi.fn(() => {
      const instance = new MockSpeechRecognition();
      instances.push(instance);
      return instance;
    });
    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    const delta1 = vi.fn();
    const delta2 = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta1);
    });
    const recognitionField1 = instances[0];

    act(() => {
      result.current.stopRecording();
    });

    act(() => {
      result.current.startRecording("field2", "en-IN", delta2);
    });

    expect(instances.length).toBe(2);
    expect(recognitionField1.onresult).toBe(null);

    act(() => {
      recognitionField1.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "late field1 words" } }],
      } as any);
    });

    expect(delta1).not.toHaveBeenCalled();
    expect(delta2).not.toHaveBeenCalled();
  });

  it("handles permission-denied error without auto-restart", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      recognition.onerror?.({ error: "not-allowed" } as any);
    });

    expect(result.current.state.recording).toBe(false);
    expect(result.current.state.activeField).toBe(null);
    expect(result.current.state.errorMsg).toContain("Microphone permission denied");
  });

  it("shows a stopped state immediately when no-speech fires, before the engine's end event", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      recognition.onerror?.({ error: "no-speech" } as any);
    });

    expect(result.current.state.recording).toBe(false);
  });

  it("auto-restarts after no-speech once the engine's end event follows (Android silence timeout)", () => {
    // Per the Web Speech spec, "error" is always followed by "end". Android
    // Chrome fires "no-speech" aggressively during ordinary dictation pauses;
    // dictation must resume on its own via the existing onend restart path
    // instead of silently staying stopped.
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      recognition.onerror?.({ error: "no-speech" } as any);
    });

    act(() => {
      recognition.onend?.(new Event("end"));
    });

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(result.current.state.recording).toBe(true);
    expect(result.current.state.activeField).toBe("field1");
  });

  it("retries network error once", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      recognition.onerror?.({ error: "network" } as any);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.state.recording).toBe(true);
  });

  it("does not retry after manual stop", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.state.recording).toBe(false);
    expect(result.current.state.activeField).toBe(null);
  });

  it("cancels recording with abort", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      result.current.cancelRecording();
    });

    expect(recognition.abort).toHaveBeenCalled();
    expect(result.current.state.recording).toBe(false);
    expect(result.current.state.activeField).toBe(null);
  });

  it("rapid field switching does not cause duplicate transcripts", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta1 = vi.fn();
    const delta2 = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta1);
    });

    act(() => {
      result.current.startRecording("field2", "en-IN", delta2);
    });

    act(() => {
      result.current.startRecording("field1", "en-IN", delta1);
    });

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "final text" } },
        ],
      } as any);
    });

    expect(delta1).toHaveBeenCalledWith("final text");
    expect(delta2).not.toHaveBeenCalled();
  });

  it("reports unsupported state when SpeechRecognition is unavailable", () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    const { result } = renderHook(() => useVoiceSession());

    expect(result.current.state.unsupported).toBe(true);
  });

  it("isFieldActive returns correct field state", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    expect(result.current.isFieldActive("field1")).toBe(false);

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    expect(result.current.isFieldActive("field1")).toBe(true);
    expect(result.current.isFieldActive("field2")).toBe(false);

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.isFieldActive("field1")).toBe(false);
  });

  it("cancels pending restart on manual stop during error", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      recognition.onerror?.({ error: "network" } as any);
    });

    act(() => {
      result.current.stopRecording();
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.state.recording).toBe(false);
  });

  it("transcript delta computed correctly for partial additions", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "a" } },
        ],
      } as any);
    });

    expect(delta).toHaveBeenCalledWith("a");

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "a" } },
          { isFinal: true, 0: { transcript: "b" } },
        ],
      } as any);
    });

    expect(delta).toHaveBeenCalledWith("b");
  });

  it("cancelRecording immediately aborts and clears all refs", () => {
    // Regression test for BUG-01: ensures that Save & Next flow cannot leak
    // recognition deltas into a newly-switched patient's record.
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();

    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "en-IN", delta);
    });

    expect(result.current.state.recording).toBe(true);
    expect(result.current.state.activeField).toBe("field1");

    act(() => {
      result.current.cancelRecording();
    });

    expect(recognition.abort).toHaveBeenCalled();
    expect(result.current.state.recording).toBe(false);
    expect(result.current.state.activeField).toBe(null);

    act(() => {
      recognition.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "should not leak" } }],
      } as any);
    });

    expect(delta).not.toHaveBeenCalled();
  });

  it("selected language persists after auto-restart (BUG-02 regression)", () => {
    // Regression test for BUG-02: selected language must be preserved across
    // any automatic restart (network error, no-speech, natural cycling).
    const instances: MockSpeechRecognition[] = [];
    const RecognitionCtor = vi.fn(() => {
      const instance = new MockSpeechRecognition();
      instances.push(instance);
      return instance;
    });
    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    const delta = vi.fn();
    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "gu-IN", delta);
    });

    expect(instances[0].lang).toBe("gu-IN");

    // Simulate onend, which triggers auto-restart
    act(() => {
      instances[0].onend?.(new Event("end"));
    });

    // Advance timers past the 120ms restart delay
    act(() => {
      vi.advanceTimersByTime(120);
    });

    // Confirm a new instance was created via restart
    expect(instances.length).toBeGreaterThan(1);

    // The new instance must have the same language as the first
    expect(instances[instances.length - 1].lang).toBe("gu-IN");
  });

  // ───────────────────────────────────────────────────────────────────────
  // Android Chrome result model.
  //
  // Android does NOT deliver disjoint finals. Consecutive final results
  // overlap: after "મને" is final at index 0, the next final arrives at
  // index 1 as "મને તાવ" — re-stating text already committed. Index-based
  // de-duplication cannot see this because each index IS emitted only once.
  //
  // Each case below is a verbatim on-device reproduction.
  // ───────────────────────────────────────────────────────────────────────
  const final = (t: string) => ({ isFinal: true, 0: { transcript: t } });

  it("Android overlapping finals: 'મને તાવ આવે છે' is not duplicated", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();
    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "gu-IN", delta);
    });

    const events = [
      ["મને"],
      ["મને", "મને તાવ"],
      ["મને", "મને તાવ", "મને તાવ આવે"],
      ["મને", "મને તાવ", "મને તાવ આવે", "મને તાવ આવે છે"],
    ];

    events.forEach((transcripts, i) => {
      act(() => {
        recognition.onresult?.({
          resultIndex: i,
          results: transcripts.map(final),
        } as any);
      });
    });

    const emitted = delta.mock.calls.map((c) => c[0]).join(" ");
    expect(emitted).toBe("મને તાવ આવે છે");
  });

  it("Android overlapping finals: 'શરદી છે' is not duplicated", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();
    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "gu-IN", delta);
    });

    act(() => {
      recognition.onresult?.({ resultIndex: 0, results: [final("શરદી")] } as any);
    });
    act(() => {
      recognition.onresult?.({
        resultIndex: 1,
        results: [final("શરદી"), final("શરદી છે")],
      } as any);
    });

    expect(delta.mock.calls.map((c) => c[0]).join(" ")).toBe("શરદી છે");
  });

  it("Android overlapping finals: partial tail overlap 'એકદ લેતા આવશે'", () => {
    // Android re-segments mid-utterance, so the third final overlaps only the
    // TAIL of the second ("લેતા"), not the whole committed prefix.
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();
    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "gu-IN", delta);
    });

    const events = [
      ["એકદ"],
      ["એકદ", "એકદ લેતા"],
      ["એકદ", "એકદ લેતા", "લેતા આવશે"],
    ];

    events.forEach((transcripts, i) => {
      act(() => {
        recognition.onresult?.({
          resultIndex: i,
          results: transcripts.map(final),
        } as any);
      });
    });

    expect(delta.mock.calls.map((c) => c[0]).join(" ")).toBe("એકદ લેતા આવશે");
  });

  it("overlap history survives an automatic restart", () => {
    // Android ends the session constantly regardless of continuous=true, so the
    // overlap routinely straddles a restart boundary. If history were cleared on
    // restart the duplicate would reappear at exactly that seam.
    const instances: any[] = [];
    const RecognitionCtor = vi.fn(() => {
      const r = new MockSpeechRecognition();
      instances.push(r);
      return r;
    });
    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    const delta = vi.fn();
    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "gu-IN", delta);
    });
    act(() => {
      instances[0].onresult?.({ resultIndex: 0, results: [final("શરદી")] } as any);
    });

    act(() => {
      instances[0].onend?.(new Event("end"));
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(instances.length).toBeGreaterThan(1);

    // Fresh session replays the committed word ahead of the new one.
    act(() => {
      instances[instances.length - 1].onresult?.({
        resultIndex: 0,
        results: [final("શરદી છે")],
      } as any);
    });

    expect(delta.mock.calls.map((c) => c[0]).join(" ")).toBe("શરદી છે");
  });

  it("a user-initiated start clears overlap history", () => {
    // Otherwise a second dictation opening with the same word as the previous
    // one ended would be silently swallowed.
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();
    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "gu-IN", delta);
    });
    act(() => {
      recognition.onresult?.({ resultIndex: 0, results: [final("શરદી")] } as any);
    });

    act(() => {
      result.current.stopRecording();
    });
    act(() => {
      result.current.startRecording("field1", "gu-IN", delta);
    });
    act(() => {
      recognition.onresult?.({ resultIndex: 0, results: [final("શરદી")] } as any);
    });

    expect(delta.mock.calls.map((c) => c[0])).toEqual(["શરદી", "શરદી"]);
  });
});

describe("stripOverlap", () => {
  // ── 1 & 2: genuine repetition must survive ────────────────────────────
  it("keeps a repeated word that arrives inside one final", () => {
    expect(stripOverlap("", "બહુ બહુ")).toBe("બહુ બહુ");
  });

  it("keeps a repeated word across Android's accumulating finals", () => {
    // ["બહુ"] then ["બહુ", "બહુ બહુ"]
    expect(stripOverlap("બહુ", "બહુ બહુ")).toBe("બહુ");
  });

  it("keeps a repeated phrase across accumulating finals", () => {
    expect(
      stripOverlap("તાવ આવે છે", "તાવ આવે છે તાવ આવે છે")
    ).toBe("તાવ આવે છે");
  });

  // ── 3: KNOWN LIMITATION, asserted so it can never change silently ─────
  it("KNOWN LIMITATION: drops a genuine repeat split exactly on a segment seam", () => {
    // Byte-identical to a real Android replay, so content alone cannot tell
    // them apart. Bounded in practice: Android segments at pauses, and an
    // intensifier like "બહુ બહુ" is spoken without one.
    expect(stripOverlap("તાવ બહુ", "બહુ છે")).toBe("છે");
  });

  // ── 4 & 7: punctuation and capitalisation ─────────────────────────────
  it("matches across Chrome's finalisation capitalisation", () => {
    expect(stripOverlap("i have", "I have fever")).toBe("fever");
  });

  it("matches across Chrome's finalisation punctuation, emitting raw text", () => {
    expect(stripOverlap("I have fever", "I have fever. It is high")).toBe(". It is high");
  });

  it("does not strip punctuation from the text it emits", () => {
    expect(stripOverlap("patient says", "patient says: fever, cough.")).toBe(": fever, cough.");
  });

  // ── 5 & 6: Unicode normalisation, Indic punctuation ───────────────────
  it("matches across NFC/NFD composition differences", () => {
    expect(stripOverlap("café", "café open")).toBe("open");
  });

  it("ignores zero-width joiners when comparing", () => {
    expect(stripOverlap("તાવ", "તા\u200Cવ આવે")).toBe("આવે");
  });

  it("matches across the Devanagari danda", () => {
    expect(stripOverlap("मुझे बुखार", "बुखार। दर्द है")).toBe("। दर्द है");
  });

  // ── 8: mixed language ─────────────────────────────────────────────────
  it("handles mixed-script overlap", () => {
    expect(stripOverlap("patient તાવ", "તાવ since morning")).toBe("since morning");
  });

  // ── 9: long dictation ─────────────────────────────────────────────────
  it("bounds retained history so long dictation stays constant-cost", () => {
    const long = Array.from({ length: 500 }, (_, i) => `w${i}`).join(" ");
    expect(tailWords(long).split(" ")).toHaveLength(120);
    expect(tailWords(long).endsWith("w499")).toBe(true);
  });

  it("still strips at the seam after a very long dictation", () => {
    const long = Array.from({ length: 500 }, (_, i) => `w${i}`).join(" ");
    expect(stripOverlap(tailWords(long), "w499 next")).toBe("next");
  });

  it("returns the whole result when nothing overlaps", () => {
    expect(stripOverlap("alpha beta", "gamma delta")).toBe("gamma delta");
  });

  it("emits nothing for a pure replay", () => {
    expect(stripOverlap("તાવ આવે", "તાવ આવે")).toBe("");
  });
});

describe("punctuation carrying", () => {
  // Chrome adds sentence punctuation when it finalises, so the refinement
  // "मुझे बुखार है" -> "मुझे बुखार है।" is pure overlap at the word level.
  // Dropping it whole loses the danda from the medical record.
  it("carries sentence-final punctuation that the committed text lacks", () => {
    expect(stripOverlap("मुझे बुखार है", "मुझे बुखार है।")).toBe("।");
  });

  it("carries an English full stop", () => {
    expect(stripOverlap("I have fever", "I have fever.")).toBe(".");
  });

  it("carries mid-sentence punctuation ahead of the new words", () => {
    expect(stripOverlap("मुझे बुखार", "मुझे बुखार। दर्द है")).toBe("। दर्द है");
  });

  // THE INVARIANT. Carrying punctuation changes the committed text, so the
  // next comparison is made against the changed form. If history and textarea
  // ever diverged here, every later result would miss its overlap and the word
  // duplication would return in full.
  it("is idempotent: a repeated punctuated final emits nothing", () => {
    const once = "मुझे बुखार है";
    const punctuated = "मुझे बुखार है।";
    const carried = stripOverlap(once, punctuated);
    expect(carried).toBe("।");
    const committed = joinDelta(once, carried);
    expect(committed).toBe(punctuated);
    expect(stripOverlap(committed, punctuated)).toBe("");
  });

  it("does not double punctuation already present", () => {
    expect(stripOverlap("I have fever.", "I have fever.")).toBe("");
  });

  it("carries nothing when the committed word is already punctuated", () => {
    expect(stripOverlap("I have fever,", "I have fever, and cough")).toBe("and cough");
  });
});

describe("joinDelta", () => {
  it("attaches punctuation without a leading space", () => {
    expect(joinDelta("मुझे बुखार है", "।")).toBe("मुझे बुखार है।");
  });

  it("attaches a punctuation-led phrase without a leading space", () => {
    expect(joinDelta("patient says", ", cough")).toBe("patient says, cough");
  });

  it("separates ordinary words with a single space", () => {
    expect(joinDelta("I have", "fever")).toBe("I have fever");
  });

  it("returns the delta when there is no base", () => {
    expect(joinDelta("", "fever")).toBe("fever");
  });

  it("returns the base when the delta is empty", () => {
    expect(joinDelta("fever", "")).toBe("fever");
  });
});

describe("punctuation carrying through the hook", () => {
  // The direct stripOverlap/joinDelta tests cannot see the hook's own history
  // accumulation. This drives real onresult events so that a divergence between
  // committedRef and the textarea is caught.
  const finalR = (t: string) => ({ isFinal: true, 0: { transcript: t } });

  it("carries the danda once and never re-emits words afterwards", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();
    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "hi-IN", delta);
    });

    const plain = "मुझे बुखार है";
    const punctuated = plain + "।";

    act(() => {
      recognition.onresult?.({ resultIndex: 0, results: [finalR(plain)] } as any);
    });
    act(() => {
      recognition.onresult?.({
        resultIndex: 1,
        results: [finalR(plain), finalR(punctuated)],
      } as any);
    });
    // Android replays the punctuated form again — must add nothing at all.
    act(() => {
      recognition.onresult?.({
        resultIndex: 2,
        results: [finalR(plain), finalR(punctuated), finalR(punctuated)],
      } as any);
    });

    // Reconstruct the textarea exactly as ConsultationPage.appendField does.
    const textarea = delta.mock.calls
      .map((c) => c[0] as string)
      .reduce((acc, d) => joinDelta(acc, d), "");

    expect(textarea).toBe(punctuated);
  });

  it("keeps stripping correctly on the result after a carry", () => {
    const { recognition } = setupSpeechRecognitionMock();
    const delta = vi.fn();
    const { result } = renderHook(() => useVoiceSession());

    act(() => {
      result.current.startRecording("field1", "hi-IN", delta);
    });

    const a = "मुझे बुखार है";
    const b = a + "।";
    const c = b + " दर्द है";

    act(() => {
      recognition.onresult?.({ resultIndex: 0, results: [finalR(a)] } as any);
    });
    act(() => {
      recognition.onresult?.({ resultIndex: 1, results: [finalR(a), finalR(b)] } as any);
    });
    act(() => {
      recognition.onresult?.({
        resultIndex: 2,
        results: [finalR(a), finalR(b), finalR(c)],
      } as any);
    });

    const textarea = delta.mock.calls
      .map((x) => x[0] as string)
      .reduce((acc, d) => joinDelta(acc, d), "");

    expect(textarea).toBe(c);
  });
});
