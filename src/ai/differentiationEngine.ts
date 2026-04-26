// ==========================================
// SAKHI CLINIC — DIFFERENTIATION ENGINE v4
// TYPE SAFE VERSION (FIXES TS2345, TS2353)
// ==========================================

type Remedy = {
  name: string;
};

type MateriaItem = {
  mind?: string[];
  generals?: string[];
  symptoms?: string[];
  keynotes?: string[];
};

export function differentiateRemedies(
  remedies: Remedy[],
  materia: Record<string, MateriaItem>
) {
  if (!Array.isArray(remedies) || remedies.length < 2) return null;

  const top = remedies[0];
  const second = remedies[1];
  const third = remedies[2];

  const r1 = materia[top?.name];
  const r2 = materia[second?.name];
  const r3 = third ? materia[third?.name] : null;

  if (!r1 || !r2) return null;

  // ================= HELPERS =================

  const getUnique = (arr1: string[] = [], arr2: string[] = []) => {
    return arr1.filter((s) => !arr2.includes(s));
  };

  const limit = (arr: string[]) => arr.slice(0, 4);

  const splitDiff = (rA: MateriaItem, rB: MateriaItem) => {
    return {
      mind: limit(getUnique(rA.mind || [], rB.mind || [])),
      generals: limit(getUnique(rA.generals || [], rB.generals || [])),
      symptoms: limit(getUnique(rA.symptoms || [], rB.symptoms || [])),
      keynotes: limit(getUnique(rA.keynotes || [], rB.keynotes || [])),
    };
  };

  const diff1 = splitDiff(r1, r2);
  const diff2 = splitDiff(r2, r1);

  const response: any = {
    remedy1: top.name,
    remedy2: second.name,

    remedy1Points: [
      ...diff1.mind,
      ...diff1.generals,
      ...diff1.keynotes,
      ...diff1.symptoms,
    ].slice(0, 5),

    remedy2Points: [
      ...diff2.mind,
      ...diff2.generals,
      ...diff2.keynotes,
      ...diff2.symptoms,
    ].slice(0, 5),

    detailed: {
      [top.name]: diff1,
      [second.name]: diff2,
    },
  };

  // ✅ THIRD REMEDY SUPPORT (SAFE)
  if (r3) {
    const diff3 = splitDiff(r3, r1);

    response.remedy3 = third.name;

    response.detailed[third.name] = {
      mind: diff3.mind,
      generals: diff3.generals,
      symptoms: diff3.symptoms,
      keynotes: diff3.keynotes,
    };
  }

  return response;
}