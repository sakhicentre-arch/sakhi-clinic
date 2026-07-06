import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DictationButton from "../../components/DictationButton";

class MockSpeechRecognition {
  public continuous = false;
  public interimResults = false;
  public maxAlternatives = 1;
  public lang = "";
  public onstart: ((event: Event) => void) | null = null;
  public onresult: ((event: Event) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onend: ((event: Event) => void) | null = null;

  public start = vi.fn(() => {
    this.onstart?.(new Event("start"));
  });

  public stop = vi.fn(() => {
    this.onend?.(new Event("end"));
  });

  public abort = vi.fn();
}

describe("DictationButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  it("uses continuous recognition and stays recording across session restarts", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);

    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    render(<DictationButton onText={() => undefined} />);

    fireEvent.click(screen.getByRole("button"));

    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.start).toHaveBeenCalledTimes(1);

    act(() => {
      recognition.onend?.(new Event("end"));
      vi.advanceTimersByTime(150);
    });

    expect(recognition.start).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();
  });

  it("does not auto-restart after a no-speech error", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);

    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    render(<DictationButton onText={() => undefined} />);

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      recognition.onerror?.({ error: "no-speech" } as Event);
      vi.advanceTimersByTime(400);
    });

    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/No speech detected/)).toBeInTheDocument();
  });

  it("retries network errors only once", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);

    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    render(<DictationButton onText={() => undefined} />);

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      recognition.onerror?.({ error: "network" } as Event);
    });

    expect(recognition.start).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(400);
      vi.advanceTimersByTime(4000);
    });

    expect(recognition.start).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending restart when recording is stopped manually", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);

    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    render(<DictationButton onText={() => undefined} />);

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      recognition.onerror?.({ error: "network" } as Event);
    });

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(recognition.start).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();
  });

  it("cleans up timers on unmount", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    const { unmount } = render(<DictationButton onText={() => undefined} />);

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      recognition.onerror?.({ error: "network" } as Event);
    });

    unmount();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows a permission-denied message and does not auto-restart", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);

    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    render(<DictationButton onText={() => undefined} />);

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      recognition.onerror?.({ error: "not-allowed" } as Event);
      vi.advanceTimersByTime(400);
    });

    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Microphone permission denied/i)).toBeInTheDocument();
  });

  it("emits a transcript callback only once for the same final text", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);
    const onText = vi.fn();

    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    render(<DictationButton onText={onText} />);

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      recognition.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "fever" } }],
      } as any);
      recognition.onresult?.({
        results: [{ isFinal: true, 0: { transcript: "fever" } }],
      } as any);
    });

    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("fever");
  });

  it("cancels a pending restart when a new recording session starts", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);

    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    render(<DictationButton onText={() => undefined} />);

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      recognition.onerror?.({ error: "network" } as Event);
    });

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(recognition.start).toHaveBeenCalledTimes(2);
  });
});
