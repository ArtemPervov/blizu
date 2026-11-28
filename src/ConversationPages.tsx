import { useUiText } from "./lib";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, MessageCircle, Send } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type {
  ListingConversation,
  ListingMessage,
  User,
} from "../shared/types";
import { api, date, json, useAuth } from "./lib";
import { Empty, ErrorState, Field, FormError, Loading } from "./components/ui";
import { WorkspaceFrame } from "./WorkspacePages";

export function ConversationsPage({
  requireLogin,
}: {
  requireLogin: () => void;
}) {
  const tr = useUiText();
  const { user, loading } = useAuth();
  const { id } = useParams();
  if (loading) return <Loading />;
  if (!user)
    return (
      <div className="page-shell">
        <Empty
          title={tr("Ваши сообщения")}
          description={tr("Войдите, чтобы продолжить переписку.")}
        >
          <button className="button primary" onClick={requireLogin}>
            {tr("Войти в аккаунт")}
          </button>
        </Empty>
      </div>
    );
  return (
    <WorkspaceFrame user={user}>
      {id ? (
        <ThreadView key={id} id={id} user={user} />
      ) : (
        <ConversationList userId={user.id} />
      )}
    </WorkspaceFrame>
  );
}

function ConversationList({ userId }: { userId: string }) {
  const tr = useUiText();
  const query = useQuery({
    queryKey: ["conversations", userId],
    queryFn: () => api<{ items: ListingConversation[] }>("/conversations"),
    refetchInterval: 30000,
  });
  return (
    <>
      <div className="workspace-heading">
        <h1>{tr("Сообщения")}</h1>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : query.data.items.length ? (
        <ul className="conversation-list">
          {query.data.items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/dashboard/messages/${item.id}`}
                className="glass-panel"
              >
                <MessageCircle size={20} aria-hidden="true" />
                <span>
                  <strong>{item.participantName}</strong>
                  <small>{item.listingTitle}</small>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title={tr("Пока нет сообщений")}
          description={tr("Откройте объявление и нажмите «Написать автору».")}
          illustration="conversation"
        />
      )}
    </>
  );
}

function ThreadView({ id, user }: { id: string; user: User }) {
  const tr = useUiText();
  const [message, setMessage] = useState("");
  const client = useQueryClient();
  const queryKey = ["conversation", id, user.id];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api<{ thread: ListingConversation; messages: ListingMessage[] }>(
        `/conversations/${id}`,
        { signal },
      ),
    refetchInterval: 15000,
  });
  const send = useMutation({
    mutationFn: (text: string) =>
      api(`/conversations/${id}/messages`, {
        method: "POST",
        body: json({ text }),
      }),
    onSuccess: (_, text) => {
      setMessage((current) => (current === text ? "" : current));
      void client.invalidateQueries({ queryKey });
      void client.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  return (
    <>
      <Link to="/dashboard/messages" className="back-link">
        <ArrowLeft size={16} /> {tr("Все сообщения")}
      </Link>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={query.refetch} />
      ) : (
        <section className="conversation-thread glass-panel">
          <div className="workspace-heading">
            <div>
              <h1>{query.data.thread.participantName}</h1>
              <Link to={`/listings/${query.data.thread.listingId}`}>
                {query.data.thread.listingTitle} <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <ol
            className="conversation-messages"
            aria-label={tr("Переписка")}
            aria-live="polite"
          >
            {query.data.messages.map((item) => (
              <li
                key={item.id}
                className={item.authorId === user.id ? "own-message" : ""}
              >
                <span>
                  {item.authorName} ·{" "}
                  <time dateTime={item.createdAt}>{date(item.createdAt)}</time>
                </span>
                <p className="preserve-lines">{item.text}</p>
              </li>
            ))}
          </ol>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (message.trim() && !send.isPending) send.mutate(message);
            }}
          >
            <Field label={tr("Сообщение")}>
              <textarea
                rows={2}
                required
                maxLength={2000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </Field>
            <FormError message={send.error?.message} />
            <button
              className="button primary"
              disabled={send.isPending || !message.trim()}
            >
              <Send size={16} /> {tr("Отправить")}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
