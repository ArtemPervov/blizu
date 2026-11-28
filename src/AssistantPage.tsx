import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowUp, ArrowUpRight, CornerDownLeft, Sparkles, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  chatStreamType,
  readJsonLines,
  type CatalogFilters,
  type ChatAction,
  type ChatResult,
  type DraftAction,
} from "../shared/assistant-stream";
import { euro, json, useI18n } from "./lib";
import { cityName } from "./market-copy";
import { createReplyReveal, type ReplyFrame } from "./assistant-reply";

const copy = {
  ru: {
    title: "AI ассистент",
    intro: "Найду объявления и помогу разместить ваше.",
    questions: [
      "Найди объявление по авто",
      "Хочу разместить объявление",
      "Создай заявку",
      "Где посмотреть мои заказы?",
    ],
    input: "Ваш вопрос",
    send: "Отправить",
    loading: "Ассистент отвечает…",
    error: "Ответ пока не получен. Попробуйте отправить вопрос ещё раз.",
    close: "Закрыть чат",
    catalog: "Каталог",
    orders: "Мои заказы",
    openCatalog: "Открыть каталог",
    editListing: "Проверить и опубликовать",
    editRequest: "Проверить заявку",
    newLine: "Новая строка",
    priceUnknown: "Цена не указана",
  },
  en: {
    title: "AI assistant",
    intro: "Find listings and prepare your own.",
    questions: [
      "Find listings for cars",
      "I want to post a listing",
      "Create a service request",
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
    editRequest: "Review request",
    newLine: "New line",
    priceUnknown: "Price not listed",
  },
  me: {
    title: "AI asistent",
    intro: "Pronađite oglase i pripremite svoj.",
    questions: [
      "Pronađi oglase za vozila",
      "Želim da objavim oglas",
      "Napravi zahtjev",
      "Gdje su moje narudžbe?",
    ],
    input: "Vaše pitanje",
    send: "Pošalji",
    loading: "Asistent odgovara…",
    error: "Odgovor trenutno nije dostupan. Pošaljite pitanje ponovo.",
    close: "Zatvori razgovor",
    catalog: "Katalog",
    orders: "Moje narudžbe",
    openCatalog: "Otvori katalog",
    editListing: "Provjeri i objavi",
    editRequest: "Provjeri zahtjev",
    newLine: "Novi red",
    priceUnknown: "Cijena nije navedena",
  },
};

type EditDraft = (draft: DraftAction) => void;
const mobileQuery = "(max-width: 760px)";

export function AssistantWidget({
  openOnLoad,
  editDraft,
}: {
  openOnLoad: boolean;
  editDraft: EditDraft;
}) {
  const { language } = useI18n();
  const text = copy[language];
  const [open, setOpen] = useState(openOnLoad);
  const [mobile, setMobile] = useState(
    () => window.matchMedia(mobileQuery).matches,
  );
  const panelId = useId();
  const titleId = useId();
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (openOnLoad) setOpen(true);
  }, [openOnLoad]);
  useEffect(() => {
    const media = window.matchMedia(mobileQuery);
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const dialog = panel.current;
    if (!dialog) return;
    if (dialog.open) dialog.close();
    if (!open) return;
    if (mobile) dialog.showModal();
    else dialog.open = true;
    closeButton.current?.focus({ preventScroll: true });
  }, [open, mobile]);
  useLayoutEffect(() => {
    const dialog = panel.current;
    const viewport = window.visualViewport;
    if (!open || !mobile || !dialog || !viewport) return;
    const fit = () => {
      dialog.style.setProperty(
        "--assistant-viewport-height",
        `${viewport.height}px`,
      );
      dialog.style.setProperty(
        "--assistant-viewport-top",
        `${viewport.offsetTop}px`,
      );
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, [open, mobile]);

  function close() {
    if (panel.current?.open) panel.current.close();
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
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
      <dialog
        ref={panel}
        className="assistant-panel"
        id={panelId}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
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
        <AssistantChat visible={open} close={close} editDraft={editDraft} />
      </dialog>
    </div>
  );
}

type Turn = ChatResult & { id: number; question: string };
type Attempt = Turn & Pick<ReplyFrame, "fading">;

function catalogHref(filters: CatalogFilters) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return `/${search.size ? `?${search}` : ""}#catalog`;
}

const listingHref = (id: string) => `/listings/${encodeURIComponent(id)}`;

function replyEnd(log: HTMLDivElement, answer: HTMLParagraphElement | null) {
  if (!answer) return log.scrollHeight;
  return (
    log.scrollTop +
    answer.getBoundingClientRect().bottom -
    log.getBoundingClientRect().top
  );
}

function AssistantChat({
  visible,
  close,
  editDraft,
}: {
  visible: boolean;
  close: () => void;
  editDraft: EditDraft;
}) {
  const { language } = useI18n();
  const text = copy[language];
  const navigate = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "failed">("idle");
  const active = useRef<AbortController | null>(null);
  const nextTurn = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const lastReply = useRef<HTMLParagraphElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const followLatest = useRef(true);
  const latest = attempt ?? turns.at(-1);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!visible || !composer.current) return;
    const field = composer.current;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2}px`;
  }, [question, visible]);
  useLayoutEffect(() => {
    const log = transcript.current;
    if (!visible || !followLatest.current || !log) return;
    const bottom = replyEnd(log, latest?.action ? lastReply.current : null);
    const next = bottom - log.clientHeight;
    if (next > log.scrollTop) log.scrollTop = next;
  }, [latest, visible]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || active.current) return;
    const controller = new AbortController();
    const id = nextTurn.current++;
    active.current = controller;
    followLatest.current = true;
    setQuestion("");
    setAttempt({ id, question: message, answer: "", fading: [] });
    setStatus("pending");
    let action: ChatAction | undefined;
    const reveal = createReplyReveal(({ text: answer, fading }) =>
      setAttempt({ id, question: message, answer, fading, action }),
    );
    controller.signal.addEventListener("abort", reveal.stop, { once: true });
    let answer = "";
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
      let done = false;
      for await (const value of readJsonLines(response.body)) {
        if (controller.signal.aborted) return;
        if (!value || typeof value !== "object" || "error" in value) {
          throw new Error("Chat stream failed");
        }
        if ("delta" in value && typeof value.delta === "string") {
          answer += value.delta;
          reveal.append(value.delta);
        }
        if ("result" in value) {
          const result = value.result as ChatResult;
          answer = result.answer;
          action = result.action;
          setAttempt((current) => current && { ...current, action });
          reveal.replace(answer);
        }
        if ("done" in value && value.done === true) {
          done = true;
          break;
        }
      }
      if (controller.signal.aborted) return;
      if (!done || !answer.trim()) throw new Error("Incomplete chat response");
      const destination =
        action?.kind === "catalog" &&
        action.listings.length &&
        /^(открой(?:те)?|open|otvori)\s/iu.test(message)
          ? action.total === 1
            ? listingHref(action.listings[0].id)
            : catalogHref(action.filters)
          : undefined;
      if (destination) reveal.flush();
      else await reveal.finish();
      if (controller.signal.aborted) return;
      setTurns((previous) => [
        ...previous.slice(-19),
        { id, question: message, answer, action },
      ]);
      setAttempt(null);
      setStatus("idle");
      if (destination) {
        navigate(destination);
        close();
      }
    } catch {
      if (!controller.signal.aborted) {
        if (answer) reveal.flush();
        setQuestion((current) => current || message);
        setStatus("failed");
      }
    } finally {
      controller.signal.removeEventListener("abort", reveal.stop);
      reveal.stop();
      active.current = null;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(question);
  }

  function insertNewLine() {
    const field = composer.current;
    if (!field) return;
    const { selectionStart, selectionEnd, maxLength, value } = field;
    if (value.length - (selectionEnd - selectionStart) >= maxLength) return;
    field.setRangeText("\n", selectionStart, selectionEnd, "end");
    setQuestion(field.value);
    field.focus({ preventScroll: true });
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
              replyEnd(
                currentTarget,
                latest?.action ? lastReply.current : null,
              ) -
                currentTarget.scrollTop -
                currentTarget.clientHeight <
              24;
          }}
        >
          {(attempt ? [...turns, attempt] : turns).map((turn) => {
            const { id, question, answer, action } = turn;
            const typing = turn === attempt && pending;
            const tail = typing ? attempt.fading : [];
            return (
              <div
                className="assistant-turn"
                key={id}
                aria-live={turn === attempt ? "off" : undefined}
              >
                <p className="assistant-question">{question}</p>
                {answer ? (
                  <p
                    className="assistant-answer"
                    ref={turn === latest ? lastReply : undefined}
                  >
                    {answer.slice(0, tail[0]?.offset ?? answer.length)}
                    {tail.map(({ offset, text }) => (
                      <span className="assistant-letter" key={offset}>
                        {text}
                      </span>
                    ))}
                    {tail.length > 0 && (
                      <span className="assistant-caret" aria-hidden="true" />
                    )}
                  </p>
                ) : (
                  typing && (
                    <p
                      className="assistant-answer assistant-waiting"
                      role="status"
                      aria-live="polite"
                      ref={lastReply}
                    >
                      <span className="assistant-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      {text.loading}
                    </p>
                  )
                )}
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
                {(action?.kind === "listingDraft" ||
                  action?.kind === "requestDraft") && (
                  <div className="assistant-results">
                    <div className="assistant-result">
                      <strong>{action.draft.title}</strong>
                      <span>
                        {cityName(action.draft.city, language)}
                        {action.kind === "listingDraft"
                          ? ` · ${euro(action.draft.price)}`
                          : action.draft.budget > 0 &&
                            ` · ${euro(action.draft.budget)}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button secondary assistant-result-edit"
                      onClick={() => {
                        close();
                        editDraft(action);
                      }}
                    >
                      {action.kind === "requestDraft"
                        ? text.editRequest
                        : text.editListing}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {status === "failed" && (
        <p className="muted assistant-status" role="alert">
          {text.error}
        </p>
      )}
      <form className="assistant-compose-form" onSubmit={submit}>
        <div className="assistant-composer">
          <textarea
            ref={composer}
            aria-label={text.input}
            placeholder={text.input}
            value={question}
            rows={1}
            enterKeyHint="send"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              if (event.altKey || event.metaKey || event.shiftKey) return;
              event.preventDefault();
              if (event.ctrlKey) insertNewLine();
              else void send(question);
            }}
            maxLength={1200}
          />
          <button
            type="button"
            className="button secondary assistant-newline"
            aria-label={text.newLine}
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertNewLine}
          >
            <CornerDownLeft size={18} aria-hidden="true" />
          </button>
          <button
            className="button primary"
            aria-label={text.send}
            disabled={!question.trim() || !!pending}
          >
            <ArrowUp size={19} aria-hidden="true" />
          </button>
        </div>
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
