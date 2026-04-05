import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../lib/api";
import type { FoodItemType, ParsedFoodItemType, MealLogType } from "../utils/nutritionTypes";
import { MEAL_TYPES } from "../utils/nutritionTypes";

type Props = {
  token: string;
  athleteId: number;
  date: string;
  mealType: string;
  onSaved: (meal: MealLogType) => void;
  onClose: () => void;
};

type Tab = "text" | "search" | "voice" | "recent";

type PendingItem = {
  food_name: string;
  quantity_g: number;
  food_item_id?: number;
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fat_per_100g?: number;
};

// ---- Speech Recognition types ----
type SpeechRecognitionEvent = {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
  resultIndex: number;
};
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

function getSpeechRecognition(): SpeechRecognitionInstance | null {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  return new SR();
}

export function FoodLogModal({ token, athleteId, date, mealType, onSaved, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("text");
  const [items, setItems] = useState<PendingItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");

  const mealInfo = MEAL_TYPES.find((m) => m.key === mealType);

  const handleSave = async () => {
    if (items.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        log_date: date,
        meal_type: mealType,
        items: items.map((it) => ({
          food_name: it.food_name,
          quantity_g: it.quantity_g,
          food_item_id: it.food_item_id || undefined,
        })),
        notes: notes.trim() || undefined,
      };
      const result = await api.logMeal(token, athleteId, payload as unknown as Record<string, unknown>);
      onSaved(result);
    } catch {
      setError("Error al guardar comida. Intentalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateQuantity = (idx: number, qty: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity_g: qty } : it)));

  const addItem = (item: PendingItem) => setItems((prev) => [...prev, item]);

  const totalCals = items.reduce((sum, it) => {
    if (it.calories_per_100g) return sum + (it.calories_per_100g * it.quantity_g) / 100;
    return sum;
  }, 0);

  return (
    <div className="ath-food-log-overlay" onClick={onClose}>
      <div className="ath-food-log-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ath-food-log-header">
          <div className="ath-food-log-header-info">
            <span className="ath-food-log-meal-emoji">{mealInfo?.emoji ?? "\u{1F37D}\uFE0F"}</span>
            <span className="ath-food-log-meal-label">{mealInfo?.label ?? "Comida"}</span>
          </div>
          <button type="button" className="ath-food-log-close" onClick={onClose} aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="ath-food-log-tabs">
          {(["text", "search", "voice", "recent"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`ath-food-log-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "text" && "Texto"}
              {t === "search" && "Buscar"}
              {t === "voice" && "Voz"}
              {t === "recent" && "Recientes"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="ath-food-log-content">
          {tab === "text" && <TextTab token={token} athleteId={athleteId} mealType={mealType} onAdd={addItem} />}
          {tab === "search" && <SearchTab token={token} athleteId={athleteId} onAdd={addItem} />}
          {tab === "voice" && <VoiceTab token={token} athleteId={athleteId} mealType={mealType} onAdd={addItem} />}
          {tab === "recent" && <RecentTab token={token} athleteId={athleteId} onAdd={addItem} />}
        </div>

        {/* Pending items */}
        {items.length > 0 && (
          <div className="ath-food-log-pending">
            <h4 className="ath-food-log-pending-title">
              Alimentos a registrar ({items.length})
              {totalCals > 0 && <span className="ath-food-log-pending-cals"> ~ {Math.round(totalCals)} kcal</span>}
            </h4>
            <div className="ath-food-log-pending-list">
              {items.map((item, idx) => (
                <div key={idx} className="ath-food-log-pending-item">
                  <span className="ath-food-log-pending-name">{item.food_name}</span>
                  <input
                    type="number"
                    className="ath-food-log-pending-qty"
                    min={1}
                    value={item.quantity_g}
                    onChange={(e) => updateQuantity(idx, Number(e.target.value))}
                  />
                  <span className="ath-food-log-pending-unit">g</span>
                  <button
                    type="button"
                    className="ath-food-log-pending-remove"
                    onClick={() => removeItem(idx)}
                    aria-label="Eliminar"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {items.length > 0 && (
          <textarea
            className="ath-food-log-notes"
            rows={2}
            maxLength={300}
            placeholder="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}

        {/* Error */}
        {error && <p className="ath-food-log-error">{error}</p>}

        {/* Save */}
        <div className="ath-food-log-footer">
          <button type="button" className="ath-food-log-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="ath-food-log-save"
            onClick={handleSave}
            disabled={saving || items.length === 0}
          >
            {saving ? "Guardando..." : `Guardar comida (${items.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Tab: Text Input
// ────────────────────────────────────────
function TextTab({
  token,
  athleteId,
  mealType,
  onAdd,
}: {
  token: string;
  athleteId: number;
  mealType: string;
  onAdd: (item: PendingItem) => void;
}) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedFoodItemType[]>([]);
  const [error, setError] = useState("");

  const handleParse = async () => {
    if (!text.trim()) return;
    setParsing(true);
    setError("");
    setParsed([]);
    try {
      const result = await api.parseFood(token, athleteId, text.trim(), mealType);
      setParsed(result.items);
      if (result.items.length === 0) setError("No se pudieron identificar alimentos. Intenta ser mas especifico.");
    } catch {
      setError("Error al analizar. Intentalo de nuevo.");
    } finally {
      setParsing(false);
    }
  };

  const addParsedItem = (item: ParsedFoodItemType) => {
    onAdd({
      food_name: item.food_name,
      quantity_g: item.quantity_g,
      food_item_id: item.matched_food_item?.id,
      calories_per_100g: item.matched_food_item?.calories_per_100g,
      protein_per_100g: item.matched_food_item?.protein_per_100g,
      carbs_per_100g: item.matched_food_item?.carbs_per_100g,
      fat_per_100g: item.matched_food_item?.fat_per_100g,
    });
    setParsed((prev) => prev.filter((p) => p !== item));
  };

  return (
    <div className="ath-food-log-text-tab">
      <textarea
        className="ath-food-log-text-input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ej: 200g pechuga de pollo, ensalada con tomate, un vaso de leche..."
      />
      <button
        type="button"
        className="ath-food-log-analyze-btn"
        onClick={handleParse}
        disabled={parsing || !text.trim()}
      >
        {parsing ? "Analizando..." : "Analizar"}
      </button>

      {error && <p className="ath-food-log-tab-error">{error}</p>}

      {parsed.length > 0 && (
        <div className="ath-food-log-parsed-list">
          {parsed.map((item, idx) => (
            <div key={idx} className="ath-food-log-parsed-item">
              <div className="ath-food-log-parsed-info">
                <span className="ath-food-log-parsed-name">{item.food_name}</span>
                <span className="ath-food-log-parsed-qty">{item.quantity_g}g</span>
                {item.matched_food_item && (
                  <span className="ath-food-log-parsed-cals">
                    ~{Math.round((item.matched_food_item.calories_per_100g * item.quantity_g) / 100)} kcal
                  </span>
                )}
                {item.needs_clarification && item.clarification_question && (
                  <span className="ath-food-log-parsed-clarify">{item.clarification_question}</span>
                )}
              </div>
              <button
                type="button"
                className="ath-food-log-parsed-add"
                onClick={() => addParsedItem(item)}
              >
                + Anadir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────
// Tab: Search
// ────────────────────────────────────────
function SearchTab({
  token,
  athleteId,
  onAdd,
}: {
  token: string;
  athleteId: number;
  onAdd: (item: PendingItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodItemType[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FoodItemType | null>(null);
  const [quantity, setQuantity] = useState(100);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const result = await api.searchFood(token, athleteId, q.trim());
        setResults(result.items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [token, athleteId],
  );

  const handleChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleSelectItem = (item: FoodItemType) => {
    setSelectedItem(item);
    setQuantity(item.default_serving_g || 100);
  };

  const handleAddSelected = () => {
    if (!selectedItem) return;
    onAdd({
      food_name: selectedItem.name + (selectedItem.brand ? ` (${selectedItem.brand})` : ""),
      quantity_g: quantity,
      food_item_id: selectedItem.id,
      calories_per_100g: selectedItem.calories_per_100g,
      protein_per_100g: selectedItem.protein_per_100g,
      carbs_per_100g: selectedItem.carbs_per_100g,
      fat_per_100g: selectedItem.fat_per_100g,
    });
    setSelectedItem(null);
    setQuery("");
    setResults([]);
  };

  const SOURCE_LABELS: Record<string, string> = {
    fatsecret: "FatSecret",
    openfoodfacts: "OpenFoodFacts",
    library: "Biblioteca",
    ai: "IA",
  };

  return (
    <div className="ath-food-log-search-tab">
      <input
        type="text"
        className="ath-food-log-search-input"
        placeholder="Buscar alimento..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        autoFocus
      />

      {searching && <p className="ath-food-log-search-status">Buscando...</p>}

      {selectedItem ? (
        <div className="ath-food-log-search-selected">
          <div className="ath-food-log-search-selected-info">
            <strong>{selectedItem.name}</strong>
            {selectedItem.brand && <span className="ath-food-log-search-brand">{selectedItem.brand}</span>}
            <div className="ath-food-log-search-macros">
              <span>{Math.round((selectedItem.calories_per_100g * quantity) / 100)} kcal</span>
              <span>P: {Math.round((selectedItem.protein_per_100g * quantity) / 100)}g</span>
              <span>CH: {Math.round((selectedItem.carbs_per_100g * quantity) / 100)}g</span>
              <span>G: {Math.round((selectedItem.fat_per_100g * quantity) / 100)}g</span>
            </div>
          </div>
          <div className="ath-food-log-search-qty-row">
            <label>Cantidad:</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="ath-food-log-search-qty-input"
            />
            <span>g</span>
          </div>
          <div className="ath-food-log-search-selected-actions">
            <button type="button" className="ath-food-log-cancel" onClick={() => setSelectedItem(null)}>
              Cancelar
            </button>
            <button type="button" className="ath-food-log-parsed-add" onClick={handleAddSelected}>
              + Anadir
            </button>
          </div>
        </div>
      ) : (
        <div className="ath-food-log-search-results">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ath-food-log-search-result"
              onClick={() => handleSelectItem(item)}
            >
              <div className="ath-food-log-search-result-info">
                <span className="ath-food-log-search-result-name">{item.name}</span>
                {item.brand && <span className="ath-food-log-search-result-brand">{item.brand}</span>}
              </div>
              <div className="ath-food-log-search-result-meta">
                <span className="ath-food-log-search-result-cals">{item.calories_per_100g} kcal/100g</span>
                <span className="ath-food-log-search-result-source">{SOURCE_LABELS[item.source] ?? item.source}</span>
              </div>
            </button>
          ))}
          {!searching && query.trim() && results.length === 0 && (
            <p className="ath-food-log-search-empty">No se encontraron resultados</p>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────
// Tab: Voice
// ────────────────────────────────────────
function VoiceTab({
  token,
  athleteId,
  mealType,
  onAdd,
}: {
  token: string;
  athleteId: number;
  mealType: string;
  onAdd: (item: PendingItem) => void;
}) {
  const [supported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedFoodItemType[]>([]);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const startListening = () => {
    const recognition = getSpeechRecognition();
    if (!recognition) return;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "es-ES";
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setTranscript(text);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("Error al escuchar. Intentalo de nuevo.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setError("");
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const handleAnalyze = async () => {
    if (!transcript.trim()) return;
    setParsing(true);
    setError("");
    try {
      const result = await api.parseFood(token, athleteId, transcript.trim(), mealType);
      setParsed(result.items);
      if (result.items.length === 0) setError("No se pudieron identificar alimentos.");
    } catch {
      setError("Error al analizar.");
    } finally {
      setParsing(false);
    }
  };

  const addParsedItem = (item: ParsedFoodItemType) => {
    onAdd({
      food_name: item.food_name,
      quantity_g: item.quantity_g,
      food_item_id: item.matched_food_item?.id,
      calories_per_100g: item.matched_food_item?.calories_per_100g,
      protein_per_100g: item.matched_food_item?.protein_per_100g,
      carbs_per_100g: item.matched_food_item?.carbs_per_100g,
      fat_per_100g: item.matched_food_item?.fat_per_100g,
    });
    setParsed((prev) => prev.filter((p) => p !== item));
  };

  if (!supported) {
    return (
      <div className="ath-food-log-voice-tab">
        <p className="ath-food-log-voice-unsupported">
          Tu navegador no soporta reconocimiento de voz. Usa las pestanas de texto o busqueda.
        </p>
      </div>
    );
  }

  return (
    <div className="ath-food-log-voice-tab">
      <button
        type="button"
        className={`ath-food-log-voice-btn ${listening ? "listening" : ""}`}
        onClick={listening ? stopListening : startListening}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
      <p className="ath-food-log-voice-hint">{listening ? "Escuchando... pulsa para parar" : "Pulsa para hablar"}</p>

      {transcript && (
        <div className="ath-food-log-voice-transcript">
          <p>{transcript}</p>
          <button
            type="button"
            className="ath-food-log-analyze-btn"
            onClick={handleAnalyze}
            disabled={parsing}
          >
            {parsing ? "Analizando..." : "Analizar"}
          </button>
        </div>
      )}

      {error && <p className="ath-food-log-tab-error">{error}</p>}

      {parsed.length > 0 && (
        <div className="ath-food-log-parsed-list">
          {parsed.map((item, idx) => (
            <div key={idx} className="ath-food-log-parsed-item">
              <div className="ath-food-log-parsed-info">
                <span className="ath-food-log-parsed-name">{item.food_name}</span>
                <span className="ath-food-log-parsed-qty">{item.quantity_g}g</span>
              </div>
              <button type="button" className="ath-food-log-parsed-add" onClick={() => addParsedItem(item)}>
                + Anadir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────
// Tab: Recent
// ────────────────────────────────────────
function RecentTab({
  token,
  athleteId,
  onAdd,
}: {
  token: string;
  athleteId: number;
  onAdd: (item: PendingItem) => void;
}) {
  const [items, setItems] = useState<FoodItemType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.foodLibrary(token, athleteId, "", 20);
        if (!cancelled) setItems(result);
      } catch {
        // graceful degradation
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, athleteId]);

  const handleAdd = (item: FoodItemType) => {
    onAdd({
      food_name: item.name + (item.brand ? ` (${item.brand})` : ""),
      quantity_g: item.default_serving_g || 100,
      food_item_id: item.id,
      calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g,
      carbs_per_100g: item.carbs_per_100g,
      fat_per_100g: item.fat_per_100g,
    });
  };

  if (loading) {
    return (
      <div className="ath-food-log-recent-tab">
        <p className="ath-food-log-search-status">Cargando...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="ath-food-log-recent-tab">
        <p className="ath-food-log-search-empty">
          Aun no tienes alimentos recientes. Registra comidas para verlas aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="ath-food-log-recent-tab">
      <div className="ath-food-log-search-results">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="ath-food-log-search-result"
            onClick={() => handleAdd(item)}
          >
            <div className="ath-food-log-search-result-info">
              <span className="ath-food-log-search-result-name">{item.name}</span>
              {item.brand && <span className="ath-food-log-search-result-brand">{item.brand}</span>}
            </div>
            <div className="ath-food-log-search-result-meta">
              <span className="ath-food-log-search-result-cals">{item.calories_per_100g} kcal/100g</span>
              <span className="ath-food-log-search-result-cals">{item.default_serving_g || 100}g</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
