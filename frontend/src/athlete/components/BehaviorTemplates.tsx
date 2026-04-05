import { type BehaviorEntry } from "../utils/behaviorJournal";

export type BehaviorTemplate = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  values: BehaviorEntry;
};

export const BEHAVIOR_TEMPLATES: BehaviorTemplate[] = [
  {
    id: "recovery",
    label: "Día de descanso",
    emoji: "🧘",
    description: "Estiramientos, meditación, lectura",
    values: {
      stretching: true,
      foam_rolling: true,
      meditation: true,
      reading_before_bed: true,
      consistent_bedtime: true,
      morning_sunlight: true,
    },
  },
  {
    id: "training",
    label: "Día de entreno",
    emoji: "🏋️",
    description: "Creatina, electrolitos, pre-entreno",
    values: {
      creatine: true,
      electrolytes: true,
      pre_workout: true,
      morning_sunlight: true,
      stretching: true,
    },
  },
  {
    id: "travel",
    label: "Día de viaje",
    emoji: "✈️",
    description: "Jet lag, estrés, melatonina",
    values: {
      travel_jet_lag: true,
      high_work_stress: 2,
      melatonin: true,
      magnesium: true,
    },
  },
  {
    id: "optimal_sleep",
    label: "Noche perfecta",
    emoji: "😴",
    description: "Sin pantallas, magnesio, antifaz",
    values: {
      consistent_bedtime: true,
      sleep_mask: true,
      magnesium: true,
      reading_before_bed: true,
      blue_light_glasses: true,
    },
  },
];

type Props = {
  onApply: (values: BehaviorEntry) => void;
  onClose: () => void;
};

export function BehaviorTemplatesPicker({ onApply, onClose }: Props) {
  return (
    <div className="ath-bj-templates">
      {BEHAVIOR_TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          className="ath-bj-template-card"
          onClick={() => { onApply(t.values); onClose(); }}
        >
          <span className="ath-bj-template-emoji">{t.emoji}</span>
          <div className="ath-bj-template-info">
            <span className="ath-bj-template-name">{t.label}</span>
            <span className="ath-bj-template-desc">{t.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
