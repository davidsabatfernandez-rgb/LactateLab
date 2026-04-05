// Used in: NutritionPage.tsx — opened from meal logging UI as chat-based food entry
// Also available standalone for embedding in other pages

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../lib/api";
import type { MealLogType, ParsedFoodItemType } from "../utils/nutritionTypes";

type ConfirmedItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  parsedItems?: ParsedFoodItemType[];
};

type Props = {
  token: string;
  athleteId: number;
  mealType: string;
  onMealLogged: (meal: MealLogType) => void;
  onClose: () => void;
};

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "\u00a1Hola! \u00bfQu\u00e9 has comido? Descr\u00edbeme tu comida y yo me encargo de calcular las calor\u00edas y macros.",
};

export function NutritionChat({ token, athleteId, mealType, onMealLogged, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedItems, setConfirmedItems] = useState<ConfirmedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const result = await api.parseFood(token, athleteId, trimmed, mealType);
      const items = result.items || [];

      // Check if any items need clarification
      const needsClarification = result.needs_clarification ||
        items.some((it: ParsedFoodItemType) => it.needs_clarification);

      if (needsClarification) {
        const questions = items
          .filter((it: ParsedFoodItemType) => it.clarification_question)
          .map((it: ParsedFoodItemType) => it.clarification_question)
          .join("\n");

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: questions || "Necesito m\u00e1s detalles sobre tu comida. \u00bfPuedes especificar las cantidades?",
            parsedItems: items,
          },
        ]);
      } else if (items.length > 0) {
        // Build confirmed items from parsed results
        const newItems: ConfirmedItem[] = items.map((it: ParsedFoodItemType) => {
          const matched = it.matched_food_item;
          const qty = it.quantity_g;
          if (matched) {
            const factor = qty / 100;
            return {
              food_name: it.food_name,
              quantity_g: qty,
              calories: Math.round(matched.calories_per_100g * factor),
              protein_g: Math.round(matched.protein_per_100g * factor * 10) / 10,
              carbs_g: Math.round(matched.carbs_per_100g * factor * 10) / 10,
              fat_g: Math.round(matched.fat_per_100g * factor * 10) / 10,
            };
          }
          return {
            food_name: it.food_name,
            quantity_g: qty,
            calories: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
          };
        });

        const itemList = newItems
          .map((it) => `  \u2022 ${it.food_name}: ${it.quantity_g}g \u2014 ${it.calories} kcal (P:${it.protein_g}g C:${it.carbs_g}g G:${it.fat_g}g)`)
          .join("\n");
        const totalCals = newItems.reduce((s, it) => s + it.calories, 0);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `He identificado:\n${itemList}\n\nTotal: ${totalCals} kcal\n\n\u00bfQuieres a\u00f1adir algo m\u00e1s o guardamos la comida?`,
          },
        ]);
        setConfirmedItems((prev) => [...prev, ...newItems]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "No he podido identificar alimentos. \u00bfPuedes describir tu comida de otra forma?",
          },
        ]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al procesar la comida";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveMeal = async () => {
    if (confirmedItems.length === 0 || saving) return;
    setSaving(true);
    setError(null);

    const today = new Date().toISOString().split("T")[0];

    try {
      const result = await api.logMeal(token, athleteId, {
        meal_type: mealType,
        log_date: today,
        items: confirmedItems.map((it) => ({
          food_name: it.food_name,
          quantity_g: it.quantity_g,
          calories: it.calories,
          protein_g: it.protein_g,
          carbs_g: it.carbs_g,
          fat_g: it.fat_g,
        })),
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "\u00a1Comida guardada correctamente! Buen provecho." },
      ]);
      onMealLogged(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar la comida";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = (index: number) => {
    setConfirmedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalCals = confirmedItems.reduce((s, it) => s + it.calories, 0);
  const totalProtein = confirmedItems.reduce((s, it) => s + it.protein_g, 0);
  const totalCarbs = confirmedItems.reduce((s, it) => s + it.carbs_g, 0);
  const totalFat = confirmedItems.reduce((s, it) => s + it.fat_g, 0);

  return (
    <div className="ath-nutr-chat-panel">
      <div className="ath-nutr-chat-header">
        <div className="ath-nutr-chat-header-info">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="ath-nutr-chat-header-title">Registro por chat</span>
        </div>
        <button className="ath-nutr-chat-close" onClick={onClose} aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="ath-nutr-chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`ath-nutr-chat-msg ath-nutr-chat-msg--${msg.role}`}>
            <div className="ath-nutr-chat-msg-bubble">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="ath-nutr-chat-msg ath-nutr-chat-msg--assistant">
            <div className="ath-nutr-chat-msg-bubble ath-nutr-chat-typing">
              <span className="ath-nutr-chat-dot" />
              <span className="ath-nutr-chat-dot" />
              <span className="ath-nutr-chat-dot" />
            </div>
          </div>
        )}
        {error && <div className="ath-nutr-chat-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Running total */}
      {confirmedItems.length > 0 && (
        <div className="ath-nutr-chat-total">
          <div className="ath-nutr-chat-total-header">
            <span className="ath-nutr-chat-total-label">Comida actual</span>
            <span className="ath-nutr-chat-total-cals">{Math.round(totalCals)} kcal</span>
          </div>
          <div className="ath-nutr-chat-total-items">
            {confirmedItems.map((item, i) => (
              <div key={i} className="ath-nutr-chat-total-item">
                <span className="ath-nutr-chat-total-item-name">
                  {item.food_name} ({item.quantity_g}g)
                </span>
                <button
                  className="ath-nutr-chat-total-item-remove"
                  onClick={() => handleRemoveItem(i)}
                  aria-label={`Eliminar ${item.food_name}`}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="ath-nutr-chat-total-macros">
            <span>P: {Math.round(totalProtein)}g</span>
            <span>C: {Math.round(totalCarbs)}g</span>
            <span>G: {Math.round(totalFat)}g</span>
          </div>
          <button
            className="ath-nutr-chat-save-btn"
            onClick={handleSaveMeal}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar comida"}
          </button>
        </div>
      )}

      <div className="ath-nutr-chat-input-area">
        <textarea
          ref={inputRef}
          className="ath-nutr-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe tu comida..."
          rows={1}
          disabled={loading || saving}
        />
        <button
          className="ath-nutr-chat-send"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          aria-label="Enviar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
