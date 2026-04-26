import materia from "../data/materiaMedica.json";

export function suggestRemedies(input: string) {
  if (!input) return [];

  const text = input.toLowerCase();
  const results: any[] = [];

  // 🔥 Detect ACUTE vs CHRONIC
  const isAcute =
    text.includes("sudden") ||
    text.includes("acute") ||
    text.includes("fever") ||
    text.includes("cold");

  Object.entries(materia).forEach(([name, data]: any) => {
    let score = 0;
    let matched: string[] = [];

    // KEYNOTES (VERY STRONG)
    (data.keynotes || []).forEach((k: string) => {
      if (text.includes(k.toLowerCase())) {
        score += 5;
        matched.push(k);
      }
    });

    // MIND
    (data.mind || []).forEach((k: string) => {
      if (text.includes(k.toLowerCase())) {
        score += 3;
        matched.push(k);
      }
    });

    // SYMPTOMS
    (data.symptoms || []).forEach((k: string) => {
      if (text.includes(k.toLowerCase())) {
        score += 1;
        matched.push(k);
      }
    });

    // SPECIAL RULE
    if (text.includes("cold wind") && name === "Aconite") {
      score += 5;
    }

    if (score > 0) {
      // 🔥 POTENCY LOGIC
      let potency = "30";
      let dosage = "1-0-1";
      let duration = "3 days";

      if (isAcute) {
        potency = score >= 8 ? "200" : "30";
        dosage = "1-0-1";
        duration = "3 days";
      } else {
        potency = "6";
        dosage = "1-0-1";
        duration = "7 days";
      }

      results.push({
        name,
        score,
        matched,
        reason: matched.join(", "),
        prescription: {
          potency,
          dosage,
          duration,
        },
      });
    }
  });

  return results.sort((a, b) => b.score - a.score);
}