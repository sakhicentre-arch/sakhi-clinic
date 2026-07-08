import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import DictationButton from "../../components/DictationButton";
import { VoiceSessionProvider } from "../../hooks/VoiceSessionContext";

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

function renderWithProvider(ui: React.ReactElement) {
  return render(<VoiceSessionProvider>{ui}</VoiceSessionProvider>);
}

describe("DictationButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);
    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;
  });

  it("shows Start button when idle", () => {
    renderWithProvider(
      <DictationButton fieldId="test" onDelta={() => undefined} />
    );

    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
  });

  it("starts recording and shows Stop button", () => {
    renderWithProvider(
      <DictationButton fieldId="test" onDelta={() => undefined} />
    );

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument();
  });

  it("stops recording when Stop is clicked", () => {
    renderWithProvider(
      <DictationButton fieldId="test" onDelta={() => undefined} />
    );

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
  });

  it("shows unsupported state when SpeechRecognition API is missing", () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    renderWithProvider(
      <DictationButton fieldId="test" onDelta={() => undefined} />
    );

    expect(screen.getByText("Voice dictation unavailable")).toBeInTheDocument();
  });

  it("calls onDelta with transcript text", () => {
    const recognition = new MockSpeechRecognition();
    (window as any).SpeechRecognition = vi.fn(() => recognition);
    (window as any).webkitSpeechRecognition = vi.fn(() => recognition);

    const onDelta = vi.fn();

    renderWithProvider(
      <DictationButton fieldId="test" lang="gu-IN" onDelta={onDelta} />
    );

    fireEvent.click(screen.getByRole("button"));

    act(() => {
      recognition.onresult?.({
        results: [
          { isFinal: true, 0: { transcript: "શું તકલીફ છે" } },
        ],
      } as any);
    });

    expect(onDelta).toHaveBeenCalledWith("શું તકલીફ છે");
  });

  it("shows Switch button when another field is recording", () => {
    const recognition = new MockSpeechRecognition();
    (window as any).SpeechRecognition = vi.fn(() => recognition);
    (window as any).webkitSpeechRecognition = vi.fn(() => recognition);

    const onDelta = vi.fn();

    renderWithProvider(
      <div>
        <DictationButton fieldId="field1" lang="en-IN" onDelta={onDelta} />
        <DictationButton fieldId="field2" lang="en-IN" onDelta={onDelta} />
      </div>
    );

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);

    expect(screen.getByRole("button", { name: /switch recording/i })).toBeInTheDocument();
  });

  it("correctly counts multiple DictationButtons without duplicate instances", () => {
    const recognition = new MockSpeechRecognition();
    const RecognitionCtor = vi.fn(() => recognition);
    (window as any).SpeechRecognition = RecognitionCtor;
    (window as any).webkitSpeechRecognition = RecognitionCtor;

    const onDelta = vi.fn();

    renderWithProvider(
      <div>
        <DictationButton fieldId="a" lang="en-IN" onDelta={onDelta} />
        <DictationButton fieldId="b" lang="en-IN" onDelta={onDelta} />
        <DictationButton fieldId="c" lang="en-IN" onDelta={onDelta} />
      </div>
    );

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);

    expect(RecognitionCtor).toHaveBeenCalledTimes(1);

    fireEvent.click(buttons[1]);

    expect(recognition.abort).toHaveBeenCalled();
    expect(RecognitionCtor).toHaveBeenCalledTimes(2);
  });
});
