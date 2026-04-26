export const generateClinicalSummary = (data: any) => {
  return `
Patient presents with ${data.caseText}.
Mental state: ${data.mind}.
General symptoms: ${data.generals}.

Selected remedy based on symptom similarity and past success.

Plan:
- Continue medicine
- Monitor response
- Follow-up as advised
  `;
};