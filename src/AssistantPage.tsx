import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowUp, ArrowUpRight, Sparkles, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  chatStreamType,
  readJsonLines,
  type CatalogFilters,
  type ChatAction,
  type ChatResult,
  type ListingDraft,
} from "../shared/assistant-stream";
import { euro, json, useI18n } from "./lib";
import { cityName } from "./market-copy";

const copy = {
  ru: {
    title: "AI помощник",
    intro: "Найду объявления и помогу разместить ваше.",
    questions: [
      "Найди объявление по авто",
      "Хочу разместить объявление",
      "Где посмотреть мои заказы?",
    ],
    input: "Ваш вопрос",
    send: "Отправить",
    loading: "Помощник отвечает…",
    error: "Ответ пока не получен. Попробуйте отправить вопрос ещё раз.",
    close: "Закрыть чат",
    catalog: "Каталог",
    orders: "Мои заказы",
    openCatalog: "Открыть каталог",
    editListing: "Проверить и опубликовать",
    priceUnknown: "Цена не указана",
  },
  en: {
    title: "AI assistant",
    intro: "Find listings and prepare your own.",
    questions: [
      "Find listings for cars",
      "I want to post a listing",
      "Where are my orders?",
    ],
    input: "Your question",
    send: "Send",
    loading: "The assistant is replying…",
    error: "An answer is unavailable. Please send your question again.",
    close: "Close chat",
    catalog: "Catalog",
    orders: "My orders",
    openCatalog: "Open catalog",
    editListing: "Review and publish",
    priceUnknown: "Price not listed",
  },
  me: {
    title: "AI pomoćnik",
    intro: "Pronađite oglase i pripremite svoj.",
    questions: [
      "Pronađi oglase za vozila",
      "Želim da objavim oglas",
      "Gdje su moje narudžbe?",
    ],
    input: "Vaše pitanje",
    send: "Pošalji",
    loading: "Pomoćnik odgovara…",
    error: "Odgovor trenutno nije dostupan. Pošaljite pitanje ponovo.",
    close: "Zatvori razgovor",
    catalog: "Katalog",
    orders: "Moje narudžbe",
    openCatalog: "Otvori katalog",
    editListing: "Provjeri i objavi",
    priceUnknown: "Cijena nije navedena",
  },
};

type EditListing = (preset: ListingDraft & { id: string }) => void;

export function AssistantWidget({
  openOnLoad,
  editListing,
}: {
  openOnLoad: boolean;
  editListing: EditListing;
}) {
  const { language } = useI18n();
  const text = copy[language];
  const [open, setOpen] = useState(openOnLoad);
  const panelId = useId();
  const titleId = useId();
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (openOnLoad) setOpen(true);
  }, [openOnLoad]);
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  return (
    <div className="assistant-widget">
      <button
        ref={launcher}
        type="button"
        className="button primary assistant-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Sparkles size={17} aria-hidden="true" />
        {text.title}
      </button>
      <section
        className="assistant-panel"
        id={panelId}
        hidden={!open}
        role="dialog"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }}
      >
        <header className="assistant-header">
          <div>
            <h2 id={titleId}>{text.title}</h2>
            <p>{text.intro}</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="assistant-close"
            aria-label={text.close}
            onClick={close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <AssistantChat visible={open} close={close} editListing={editListing} />
      </section>
    </div>
  );
}

type Turn = ChatResult & { question: string };

function catalogHref(filters: CatalogFilters) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return `/${search.size ? `?${search}` : ""}#catalog`;
}

const listingHref = (id: string) => `/listings/${encodeURIComponent(id)}`;

function AssistantChat({
  visible,
  close,
  editListing,
}: {
  visible: boolean;
  close: () => void;
  editListing: EditListing;
}) {
  const { language } = useI18n();
  const text = copy[language];
  const navigate = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [attempt, setAttempt] = useState<Turn | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "failed">("idle");
  const active = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (visible && followLatest.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [turns, attempt, visible]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    followLatest.current = true;
    setQuestion("");
    setAttempt({ question: message, answer: "" });
    setStatus("pending");
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: chatStreamType },
        body: json({
          language,
          message,
          history: turns.slice(-4).flatMap((turn) => [
            { role: "user", content: turn.question },
            { role: "assistant", content: turn.answer },
          ]),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body)
        throw new Error("Chat request failed");
      let answer = "";
      let action: ChatAction | undefined;
      let done = false;
      for await (const value of readJsonLines(response.body)) {
        if (controller.signal.aborted) return;
        if (!value || typeof value !== "object" || "error" in value) {
          throw new Error("Chat stream failed");
        }
        if ("delta" in value && typeof value.delta === "string") {
          answer += value.delta;
          setAttempt({ question: message, answer });
        }
        if ("result" in value) {
          const result = value.result as ChatResult;
          answer = result.answer;
          action = result.action;
          setAttempt({ question: message, answer });
        }
        if ("done" in value && value.done === true) {
          done = true;
          break;
        }
      }
      if (controller.signal.aborted) return;
      if (!done || !answer.trim()) throw new Error("Incomplete chat response");
      setTurns((previous) => [
        ...previous.slice(-19),
        { question: message, answer, action },
      ]);
      setAttempt(null);
      setStatus("idle");
      if (
        action?.kind === "catalog" &&
        action.listings.length &&
        /^(открой(?:те)?|open|otvori)\s/iu.test(message)
      ) {
        navigate(
          action.total === 1
            ? listingHref(action.listings[0].id)
            : catalogHref(action.filters),
        );
        close();
      }
    } catch {
      if (!controller.signal.aborted) {
        setQuestion(message);
        setStatus("failed");
      }
    } finally {
      active.current = null;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(question);
  }

  const pending = status === "pending";
  return (
    <div className="assistant-chat">
      {!turns.length && status === "idle" && (
        <div className="assistant-questions">
          {text.questions.map((prompt) => (
            <button
              className="button secondary"
              key={prompt}
              type="button"
              onClick={() => void send(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
      {(turns.length > 0 || attempt) && (
        <div
          ref={transcript}
          className="assistant-transcript"
          role="log"
          aria-label={text.title}
          onScroll={({ currentTarget }) => {
            followLatest.current =
              currentTarget.scrollHeight -
                currentTarget.scrollTop -
                currentTarget.clientHeight <
              24;
          }}
        >
          {turns.map(({ question, answer, action }, index) => (
            <div className="assistant-turn" key={index}>
              <p className="assistant-question">{question}</p>
              <p className="assistant-answer">{answer}</p>
              {action?.kind === "catalog" && (
                <div className="assistant-results">
                  {action.listings.map((listing) => (
                    <Link
                      key={listing.id}
                      to={listingHref(listing.id)}
                      onClick={close}
                      className="assistant-result"
                    >
                      <strong>{listing.title}</strong>
                      <span>
                        {cityName(listing.city, language)} ·{" "}
                        {listing.price === null
                          ? text.priceUnknown
                          : euro(listing.price)}
                      </span>
                    </Link>
                  ))}
                  <Link
                    className="assistant-result-catalog"
                    to={catalogHref(action.filters)}
                    onClick={close}
                  >
                    {text.openCatalog}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              )}
              {action?.kind === "listingDraft" && (
                <div className="assistant-results">
                  <div className="assistant-result">
                    <strong>{action.draft.title}</strong>
                    <span>
                      {cityName(action.draft.city, language)} ·{" "}
                      {euro(action.draft.price)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button secondary assistant-result-edit"
                    onClick={() => {
                      close();
                      editListing({
                        ...action.draft,
                        id: `assistant-${action.id}`,
                      });
                    }}
                  >
                    {text.editListing}
                  </button>
                </div>
              )}
            </div>
          ))}
          {attempt && (
            <div className="assistant-turn" aria-live="off">
              <p className="assistant-question">{attempt.question}</p>
              {attempt.answer && (
                <p className="assistant-answer">{attempt.answer}</p>
              )}
            </div>
          )}
        </div>
      )}
      {pending && !attempt?.answer && (
        <p className="muted assistant-status" role="status">
          {text.loading}
        </p>
      )}
      {status === "failed" && (
        <p className="muted assistant-status" role="alert">
          {text.error}
        </p>
      )}
      <form className="assistant-composer" onSubmit={submit}>
        <input
          aria-label={text.input}
          placeholder={text.input}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={1200}
          disabled={!!pending}
        />
        <button
          className="button primary"
          aria-label={text.send}
          disabled={!question.trim() || !!pending}
        >
          <ArrowUp size={19} aria-hidden="true" />
        </button>
      </form>
      <nav className="assistant-links" aria-label={text.title}>
        <Link to="/#catalog" onClick={close}>
          {text.catalog}
        </Link>
        <Link to="/orders" onClick={close}>
          {text.orders}
        </Link>
      </nav>
    </div>
  );
}
