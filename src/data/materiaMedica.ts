/**
 * materiaMedica.ts
 * Core knowledge base for clinical reasoning engine.
 */

export interface RemedyKnowledge {
  keySymptoms: string[];
  modalities: string[];
  generals: string[];
}

export const materiaMedica: Record<string, RemedyKnowledge> = {
  aconite: {
    keySymptoms: ["sudden", "onset", "fear", "restlessness", "acute", "panic"],
    modalities: ["worse cold", "worse night", "worse wind"],
    generals: ["acute fever", "shock", "intense thirst"],
  },
  bryonia: {
    keySymptoms: ["dryness", "stitching pain", "thirsty", "constipation", "irritable"],
    modalities: ["worse movement", "better rest", "better pressure"],
    generals: ["joint pains", "dry cough", "slow onset"],
  },
  pulsatilla: {
    keySymptoms: ["mild", "weepy", "yielding", "thirstless", "changeable"],
    modalities: ["better open air", "worse heat", "worse evening"],
    generals: ["hormonal", "catarrhal", "earache"],
  },
  arsenicum_album: {
    keySymptoms: ["anxiety", "burning pain", "restlessness", "exhaustion", "fastidious"],
    modalities: ["worse midnight", "worse cold", "better heat"],
    generals: ["gastric upset", "thirst for sips"],
  },
  nux_vomica: {
    keySymptoms: ["irritable", "sedentary", "angry", "sensitive", "overwork", "gas"],
    modalities: ["worse morning", "better nap", "worse cold"],
    generals: ["constipation", "digestive", "stimulants"],
  },
  lycopodium: {
    keySymptoms: ["bloating", "anticipation", "low confidence", "intellectual"],
    modalities: ["worse 4-8pm", "better warm drinks", "right side"],
    generals: ["liver", "kidney", "gas", "chronic"],
  },
  sulphur: {
    keySymptoms: ["heat", "burning", "lazy", "egotistical", "dirty skin", "messy"],
    modalities: ["worse 11am", "worse standing", "worse bathing"],
    generals: ["skin disorders", "red orifices", "morning diarrhea"],
  },
  sepia: {
    keySymptoms: ["indifferent", "tired", "dragged down", "irritable with family"],
    modalities: ["better exercise", "worse cold air", "worse evening"],
    generals: ["hormonal", "uterine", "menopause", "stasis"],
  },
  silicea: {
    keySymptoms: ["timid", "nervous", "sweaty feet", "chilly", "slow", "fragile"],
    modalities: ["worse cold", "better wrapping up", "worse drafts"],
    generals: ["suppuration", "scars", "weak bones", "headaches"],
  },
  calc_carb: {
    keySymptoms: ["slow", "stubborn", "sweaty head", "chilly", "obese", "anxious"],
    modalities: ["worse exertion", "worse cold", "worse damp"],
    generals: ["children", "bone growth", "glands"],
  },
  rhus_tox: {
    keySymptoms: ["stiffness", "restless", "aching", "tongue red tip"],
    modalities: ["worse rest", "better movement", "worse damp cold"],
    generals: ["skin rash", "joint pains", "sprains"],
  },
  arnica: {
    keySymptoms: ["bruised", "sore", "trauma", "shock", "says he is fine"],
    modalities: ["worse touch", "worse motion", "worse damp"],
    generals: ["injury", "fall", "surgery", "blood"],
  },
  gelsemium: {
    keySymptoms: ["dull", "dizzy", "drowsy", "trembling", "heavy eyelids"],
    modalities: ["worse bad news", "better urination", "worse heat"],
    generals: ["flu", "fright", "stage fright"],
  },
  ignatia: {
    keySymptoms: ["grief", "sobbing", "sighing", "contradictory", "moody"],
    modalities: ["worse tobacco", "better distraction", "worse coffee"],
    generals: ["emotional shock", "lump in throat", "hysteria"],
  },
  mercurius_sol: {
    keySymptoms: ["salivation", "metallic taste", "sweating", "offensive smell"],
    modalities: ["worse night", "worse heat and cold", "worse damp"],
    generals: ["mouth ulcers", "glands", "tremors"],
  }
};