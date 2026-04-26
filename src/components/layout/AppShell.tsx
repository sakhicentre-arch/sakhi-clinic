import React from "react";
import TopBar from "./TopBar";
import LeftNav from "./LeftNav";
import { ActivePage } from "../../store/uiStore";

interface AppShellProps {
  children: React.ReactNode;
  onNavigate: (page: ActivePage) => void;
  onPatientSelect: (patientId: string) => void;
}

export default function AppShell({
  children,
  onNavigate,
  onPatientSelect,
}: AppShellProps) {
  return (
    <>
      <TopBar onPatientSelect={onPatientSelect} />
      <LeftNav onNavigate={onNavigate} />
      <main
        style={{
          marginLeft: "64px",
          background: "#f8fafc",
          minHeight: `calc(100vh - 59px)`,
        }}
      >
        {children}
      </main>
    </>
  );
}
