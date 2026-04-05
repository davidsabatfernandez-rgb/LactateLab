export type BehaviorCategory = "recovery" | "nutrition" | "supplements" | "mental" | "sleep" | "work" | "medication" | "lifestyle" | "life_status";
export type BehaviorInputType = "toggle" | "time" | "quantity" | "duration" | "scale";

export type BehaviorItem = {
  key: string;
  label: string;
  emoji: string;
  category: BehaviorCategory;
  inputType: BehaviorInputType;
};

export const BEHAVIOR_CATEGORIES: { key: BehaviorCategory; label: string }[] = [
  { key: "recovery", label: "Recuperación" },
  { key: "nutrition", label: "Nutrición" },
  { key: "supplements", label: "Suplementos" },
  { key: "mental", label: "Mental" },
  { key: "sleep", label: "Sueño" },
  { key: "work", label: "Trabajo" },
  { key: "medication", label: "Medicación" },
  { key: "lifestyle", label: "Estilo de vida" },
  { key: "life_status", label: "Estado vital" },
];

export const SCALE_LABELS: Record<string, string[]> = {
  high_work_stress: ["Leve", "Moderado", "Alto"],
  fasting: ["Intermitente", "Extendido", "Prolongado"],
};

export const DURATION_PRESETS = [15, 20, 30, 45, 60, 90];

export const BEHAVIOR_CATALOG: BehaviorItem[] = [
  // Recovery
  { key: "ice_bath", label: "Baño de hielo", emoji: "🧊", category: "recovery", inputType: "toggle" },
  { key: "sauna", label: "Sauna", emoji: "🧖", category: "recovery", inputType: "toggle" },
  { key: "massage", label: "Masaje", emoji: "💆", category: "recovery", inputType: "toggle" },
  { key: "foam_rolling", label: "Foam rolling", emoji: "🧘", category: "recovery", inputType: "toggle" },
  { key: "stretching", label: "Estiramientos", emoji: "🤸", category: "recovery", inputType: "toggle" },
  { key: "compression_garments", label: "Compresión", emoji: "🩹", category: "recovery", inputType: "toggle" },
  { key: "cold_shower", label: "Ducha fría", emoji: "🚿", category: "recovery", inputType: "toggle" },
  // Nutrition
  { key: "alcohol", label: "Alcohol", emoji: "🍷", category: "nutrition", inputType: "quantity" },
  { key: "late_meal", label: "Última cena", emoji: "🌙", category: "nutrition", inputType: "time" },
  { key: "creatine", label: "Creatina", emoji: "💊", category: "nutrition", inputType: "toggle" },
  { key: "caffeine_after_2pm", label: "Último café", emoji: "☕", category: "nutrition", inputType: "time" },
  { key: "fasting", label: "Ayuno", emoji: "⏳", category: "nutrition", inputType: "scale" },
  // Supplements
  { key: "melatonin", label: "Melatonina", emoji: "💤", category: "supplements", inputType: "toggle" },
  { key: "omega_3", label: "Omega-3", emoji: "🐟", category: "supplements", inputType: "toggle" },
  { key: "vitamin_d", label: "Vitamina D", emoji: "☀️", category: "supplements", inputType: "toggle" },
  { key: "electrolytes", label: "Electrolitos", emoji: "⚡", category: "supplements", inputType: "toggle" },
  { key: "probiotics", label: "Probióticos", emoji: "🦠", category: "supplements", inputType: "toggle" },
  { key: "ashwagandha", label: "Ashwagandha", emoji: "🌿", category: "supplements", inputType: "toggle" },
  { key: "cbd", label: "CBD", emoji: "🌱", category: "supplements", inputType: "toggle" },
  { key: "pre_workout", label: "Pre-entreno", emoji: "⚡", category: "supplements", inputType: "toggle" },
  // Mental
  { key: "meditation", label: "Meditación", emoji: "🧘‍♂️", category: "mental", inputType: "toggle" },
  { key: "journaling", label: "Journaling", emoji: "📓", category: "mental", inputType: "toggle" },
  { key: "breathwork", label: "Respiración", emoji: "🌬️", category: "mental", inputType: "toggle" },
  // Sleep
  { key: "screens_before_bed", label: "Última pantalla", emoji: "📱", category: "sleep", inputType: "time" },
  { key: "consistent_bedtime", label: "Hora fija dormir", emoji: "🕐", category: "sleep", inputType: "toggle" },
  { key: "sleep_mask", label: "Antifaz", emoji: "😴", category: "sleep", inputType: "toggle" },
  { key: "magnesium", label: "Magnesio", emoji: "💎", category: "sleep", inputType: "toggle" },
  { key: "mouth_tape", label: "Mouth tape", emoji: "🤐", category: "sleep", inputType: "toggle" },
  { key: "nasal_strip", label: "Tira nasal", emoji: "👃", category: "sleep", inputType: "toggle" },
  { key: "weighted_blanket", label: "Manta pesada", emoji: "🛏️", category: "sleep", inputType: "toggle" },
  { key: "white_noise", label: "Ruido blanco", emoji: "🔊", category: "sleep", inputType: "toggle" },
  { key: "reading_before_bed", label: "Lectura", emoji: "📖", category: "sleep", inputType: "toggle" },
  { key: "blue_light_glasses", label: "Gafas luz azul", emoji: "🕶️", category: "sleep", inputType: "toggle" },
  // Work
  { key: "working_late", label: "Trabajar hasta tarde", emoji: "💻", category: "work", inputType: "toggle" },
  { key: "shift_work", label: "Turno rotativo", emoji: "🔄", category: "work", inputType: "toggle" },
  // Medication
  { key: "antihistamine", label: "Antihistamínico", emoji: "💊", category: "medication", inputType: "toggle" },
  { key: "pain_reliever", label: "Analgésico", emoji: "💊", category: "medication", inputType: "toggle" },
  { key: "birth_control", label: "Anticonceptivo", emoji: "💊", category: "medication", inputType: "toggle" },
  { key: "cpap_machine", label: "CPAP", emoji: "😮‍💨", category: "medication", inputType: "toggle" },
  { key: "prescription_medication", label: "Medicación recetada", emoji: "💊", category: "medication", inputType: "toggle" },
  { key: "anti_inflammatory", label: "Antiinflamatorio", emoji: "💊", category: "medication", inputType: "toggle" },
  // Lifestyle
  { key: "travel_jet_lag", label: "Viaje / jet lag", emoji: "✈️", category: "lifestyle", inputType: "toggle" },
  { key: "high_work_stress", label: "Estrés", emoji: "😰", category: "lifestyle", inputType: "scale" },
  { key: "nap", label: "Siesta", emoji: "😴", category: "lifestyle", inputType: "duration" },
  { key: "morning_sunlight", label: "Sol matutino", emoji: "🌅", category: "lifestyle", inputType: "toggle" },
  { key: "nature_outdoors", label: "Naturaleza", emoji: "🌳", category: "lifestyle", inputType: "toggle" },
  { key: "social_activity", label: "Actividad social", emoji: "👥", category: "lifestyle", inputType: "toggle" },
  { key: "sex", label: "Sexo", emoji: "❤️", category: "lifestyle", inputType: "toggle" },
  // Life Status
  { key: "illness", label: "Enfermedad", emoji: "🤒", category: "life_status", inputType: "toggle" },
  { key: "injury", label: "Lesión", emoji: "🩹", category: "life_status", inputType: "toggle" },
  { key: "allergies", label: "Alergias", emoji: "🤧", category: "life_status", inputType: "toggle" },
  { key: "high_altitude", label: "Altitud", emoji: "🏔️", category: "life_status", inputType: "toggle" },
];

/** Value can be boolean (toggle), string (time "HH:MM"), or number (quantity/duration/scale) */
export type BehaviorValue = boolean | string | number;
export type BehaviorEntry = Record<string, BehaviorValue>;

/** Check if a behavior has a truthy value (was recorded) */
export function isBehaviorActive(value: BehaviorValue | undefined): boolean {
  if (value === undefined || value === null || value === false) return false;
  return true;
}

/** Format a behavior value for display in the summary */
export function formatBehaviorValue(item: BehaviorItem, value: BehaviorValue): string {
  switch (item.inputType) {
    case "toggle":
      return "";
    case "time":
      return String(value);
    case "quantity":
      return `${value}`;
    case "duration":
      return `${value}min`;
    case "scale": {
      const labels = SCALE_LABELS[item.key];
      return labels ? labels[Number(value) - 1] ?? String(value) : String(value);
    }
    default:
      return String(value);
  }
}
