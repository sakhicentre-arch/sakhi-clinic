import React from "react";
import TopBar from "./TopBar";
import LeftNav from "./LeftNav";
import { AppViewportFrame } from "./LayoutPrimitives";
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
      <AppViewportFrame>{children}</AppViewportFrame>
    </>
  );
}
