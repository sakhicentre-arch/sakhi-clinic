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
});
