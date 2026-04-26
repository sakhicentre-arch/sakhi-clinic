import "./App.css";
import { useState, useEffect } from "react";
import PatientPage from "./pages/PatientPage";
import AppointmentPage from "./pages/AppointmentPage";
import ConsultationPage from "./pages/ConsultationPage";
import PrescriptionPrint from "./pages/PrescriptionPrint";
import RevenuePage from "./pages/RevenuePage";
import TodayPage from "./pages/TodayPage";
import DashboardPage from "./pages/DashboardPage";
import ReviewPage from "./pages/ReviewPage"; // IMPORTED
import AppShell from "./components/layout/AppShell";
import { useUIStore, ActivePage } from "./store/uiStore";

export default function App() {
  // Check if current URL is for the review page
  const isReviewPath = window.location.pathname === "/review";
  
  const [page, setPage] = useState(isReviewPath ? "review" : "today");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");

  const setActivePage = useUIStore((s) => s.setActivePage);
  const setActiveConsultation = useUIStore((s) => s.setActiveConsultation);

  useEffect(() => {
    // If we are on the review path, don't let internal state redirect to today
    if (isReviewPath) {
      setPage("review");
    } else {
      setActivePage(page as ActivePage);
    }
  }, [page, setActivePage, isReviewPath]);

  const goToConsultation = (patientId: string, appointmentId: string) => {
    setSelectedPatientId(patientId);
    setSelectedAppointmentId(appointmentId);
    setPage("consultation");
    setActiveConsultation(patientId, appointmentId);
  };

  const handleNavigate = (navPage: ActivePage) => {
    if (navPage === "print") return;
    setPage(navPage);
  };

  const handlePatientSelect = (patientId: string) => {
    setSelectedPatientId(patientId);
    setPage("patients");
  };

  // 1. Patient Experience: Review Page (No Shell)
  if (page === "review") {
    return <ReviewPage />;
  }

  // 2. Print View
  if (page === "print") {
    return <PrescriptionPrint />;
  }

  // 3. Doctor Experience: Standard App
  return (
    <AppShell onNavigate={handleNavigate} onPatientSelect={handlePatientSelect}>
      {page === "today" && (
        <TodayPage goToConsultation={goToConsultation} />
      )}
      {page === "patients" && (
        <PatientPage goToConsultation={goToConsultation} />
      )}
      {page === "appointments" && (
        <AppointmentPage goToConsultation={goToConsultation} />
      )}
      {page === "dashboard" && (
        <DashboardPage />
      )}
      {page === "consultation" && (
        <ConsultationPage
          patientId={selectedPatientId}
          appointmentId={selectedAppointmentId}
          onFinish={() => setPage("today")}
        />
      )}
      {page === "revenue" && <RevenuePage />}
    </AppShell>
  );
}