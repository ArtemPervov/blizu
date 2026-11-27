import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api, json, useAuth, useI18n } from "./lib";
import { Loading } from "./components/ui";

const copy = {
  ru: {
    title: "ИИ-помощник",
    intro: "Подскажу, как пользоваться Blizu.",
    questions: [
      "Как добавить объявление?",
      "Где посмотреть мои заказы?",
      "Как написать автору?",
    ],
    input: "Ваш вопрос",
    send: "Отправить",
    loading: "Помощник отвечает…",
    error: "Ответ пока не получен. Попробуйте отправить вопрос ещё раз.",
    signIn: "Войдите, чтобы задать вопрос помощнику.",
    login: "Войти",
    catalog: "Каталог",
    orders: "Мои заказы",
  },
  en: {
    title: "AI assistant",
    intro: "Ask me how to use Blizu.",
    questions: [
      "How do I post a listing?",
      "Where are my orders?",
      "How do I message a seller?",
    ],
    input: "Your question",
    send: "Send",
    loading: "The assistant is replying…",
    error: "An answer is unavailable. Please send your question again.",
    signIn: "Sign in to ask the assistant a question.",
    login: "Sign in",
    catalog: "Catalog",
    orders: "My orders",
  },
  me: {
    title: "AI pomoćnik",
    intro: "Pitajte me kako se koristi Blizu.",
    questions: [
      "Kako da objavim oglas?",
      "Gdje su moje narudžbe?",
      "Kako da pišem prodavcu?",
    ],
    input: "Vaše pitanje",
    send: "Pošalji",
    loading: "Pomoćnik odgovara…",
    error: "Odgovor trenutno nije dostupan. Pošaljite pitanje ponovo.",
    signIn: "Prijavite se da biste postavili pitanje pomoćniku.",
    login: "Prijavi se",
    catalog: "Katalog",
    orders: "Moje narudžbe",
  },
};

export function AssistantLink() {
  const { language } = useI18n();
  return (
    <Link className="button primary assistant-launcher" to="/assistant">
      <Sparkles size={17} aria-hidden="true" />
      {copy[language].title}
    </Link>
  );
}

export function AssistantPage({ signIn }: { signIn: () => void }) {
  const { user, loading } = useAuth();
  const { language } = useI18n();
  const text = copy[language];
  return (
    <section className="page-shell assistant-page">
      <header className="page-heading">
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
      </header>
      {loading ? (
        <Loading />
      ) : user ? (
        <AssistantChat key={user.id} />
      ) : (
        <div className="assistant-chat">
          <p>{text.signIn}</p>
          <button className="button primary" onClick={signIn}>
            {text.login}
          </button>
        </div>
      )}
    </section>
  );
}

type Turn = { question: string; answer: string };

function AssistantChat() {
  const { language } = useI18n();
  const text = copy[language];
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState("");
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [turns, pending]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setQuestion("");
    setFailed(false);
    setPending(message);
    try {
      const { answer } = await api<{ answer: string }>("/assistant/chat", {
        method: "POST",
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
      if (!controller.signal.aborted) {
        setTurns((previous) => [
          ...previous.slice(-19),
          { question: message, answer },
        ]);
      }
    } catch {
      if (!controller.signal.aborted) {
        setQuestion(message);
        setFailed(true);
      }
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setPending("");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(question);
  }

  return (
    <div className="assistant-chat">
      {!turns.length && !pending && !failed && (
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
      {(turns.length > 0 || pending) && (
        <div
          ref={transcript}
          className="assistant-transcript"
          role="log"
          aria-label={text.title}
        >
          {turns.map(({ question, answer }, index) => (
            <div className="assistant-turn" key={index}>
              <p className="assistant-question">{question}</p>
              <p className="assistant-answer">{answer}</p>
            </div>
          ))}
          {pending && <p className="assistant-question">{pending}</p>}
        </div>
      )}
      {pending && (
        <p className="muted assistant-status" role="status">
          {text.loading}
        </p>
      )}
      {failed && (
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
        <Link to="/#catalog">{text.catalog}</Link>
        <Link to="/orders">{text.orders}</Link>
      </nav>
    </div>
  );
}
