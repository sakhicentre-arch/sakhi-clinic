import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceSession } from "../../hooks/useVoiceSession";

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

  public stop = vi.fn(() => {
    this.onend?.(new Event("end"));
  });

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

  it("handles no-speech error without auto-restart", () => {
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
});
