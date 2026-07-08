import React, { createContext, useContext } from "react";
import { useVoiceSession, type VoiceSessionState, type OnDeltaCallback } from "./useVoiceSession";

interface VoiceSessionContextValue {
  state: VoiceSessionState;
  startRecording: (fieldId: string, lang: string, onDelta: OnDeltaCallback) => void;
  stopRecording: () => void;
  switchRecording: (fieldId: string, lang: string, onDelta: OnDeltaCallback) => void;
  cancelRecording: () => void;
  isFieldActive: (fieldId: string) => boolean;
}

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null);

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const session = useVoiceSession();
  return (
    <VoiceSessionContext.Provider value={session}>
      {children}
    </VoiceSessionContext.Provider>
  );
}

export function useVoiceSessionContext(): VoiceSessionContextValue {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error(
      "useVoiceSessionContext must be used within a <VoiceSessionProvider>"
    );
  }
  return ctx;
}
