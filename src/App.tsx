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
import FollowUpPage from "./pages/FollowUpPage";
import RemindersPage from "./pages/RemindersPage";
import { VoiceSessionProvider } from "./hooks/VoiceSessionContext";
import OriginMismatchBanner from "./components/OriginMismatchBanner";
import { acknowledgeOriginChange, checkOriginIdentity, OriginCheckResult } from "./services/originIdentityService";
import { GOOGLE_OAUTH_CALLBACK_PATH, completeGoogleDriveConnection } from "./services/backup/oauth/completeGoogleDriveConnection";

function hasPendingDriveConnectResult(): boolean {
  try {
    // Boolean(...), not "!== null": localStorage.getItem returns null for a
    // genuinely absent key, but test environments that stub localStorage
    // without an explicit implementation return undefined -- both must read
    // as "nothing pending" here, only a real stored string means otherwise.
    return Boolean(window.localStorage.getItem("sakhi.driveConnectResult.v1"));
  } catch {
    return false;
  }
}

// sessionStorage (not localStorage): survives a same-tab reload -- so an
// accidental refresh mid-queue returns the doctor to where they were --
// but clears on tab close, so a genuinely fresh session still lands on
// the Dashboard per its own landing-page requirement.
const ACTIVE_PAGE_STORAGE_KEY = "sakhi.activePage.v1";

function getStoredPage(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_PAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  useSafeViewport();
  const isReviewPath = window.location.pathname === "/review";
  const isOAuthCallbackPath = window.location.pathname === GOOGLE_OAUTH_CALLBACK_PATH;
  // After the OAuth redirect's own full reload back to "/" (see the effect
  // below), the doctor should land back on Settings -- where they started
  // and where the connect/fail note is shown -- not on the default Today
  // page. The result flag left in localStorage is the only signal this
  // fresh page load has that it's a landing from that round trip.
  const isLandingFromDriveConnect = !isOAuthCallbackPath && hasPendingDriveConnectResult();

  const [page, setPage] = useState(
    isOAuthCallbackPath || isLandingFromDriveConnect
      ? "settings"
      : isReviewPath
        ? "review"
        : getStoredPage() || "dashboard"
  );
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

  useEffect(() => {
    try {
      window.sessionStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, page);
    } catch {
      // Private browsing / storage disabled -- refresh just falls back to
      // the Dashboard default, not a failure worth surfacing to the doctor.
    }
  }, [page]);

  // Google Drive OAuth redirect landing: Google sends the doctor back here
  // after consent. A full reload afterward (rather than just clearing the
  // URL) is deliberate -- it's the simplest reliable way for every
  // already-rendered piece of UI (Settings' connection status, active
  // provider, etc.) to reflect the newly-connected state, without adding
  // app-wide reactive state just for this one-time transition. This mirrors
  // the existing pattern of a real window.location.href redirect to start
  // the flow (see googleOAuthService.getAuthUrl / SettingsPage's
  // handleConnectDrive) rather than introducing a client-side router.
  useEffect(() => {
    if (!isOAuthCallbackPath) return;
    completeGoogleDriveConnection(window.location.search).then((result) => {
      try {
        window.localStorage.setItem("sakhi.driveConnectResult.v1", JSON.stringify(result));
      } catch {
        // ignore -- worst case the doctor just sees the normal Settings state with no note
      }
      window.location.replace("/");
    });
  }, [isOAuthCallbackPath]);

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
      {page === "revenue" && <RevenuePage onNavigate={setPage} />}
      {page === "settings" && <SettingsPage />}
      {page === "followups" && <FollowUpPage onNavigate={setPage} />}
      {page === "reminders" && <RemindersPage />}
      </AppShell>
    </>
  );
}