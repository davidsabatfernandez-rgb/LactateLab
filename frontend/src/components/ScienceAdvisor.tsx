import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type Citation = {
  ref_number: number;
  authors_short: string;
  year: number | null;
  title: string;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  relevance_score: number;
};

type Section = {
  heading: string;
  content: string;
  citations: number[];
};

type AdvisorResponse = {
  question: string;
  summary: string;
  sections: Section[];
  citations: Citation[];
  athlete_context: string | null;
  data_warnings: string[];
  search_meta: Record<string, unknown> | null;
};

type Message = {
  id: number;
  role: "user" | "advisor";
  text: string;
  response?: AdvisorResponse;
  loading?: boolean;
};

export function ScienceAdvisor({
  token,
  athleteId,
}: {
  token: string;
  athleteId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const question = input.trim();
    if (!question || sending) return;

    const userMsg: Message = { id: nextId.current++, role: "user", text: question };
    const loadingMsg: Message = { id: nextId.current++, role: "advisor", text: "", loading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setSending(true);

    try {
      const response = await api.scienceAdvisorAsk(token, {
        question,
        athlete_id: athleteId ?? undefined,
      });
      const advisorResponse = response as AdvisorResponse;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, loading: false, text: advisorResponse.summary, response: advisorResponse }
            : m,
        ),
      );
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Error al consultar el Science Advisor.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id ? { ...m, loading: false, text: errorText } : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      <button
        type="button"
        className="sa-fab"
        onClick={() => setOpen(!open)}
        title="Science Advisor"
        aria-label="Abrir Science Advisor"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.2 6l-.8.6V18a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2.4l-.8-.6A7 7 0 0 1 12 2z" /><line x1="10" y1="22" x2="14" y2="22" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
        )}
      </button>

      {open ? (
        <div className="sa-panel">
          <div className="sa-header">
            <div>
              <strong className="sa-title">Science Advisor</strong>
              <span className="sa-subtitle">Evidencia cientifica en tiempo real</span>
            </div>
          </div>

          <div className="sa-messages">
            {messages.length === 0 ? (
              <div className="sa-empty">
                <p className="sa-empty-title">Pregunta lo que quieras</p>
                <p className="sa-empty-hint">
                  Busca en PubMed, Semantic Scholar y Europe PMC.
                  {athleteId ? " Tiene acceso a los datos de tu atleta." : ""}
                </p>
                <div className="sa-suggestions">
                  {[
                    "¿Qué dice la evidencia sobre el entrenamiento polarizado?",
                    "¿Cómo interpreto una curva de lactato convexa?",
                    "¿Cuánto tarda en verse la mejora del LT1?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="sa-suggestion"
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((msg) => (
              <div key={msg.id} className={`sa-msg sa-msg-${msg.role}`}>
                {msg.loading ? (
                  <div className="sa-loading">
                    <span className="sa-dot" />
                    <span className="sa-dot" />
                    <span className="sa-dot" />
                  </div>
                ) : msg.role === "advisor" && msg.response ? (
                  <AdvisorMessage response={msg.response} />
                ) : (
                  <p>{msg.text}</p>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="sa-input-row">
            <textarea
              ref={inputRef}
              className="sa-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu pregunta..."
              rows={1}
              disabled={sending}
            />
            <button
              type="button"
              className="sa-send"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              title="Enviar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Renderiza markdown básico: **bold**, [n] refs, listas, párrafos */
function renderMarkdown(text: string) {
  return text.split("\n\n").map((block, i) => {
    // Listas
    if (block.trim().startsWith("- ") || block.trim().startsWith("* ")) {
      const items = block.split("\n").filter((l) => l.trim());
      return (
        <ul key={i} className="sa-md-list">
          {items.map((item, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: inlineMarkdown(item.replace(/^[-*]\s*/, "")) }} />
          ))}
        </ul>
      );
    }
    // Párrafos normales
    return <p key={i} dangerouslySetInnerHTML={{ __html: inlineMarkdown(block) }} />;
  });
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(\d+)\]/g, '<span class="sa-ref">[$1]</span>');
}

function AdvisorMessage({ response }: { response: AdvisorResponse }) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showCitations, setShowCitations] = useState(false);

  return (
    <div className="sa-response">
      <div className="sa-summary">{renderMarkdown(response.summary)}</div>

      {response.data_warnings.length > 0 ? (
        <div className="sa-warning">
          {response.data_warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}

      {response.athlete_context ? (
        <p className="sa-context">{response.athlete_context}</p>
      ) : null}

      {response.sections.map((section) => (
        <div key={section.heading} className="sa-section">
          <button
            type="button"
            className="sa-section-toggle"
            onClick={() =>
              setExpandedSection(expandedSection === section.heading ? null : section.heading)
            }
          >
            <span>{section.heading}</span>
            <span className="sa-chevron">{expandedSection === section.heading ? "−" : "+"}</span>
          </button>
          {expandedSection === section.heading ? (
            <div className="sa-section-body">{section.content}</div>
          ) : null}
        </div>
      ))}

      {response.citations.length > 0 ? (
        <div className="sa-citations-block">
          <button
            type="button"
            className="sa-section-toggle"
            onClick={() => setShowCitations(!showCitations)}
          >
            <span>Referencias ({response.citations.length})</span>
            <span className="sa-chevron">{showCitations ? "−" : "+"}</span>
          </button>
          {showCitations ? (
            <ol className="sa-citations-list">
              {response.citations.map((c) => (
                <li key={c.ref_number}>
                  <span className="sa-cite-authors">{c.authors_short}</span>
                  {c.year ? <span className="sa-cite-year"> ({c.year})</span> : null}
                  <span className="sa-cite-title"> {c.title}</span>
                  {c.journal ? <span className="sa-cite-journal">. {c.journal}</span> : null}
                  {c.doi ? (
                    <a
                      className="sa-cite-link"
                      href={`https://doi.org/${c.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      DOI
                    </a>
                  ) : null}
                  {c.pmid ? (
                    <a
                      className="sa-cite-link"
                      href={`https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      PubMed
                    </a>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {response.search_meta ? (
        <p className="sa-meta">
          {String(response.search_meta.papers_returned ?? 0)} papers
          {" · "}
          {(response.search_meta.strategies_used as string[])?.length ?? 0} estrategias
        </p>
      ) : null}
    </div>
  );
}
