// Used in: NutritionPage.tsx — inside FoodLogModal or above daily meal sections
// Also available standalone for embedding in other pages

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { MealSuggestionType } from "../utils/nutritionTypes";

type Props = {
  token: string;
  athleteId: number;
  mealType: string;
  onAccept: (items: MealSuggestionType["suggested_items"]) => void;
  onEdit?: (items: MealSuggestionType["suggested_items"]) => void;
};

export function MealSuggestions({ token, athleteId, mealType, onAccept, onEdit }: Props) {
  const [suggestions, setSuggestions] = useState<MealSuggestionType[]>([]);
  const [hasEnoughData, setHasEnoughData] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.mealSuggestions(token, athleteId, mealType);
        if (!cancelled) {
          setHasEnoughData(result.has_enough_data);
          setSuggestions(result.suggestions || []);
        }
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, athleteId, mealType]);

  if (loading) {
    return (
      <div className="ath-nutr-suggest-container">
        <div className="ath-nutr-suggest-skeleton" />
      </div>
    );
  }

  if (error) return null;

  if (!hasEnoughData) {
    return (
      <div className="ath-nutr-suggest-container">
        <div className="ath-nutr-suggest-progress-card">
          <span className="ath-nutr-suggest-progress-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </span>
          <div className="ath-nutr-suggest-progress-text">
            <p className="ath-nutr-suggest-progress-label">
              Registra 7+ d&iacute;as de comidas para activar sugerencias
            </p>
            <div className="ath-nutr-suggest-progress-bar">
              <div className="ath-nutr-suggest-progress-fill" style={{ width: "0%" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const top3 = suggestions.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <div className="ath-nutr-suggest-container">
      <h4 className="ath-nutr-suggest-heading">Sugerencias</h4>
      <div className="ath-nutr-suggest-list">
        {top3.map((suggestion, idx) => (
          <div key={idx} className="ath-nutr-suggest-card">
            <p className="ath-nutr-suggest-card-label">{suggestion.reason}</p>
            <ul className="ath-nutr-suggest-card-items">
              {suggestion.suggested_items.map((item, j) => (
                <li key={j} className="ath-nutr-suggest-card-item">
                  <span className="ath-nutr-suggest-item-name">{item.food_name}</span>
                  <span className="ath-nutr-suggest-item-qty">{item.quantity_g}g</span>
                </li>
              ))}
            </ul>
            <div className="ath-nutr-suggest-card-footer">
              <span className="ath-nutr-suggest-card-cals">
                {Math.round(suggestion.total_calories)} kcal
              </span>
              <div className="ath-nutr-suggest-card-confidence">
                <div className="ath-nutr-suggest-confidence-bar">
                  <div
                    className="ath-nutr-suggest-confidence-fill"
                    style={{ width: `${Math.round(suggestion.confidence * 100)}%` }}
                  />
                </div>
                <span className="ath-nutr-suggest-confidence-text">
                  {Math.round(suggestion.confidence * 100)}%
                </span>
              </div>
            </div>
            <div className="ath-nutr-suggest-card-actions">
              <button
                className="ath-nutr-suggest-btn ath-nutr-suggest-btn--primary"
                onClick={() => onAccept(suggestion.suggested_items)}
              >
                Registrar
              </button>
              {onEdit && (
                <button
                  className="ath-nutr-suggest-btn ath-nutr-suggest-btn--secondary"
                  onClick={() => onEdit(suggestion.suggested_items)}
                >
                  Editar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
