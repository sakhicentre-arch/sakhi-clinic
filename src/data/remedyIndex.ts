import materia from "./materiaMedica.json";

export function searchRemedies(keyword: string) {
  if (!keyword) return [];

  const text = keyword.toLowerCase();
  const results: any[] = [];

  Object.entries(materia).forEach(([name, data]: any) => {
    const all = [
      ...(data.symptoms || []),
      ...(data.mind || []),
      ...(data.generals || []),
      ...(data.keynotes || [])
    ].join(" ").toLowerCase();

    if (all.includes(text)) {
      results.push(name);
    }
  });

  return results;
}