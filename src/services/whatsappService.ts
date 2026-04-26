export const shareOnWhatsApp = (data: any) => {
  // Hard-mapping all clinical fields to ensure zero stripping
  const complaint = data.totality?.complaint || "-";
  const miasm = data.totality?.miasm || "Awaiting Analysis";
  const auth = data.securityHash || "N/A";

  let message = `*Sakhi Homeopathic Clinic*\n`;
  message += `*Dr. Amisha (BHMS)*\n`;
  message += `--------------------------\n`;
  message += `*Patient:* ${data.patient}\n`;
  message += `*Date:* ${data.date}\n`;
  message += `*Auth:* ${auth}\n`;
  message += `--------------------------\n`;
  message += `*Clinical Totality:*\n`;
  message += `• Complaint: ${complaint}\n`;
  message += `• Miasm: ${miasm}\n`;
  message += `--------------------------\n`;
  message += `*Rx / Prescription:*\n`;

  data.medicines.forEach((m: any) => {
    message += `💊 *${m.name}*\n   ${m.dosage} | ${m.duration}\n`;
  });

  if (data.advice?.length) {
    message += `\n*Advice:*\n`;
    data.advice.forEach((a: string) => {
      message += `• ${a}\n`;
    });
  }

  message += `\n*Follow-up:* ${data.followUp || "15 Days"}\n`;
  message += `--------------------------\n`;
  message += `_This is a digitally authenticated clinical record._`;

  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
};