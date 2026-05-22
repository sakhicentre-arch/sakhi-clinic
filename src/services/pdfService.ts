import jsPDF from "jspdf";
import autoTable from "jspdf-autotable"; // Changed from side-effect import to direct import
import { openWhatsApp } from "./whatsappService";

/**
 * SAKHI CLINIC - MASTER PDF ENGINE (V9.2)
 * -------------------------------------------------------------
 * PROTOCOL : STRICT ZERO TRUNCATION | API BRIDGE FIX
 * FIX      : Resolved 'doc.autoTable is not a function' via direct injection
 * -------------------------------------------------------------
 */

export const generatePrescriptionPDF = (data: any) => {
  const doc = new jsPDF();
  let y = 15;

  // ================= CLINIC HEADER =================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 58, 138); 
  doc.text("Sakhi Homeopathic Clinic", 105, y, { align: "center" });
  
  y += 8;
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text("Dr. Amisha (BHMS, Consultant Homeopath)", 105, y, { align: "center" });
  
  y += 6;
  doc.setFontSize(9);
  doc.text("Clinical Authentication: " + (data.securityHash || "N/A"), 105, y, { align: "center" });
  
  y += 5;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1);
  doc.line(15, y, 195, y);

  // ================= PATIENT DATA STRIP =================
  y += 12;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`PATIENT: ${data.patient}`, 15, y);
  doc.text(`DATE: ${data.date}`, 195, y, { align: "right" });
  
  y += 6;
  doc.text(`BIO: ${data.bio || "N/A"}`, 15, y);
  doc.text(`REFERRED BY: ${data.referredBy || "Self"}`, 195, y, { align: "right" });

  // ================= CLINICAL TOTALITY OVERVIEW =================
  y += 10;
  doc.setFillColor(248, 250, 252);
  doc.rect(15, y, 180, 35, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(15, y, 180, 35, "S");

  y += 7;
  doc.setFont("helvetica", "bold");
  doc.text("PATIENT TOTALITY OVERVIEW", 20, y);
  
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Complaint: ${data.totality?.complaint || "-"}`, 20, y);
  doc.text(`Miasmatic: ${data.totality?.miasm || "Awaiting"}`, 110, y);
  
  y += 5;
  doc.text(`Thermal: ${data.totality?.thermal || "N/A"}`, 20, y);
  doc.text(`Mind: ${data.totality?.mind || "-"}`, 110, y);
  
  y += 5;
  const obs = doc.splitTextToSize(`Observation: ${data.totality?.caseText || "-"}`, 170);
  doc.text(obs, 20, y);

  // ================= Rx PRESCRIPTION TABLE =================
  // 🔥 FIX: Using autoTable(doc, ...) direct injection for stability
  y += 20;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235);
  doc.text("Rx / REMEDY PRESCRIPTION", 15, y);

  const tableBody = data.medicines.map((m: any) => [
    m.name,
    m.dosage,
    m.duration
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["Remedy & Potency", "Dosage", "Duration"]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [37, 99, 235], fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 5 },
    margin: { left: 15, right: 15 }
  });

  const finalY = (doc as any).lastAutoTable.finalY || y + 30;
  y = finalY + 15;

  // ================= ADVICE & FOLLOW-UP =================
  doc.setFont("helvetica", "bold");
  doc.text("DIET & LIFESTYLE ADVICE", 15, y);
  doc.text("FOLLOW-UP", 140, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const adviceList = data.advice?.length ? data.advice : ["No specific advice recorded."];
  adviceList.forEach((a: string) => {
    doc.text(`• ${a}`, 15, y);
    y += 5;
  });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`In ${data.followUp || "15 Days"}`, 140, y - 5);

  // ================= SIGNATURE =================
  y = 270;
  doc.line(140, y, 195, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Authorized Signatory", 167, y, { align: "center" });

  doc.save(`Sakhi_Prescription_${data.patient.replace(/\s+/g, "_")}.pdf`);
};

export const shareOnWhatsApp = (data: any) => {
  // Logic preserved from V9.1
  let message = `*Sakhi Homeopathic Clinic*\n*Dr. Amisha (BHMS)*\n`;
  message += `--------------------------\n`;
  message += `*Patient:* ${data.patient}\n*Auth:* ${data.securityHash || "N/A"}\n`;
  message += `--------------------------\n`;
  message += `*Rx / Prescription:*\n`;
  data.medicines.forEach((m: any) => { message += `💊 *${m.name}*\n   ${m.dosage} | ${m.duration}\n`; });
  message += `\n*Follow-up:* ${data.followUp || "15 Days"}\n`;
  openWhatsApp({ message });
};
