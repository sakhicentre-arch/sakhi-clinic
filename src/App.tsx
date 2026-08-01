import "./App.css";
import { useState, useEffect } from "react";
import PatientPage from "./pages/PatientPage";
import AppointmentPage from "./pages/AppointmentPage";
import ConsultationPage from "./pages/ConsultationPage";
import PrescriptionPrint from "./pages/PrescriptionPrint";
import RevenuePage from "./pages/RevenuePage";
import TodayPage from "./pages/TodayPage";
import DashboardPage from "./pages/DashboardPage";
import ReviewPage from "./pages/ReviewPage";
import AppShell from "./components/layout/AppShell";
import useSafeViewport from "./hooks/useSafeViewport";
import { useUIStore, ActivePage } from "./store/uiStore";
import TrashPage from "./pages/TrashPage";
import SettingsPage from "./pages/SettingsPage";
import { VoiceSessionProvider } from "./hooks/VoiceSessionContext";
import OriginMismatchBanner from "./components/OriginMismatchBanner";
import { acknowledgeOriginChange, checkOriginIdentity, OriginCheckResult } from "./services/originIdentityService";

export default function App() {
  useSafeViewport();
  const isReviewPath = window.location.pathname === "/review";

  const [page, setPage] = useState(isReviewPath ? "review" : "today");
  const [originCheck, setOriginCheck] = useState<OriginCheckResult | null>(null);
  const activePatientId = useUIStore((s) => s.activePatientId);
  const activeAppointmentId = useUIStore((s) => s.activeAppointmentId);
  const setActivePage = useUIStore((s) => s.setActivePage);
  const setActivePatientId = useUIStore((s) => s.setActivePatientId);
  const setActiveConsultation = useUIStore((s) => s.setActiveConsultation);

  useEffect(() => {
    if (isReviewPath) {
      setPage("review");
    } else {
      setActivePage(page as ActivePage);
    }
  }, [page, setActivePage, isReviewPath]);

  // Module A: origin-identity self-check, once per app load. Detection only —
  // never blocks rendering or navigation.
  useEffect(() => {
    let cancelled = false;
    checkOriginIdentity()
      .then((result) => {
        if (!cancelled) setOriginCheck(result);
      })
      .catch(() => {
        // checkOriginIdentity itself never throws, but guard anyway: a
        // failure here must never break app startup.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goToConsultation = (patientId: string, appointmentId: string) => {
    setPage("consultation");
    setActiveConsultation(patientId, appointmentId);
  };

  const handleNavigate = (navPage: ActivePage) => {
    if (navPage === "print") return;
    setPage(navPage);
  };

  const handlePatientSelect = (patientId: string) => {
    setActivePatientId(patientId);
    setPage("patients");
  };

  if (page === "review") {
    return <ReviewPage />;
  }

  if (page === "print") {
    return <PrescriptionPrint />;
  }

  const originBanner =
    originCheck?.status === "mismatch" ? (
      <OriginMismatchBanner
        currentOrigin={originCheck.currentOrigin}
        recordedOrigin={originCheck.recordedOrigin}
        onAcknowledge={async () => {
          await acknowledgeOriginChange();
          setOriginCheck({ ...originCheck, status: "match", recordedOrigin: originCheck.currentOrigin });
        }}
      />
    ) : null;

  return (
    <>
      {originBanner}
      <AppShell onNavigate={handleNavigate} onPatientSelect={handlePatientSelect}>
      {page === "today" && (
        <TodayPage goToConsultation={goToConsultation} />
      )}
      {page === "patients" && (
  <PatientPage
    goToConsultation={goToConsultation}
    initialPatientId={activePatientId || undefined}
  />
)}
      {page === "appointments" && (
        <AppointmentPage goToConsultation={goToConsultation} />
      )}

      {/* ✅ Step 1: Pass onNavigate to DashboardPage */}
      {page === "dashboard" && (
        <DashboardPage onNavigate={setPage} />
      )}

      {page === "trash" && <TrashPage onNavigate={setPage} />}

      {page === "consultation" && (
        activePatientId ? (
          <VoiceSessionProvider>
            <ConsultationPage
              patientId={activePatientId}
              appointmentId={activeAppointmentId ?? undefined}
              onFinish={() => setPage("today")}
            />
          </VoiceSessionProvider>
        ) : (
          <div style={{ padding: 40, color: "#64748b", fontWeight: 700 }}>
            Select a patient before opening consultation.
          </div>
        )
      )}
      {page === "revenue" && <RevenuePage />}
      {page === "settings" && <SettingsPage />}
      </AppShell>
    </>
  );
}