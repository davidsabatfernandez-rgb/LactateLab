// Used in: NutritionPage.tsx — after daily summary section
// Also available standalone for embedding in other pages

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { NutritionPremiumGate } from "./NutritionPremiumGate";
import { useAthleteData } from "../context/AthleteDataContext";
import type { NutritionRecommendationType } from "../utils/nutritionTypes";

type Props = {
  token: string;
  athleteId: number;
  readOnly?: boolean;
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--ath-red, #EF4444)",
  medium: "var(--ath-amber, #F59E0B)",
  low: "var(--ath-green, #10B981)",
};

const CATEGORY_LABELS: Record<string, string> = {
  carbs: "Carbohidratos",
  protein: "Prote\u00edna",
  hydration: "Hidrataci\u00f3n",
  micronutrients: "Micronutrientes",
  rest_day: "D\u00eda de descanso",
  recovery: "Recuperaci\u00f3n",
  pre_workout: "Pre-entreno",
  post_workout: "Post-entreno",
  general: "General",
};

export function NutritionRecommendations({ token, athleteId, readOnly }: Props) {
  const data = useAthleteData();
  const planTier = data.user?.plan_tier || "free";

  return (
    <NutritionPremiumGate planTier={planTier} featureName="Recomendaciones personalizadas">
      <NutritionRecommendationsInner token={token} athleteId={athleteId} readOnly={readOnly} />
    </NutritionPremiumGate>
  );
}

function NutritionRecommendationsInner({ token, athleteId }: { token: string; athleteId: number; readOnly?: boolean }) {
  const [recs, setRecs] = useState<NutritionRecommendationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.nutritionRecommendations(token, athleteId);
        if (!cancelled) {
          const sorted = (result.recommendations || []).sort(
            (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
          );
          setRecs(sorted);
        }
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, athleteId]);

  if (loading) {
    return (
      <div className="ath-nutr-rec-container">
        <h4 className="ath-nutr-rec-heading">Recomendaciones</h4>
        <div className="ath-nutr-rec-skeleton-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ath-nutr-rec-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ath-nutr-rec-container">
        <h4 className="ath-nutr-rec-heading">Recomendaciones</h4>
        <p className="ath-nutr-rec-empty">Error al cargar recomendaciones</p>
      </div>
    );
  }

  return (
    <div className="ath-nutr-rec-container">
      <h4 className="ath-nutr-rec-heading">Recomendaciones</h4>
      {recs.length === 0 ? (
        <p className="ath-nutr-rec-empty">No hay recomendaciones activas</p>
      ) : (
        <div className="ath-nutr-rec-list">
          {recs.map((rec, i) => (
            <div
              key={i}
              className="ath-nutr-rec-card"
              style={{ borderLeftColor: PRIORITY_COLORS[rec.priority] || PRIORITY_COLORS.low }}
            >
              <div className="ath-nutr-rec-card-icon">{rec.icon}</div>
              <div className="ath-nutr-rec-card-body">
                <div className="ath-nutr-rec-card-top">
                  <span className="ath-nutr-rec-card-badge">
                    {CATEGORY_LABELS[rec.category] || rec.category}
                  </span>
                </div>
                <p className="ath-nutr-rec-card-title">{rec.title}</p>
                <p className="ath-nutr-rec-card-message">{rec.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
