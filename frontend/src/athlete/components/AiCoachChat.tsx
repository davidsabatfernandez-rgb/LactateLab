import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../lib/api";
import "./AiCoachChat.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AiCoachChatProps = {
  token: string;
  athleteId: number;
};

const INITIAL_GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hola! Soy tu coach IA de PeakAerobic. Tengo acceso a tus datos fisiologicos (umbrales, zonas, lactato, VO2max) y de bienestar (HRV, sueno, recuperacion). Preguntame lo que quieras sobre tu rendimiento, entrenamiento o recuperacion.",
};

export function AiCoachChat({ token, athleteId }: AiCoachChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Load persisted history when chat opens for the first time
  useEffect(() => {
    if (!open || historyLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.aiCoachHistory(token, athleteId);
        if (cancelled) return;
        if (result.messages.length > 0) {
          setMessages([
            INITIAL_GREETING,
            ...result.messages.map((m) => ({ role: m.role, content: m.content })),
          ]);
        }
      } catch {
        // Silently fail — show greeting only
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, historyLoaded, token, athleteId]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const result = await api.aiCoachChat(token, athleteId, trimmed);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response },
      ]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al comunicar con el coach IA";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      await api.aiCoachClearHistory(token, athleteId);
      setMessages([INITIAL_GREETING]);
      setHistoryLoaded(false);
    } catch {
      // Silently fail
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating action button */}
      <button
        className="ath-ai-coach-fab"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Cerrar coach IA" : "Abrir coach IA"}
        title="Coach IA"
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="ath-ai-coach-panel">
          <div className="ath-ai-coach-header">
            <div className="ath-ai-coach-header-info">
              <span className="ath-ai-coach-header-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="ath-ai-coach-header-title">Coach IA</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {messages.length > 1 && (
                <button
                  className="ath-ai-coach-clear"
                  onClick={handleClear}
                  aria-label="Limpiar chat"
                  title="Limpiar chat"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
              <button
                className="ath-ai-coach-close"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="ath-ai-coach-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`ath-ai-coach-msg ath-ai-coach-msg--${msg.role}`}
              >
                <div className="ath-ai-coach-msg-bubble">{msg.content}</div>
              </div>
            ))}
            {loading && (
              <div className="ath-ai-coach-msg ath-ai-coach-msg--assistant">
                <div className="ath-ai-coach-msg-bubble ath-ai-coach-typing">
                  <span className="ath-ai-coach-dot" />
                  <span className="ath-ai-coach-dot" />
                  <span className="ath-ai-coach-dot" />
                </div>
              </div>
            )}
            {error && (
              <div className="ath-ai-coach-error">{error}</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="ath-ai-coach-input-area">
            <textarea
              ref={inputRef}
              className="ath-ai-coach-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta..."
              rows={1}
              disabled={loading}
            />
            <button
              className="ath-ai-coach-send"
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
      )}
    </>
  );
}
