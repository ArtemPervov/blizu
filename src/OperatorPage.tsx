import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Flag,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  AUDIT_ACTIONS,
  REPORT_CATEGORIES,
  type OperatorAudit,
  type OperatorListing,
  type OperatorPageResult,
  type OperatorReport,
  type OperatorSummary,
  type OperatorUser,
} from "../shared/operator";
import { api, date, json, useAuth, useToast } from "./lib";
import { listingPrice, listingCity } from "./listing-format";
import {
  Empty,
  ErrorState,
  Field,
  FormError,
  Loading,
  Modal,
} from "./components/ui";

type Tab = "reports" | "users" | "listings" | "audit";
type Row = OperatorUser | OperatorListing | OperatorReport | OperatorAudit;
type Change = {
  resource: "users" | "listings";
  id: string;
  title: string;
  action: "block" | "unblock" | "verify" | "unverify" | "hide" | "restore";
};
const tabs: { id: Tab; label: string; icon: typeof Flag }[] = [
  { id: "reports", label: "Обращения", icon: Flag },
  { id: "users", label: "Пользователи", icon: Users },
  { id: "listings", label: "Предложения", icon: Eye },
  { id: "audit", label: "Журнал действий", icon: BookOpen },
];
const states: Record<Tab, [string, string][]> = {
  users: [
    ["all", "Все пользователи"],
    ["active", "Активные"],
    ["blocked", "Заблокированные"],
    ["verified", "С отметкой профиля"],
  ],
  listings: [
    ["all", "Все предложения"],
    ["published", "В каталоге"],
    ["hidden", "Скрытые оператором"],
    ["owner_blocked", "Автор заблокирован"],
  ],
  reports: [
    ["open", "Ждут рассмотрения"],
    ["all", "Все обращения"],
    ["resolved", "Рассмотренные"],
    ["dismissed", "Отклонённые"],
  ],
  audit: [["all", "Все действия"]],
};
const changeLabels = {
  block: "Блокировать",
  unblock: "Снять блокировку",
  verify: "Добавить отметку",
  unverify: "Снять отметку",
  hide: "Скрыть предложение",
  restore: "Снять скрытие",
};
const changeDescriptions = {
  block:
    "Действующие сессии будут завершены. Предложения и открытые заявки участника исчезнут из публичной выдачи. История заказов сохранится.",
  unblock:
    "Участник снова сможет войти. Предложения, отдельно скрытые оператором, останутся скрытыми.",
  verify:
    "У профиля появится отметка, установленная командой сервиса. Укажите основание вашего решения.",
  unverify: "Отметка будет снята с профиля и предложений исполнителя.",
  hide: "Предложение исчезнет из каталога, избранного и публичного просмотра. Автор увидит причину в кабинете. Действующие заказы сохранятся.",
  restore:
    "Отдельное скрытие будет снято. Если автор заблокирован, предложение останется недоступным в каталоге.",
};
const roleLabel = {
  customer: "Заказчик",
  provider: "Исполнитель",
  arbiter: "Арбитр",
};
const reportLabel = {
  open: "Ждёт рассмотрения",
  resolved: "Рассмотрено",
  dismissed: "Отклонено",
};
const valueLabels: Record<string, string> = {
  open: "Ждёт рассмотрения",
  resolved: "Рассмотрено",
  dismissed: "Отклонено",
  none: "Без изменения состояния",
  hide: "Скрыть предложение",
  block: "Заблокировать аккаунт",
};
const booleanLabel = (value: unknown) =>
  typeof value === "boolean"
    ? value
      ? "да"
      : "нет"
    : (valueLabels[String(value)] ?? String(value));
const stateLabel: Record<string, string> = {
  blocked: "Блокировка",
  verified: "Отметка",
  hidden: "Скрытие",
  isOperator: "Доступ оператора",
  status: "Состояние",
  action: "Действие",
};
function Snapshot({ value }: { value: Record<string, unknown> }) {
  return (
    <span>
      {Object.entries(value)
        .map(
          ([key, value]) => `${stateLabel[key] || key}: ${booleanLabel(value)}`,
        )
        .join(" · ")}
    </span>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "attention";
}) {
  return <span className={`operator-badge is-${tone}`}>{children}</span>;
}

export function OperatorPage({ requireLogin }: { requireLogin: () => void }) {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (
    tabs.some((t) => t.id === params.get("tab"))
      ? params.get("tab")!
      : "reports"
  ) as Tab;
  const state = states[tab].some((s) => s[0] === params.get("state"))
    ? params.get("state")!
    : states[tab][0][0];
  const q = (params.get("q") || "").slice(0, 200);
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number(params.get("page")) || 1)),
  );
  const [search, setSearch] = useState(q);
  const [change, setChange] = useState<Change | null>(null);
  const [report, setReport] = useState<OperatorReport | null>(null);
  useEffect(() => setSearch(q), [q]);
  const summary = useQuery({
    queryKey: ["operator", "summary", user?.id],
    queryFn: () => api<OperatorSummary>("/operator/summary"),
    enabled: !!user?.isOperator,
    refetchInterval: 30000,
  });
  const query = new URLSearchParams({
    q,
    state,
    page: String(page),
    pageSize: "20",
  });
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["operator", tab, query.toString(), user?.id],
    queryFn: () => api<OperatorPageResult<Row>>(`/operator/${tab}?${query}`),
    enabled: !!user?.isOperator,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === tab &&
      previousQuery.queryKey[3] === user?.id
        ? previous
        : undefined,
    refetchInterval: 30000,
  });
  function selectTab(tab: Tab, state?: string) {
    setParams({ tab, ...(state ? { state } : {}) });
  }
  function update(values: Record<string, string>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("tab", tab);
        next.delete("page");
        Object.entries(values).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        );
        return next;
      },
      { preventScrollReset: true },
    );
  }
  useEffect(() => {
    if (
      data &&
      !isFetching &&
      data.total > 0 &&
      page > Math.ceil(data.total / data.pageSize)
    )
      update({ page: String(Math.ceil(data.total / data.pageSize)) });
  }, [data, isFetching, page]);
  if (loading)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (!user)
    return (
      <div className="page-shell refined-page">
        <Empty
          title="Пространство команды"
          description="Войдите в учётную запись с разрешением оператора."
        >
          <button className="button primary" onClick={requireLogin}>
            <UserRound size={17} />
            Войти в аккаунт
          </button>
        </Empty>
      </div>
    );
  if (!user.isOperator)
    return (
      <div className="page-shell refined-page">
        <Empty
          title="Доступ ограничен"
          description="Панель доступна сотрудникам, которым выдано разрешение оператора."
        >
          <Link className="button secondary" to="/dashboard">
            В личный кабинет
            <ArrowRight size={16} />
          </Link>
        </Empty>
      </div>
    );
  const total = data?.total ?? 0;
  const reset = () => {
    setSearch("");
    selectTab(tab);
  };
  return (
    <div className="page-shell refined-page operator-page">
      <div className="page-breadcrumb">
        <Link to="/dashboard">Личный кабинет</Link>
        <span>/</span>
        <span>Оператор</span>
      </div>
      <div className="workspace-heading operator-heading">
        <div>
          <span className="section-kicker">КОМАНДА BLIZU</span>
          <h1>
            Всё под <em>вниманием.</em>
          </h1>
          <p>Панель оператора · пользователи, предложения и обращения.</p>
        </div>
        <span className="operator-access-note">
          <ShieldCheck size={19} />
          {user.name}
          <small>Действия сохраняются в журнале</small>
        </span>
      </div>
      <div className="operator-metrics" aria-label="Сводка сервиса">
        <button onClick={() => selectTab("reports", "open")}>
          <span>
            <Flag size={17} />
            Ждут ответа
          </span>
          <strong>{summary.data?.openReports ?? "—"}</strong>
          <small>
            Обращения пользователей
            <ArrowUpRight size={15} />
          </small>
        </button>
        <button onClick={() => selectTab("users")}>
          <span>
            <Users size={17} />
            Пользователи
          </span>
          <strong>{summary.data?.users ?? "—"}</strong>
          <small>
            {summary.data
              ? `Заблокировано: ${summary.data.blockedUsers}`
              : "Загружаем сводку"}
            <ArrowUpRight size={15} />
          </small>
        </button>
        <button onClick={() => selectTab("listings", "published")}>
          <span>
            <Eye size={17} />В каталоге
          </span>
          <strong>{summary.data?.publishedListings ?? "—"}</strong>
          <small>
            Доступные предложения
            <ArrowUpRight size={15} />
          </small>
        </button>
        <button onClick={() => selectTab("listings", "hidden")}>
          <span>
            <EyeOff size={17} />
            Скрыто
          </span>
          <strong>{summary.data?.hiddenListings ?? "—"}</strong>
          <small>
            Решения модерации
            <ArrowUpRight size={15} />
          </small>
        </button>
      </div>
      {summary.error && (
        <p className="form-error" role="alert">
          Не удалось обновить сводку: {summary.error.message}
        </p>
      )}
      <nav className="workspace-tabs operator-tabs" aria-label="Разделы панели">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={tab === id}
            onClick={() => selectTab(id)}
          >
            <Icon size={16} />
            {label}
            {id === "reports" && !!summary.data?.openReports && (
              <span>{summary.data.openReports}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="operator-toolbar glass-panel">
        <form
          role="search"
          aria-label="Поиск в панели"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: search.trim() });
          }}
        >
          <Search size={18} />
          <label className="visually-hidden" htmlFor="operator-search">
            Поиск в панели
          </label>
          <input
            id="operator-search"
            type="search"
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === "users"
                ? "Имя, email или город"
                : tab === "audit"
                  ? "Участник, действие или причина"
                  : "Название, участник или текст"
            }
          />
          <button className="button secondary" type="submit">
            Найти
          </button>
        </form>
        {tab !== "audit" && (
          <label>
            <span className="visually-hidden">Фильтр панели</span>
            <select
              aria-label="Фильтр панели"
              value={state}
              onChange={(e) => update({ state: e.target.value })}
            >
              {states[tab].map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="operator-results">
        <span role="status">
          {isFetching ? "Обновляем данные…" : `Записей: ${total}`}
        </span>
        {(q || state !== states[tab][0][0]) && (
          <button onClick={reset}>
            Сбросить фильтры
            <X size={13} />
          </button>
        )}
      </div>
      <section
        className="operator-content"
        aria-label={tabs.find((t) => t.id === tab)!.label}
        aria-busy={isFetching}
      >
        {isPending ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} retry={refetch} />
        ) : !data?.items.length ? (
          <Empty
            illustration={tab === "reports" ? "conversation" : "search"}
            title={
              q || state !== states[tab][0][0]
                ? "По этим условиям ничего нет"
                : tab === "reports"
                  ? "Пока всё спокойно"
                  : "Здесь пока нет записей"
            }
            description={
              tab === "reports"
                ? "Новые обращения пользователей появятся в этой очереди."
                : tab === "audit"
                  ? "Причина и результат каждого действия появятся в журнале."
                  : "Измените фильтр или поисковый запрос."
            }
          />
        ) : (
          <div className="operator-table-scroll">
            {tab === "users" && (
              <table className="operator-table" role="table">
                <caption className="visually-hidden">
                  Пользователи сервиса
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Пользователь</th>
                    <th scope="col">Состояние</th>
                    <th scope="col">Активность</th>
                    <th scope="col">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items as OperatorUser[]).map((item) => (
                    <tr key={item.id}>
                      <td
                        className="operator-main-cell"
                        data-label="Пользователь"
                      >
                        <strong>{item.name}</strong>
                        <span>{item.email}</span>
                        <small>
                          {roleLabel[item.role]} · {item.city}
                        </small>
                        {item.isOperator && (
                          <Badge>
                            <ShieldCheck size={12} />
                            Оператор
                          </Badge>
                        )}
                      </td>
                      <td data-label="Состояние">
                        <div className="operator-badges">
                          <Badge tone={item.blocked ? "attention" : "good"}>
                            {item.blocked ? "Заблокирован" : "Активен"}
                          </Badge>
                          {item.verified && (
                            <Badge>
                              <BadgeCheck size={12} />С отметкой
                            </Badge>
                          )}
                        </div>
                        {item.blockReason && (
                          <p className="operator-reason">{item.blockReason}</p>
                        )}
                      </td>
                      <td data-label="Активность">
                        <span>Предложений: {item.listingCount}</span>
                        <small>Заказов: {item.orderCount}</small>
                      </td>
                      <td className="operator-actions" data-label="Действия">
                        <div>
                          {!item.isOperator && (
                            <button
                              className={`button secondary ${item.blocked ? "" : "operator-danger"}`}
                              onClick={() =>
                                setChange({
                                  resource: "users",
                                  id: item.id,
                                  title: item.name,
                                  action: item.blocked ? "unblock" : "block",
                                })
                              }
                            >
                              {item.blocked
                                ? "Снять блокировку"
                                : "Блокировать"}
                            </button>
                          )}
                          {item.role === "provider" && (
                            <button
                              className="button secondary"
                              onClick={() =>
                                setChange({
                                  resource: "users",
                                  id: item.id,
                                  title: item.name,
                                  action: item.verified ? "unverify" : "verify",
                                })
                              }
                            >
                              {item.verified
                                ? "Снять отметку"
                                : "Добавить отметку"}
                            </button>
                          )}
                          {item.isOperator && (
                            <span className="muted small">
                              Доступ управляется на сервере
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "listings" && (
              <table className="operator-table" role="table">
                <caption className="visually-hidden">
                  Предложения сервиса
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Предложение</th>
                    <th scope="col">Автор</th>
                    <th scope="col">Видимость</th>
                    <th scope="col">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items as OperatorListing[]).map((item) => (
                    <tr key={item.id}>
                      <td
                        className="operator-main-cell"
                        data-label="Предложение"
                      >
                        <strong>{item.title}</strong>
                        <small>
                          {listingCity(item)} · {listingPrice(item)}
                        </small>
                      </td>
                      <td data-label="Автор">
                        <span>{item.providerName}</span>
                      </td>
                      <td data-label="Видимость">
                        <div className="operator-badges">
                          {item.ownerBlocked && (
                            <Badge tone="attention">Автор заблокирован</Badge>
                          )}
                          <Badge
                            tone={
                              item.hidden
                                ? "attention"
                                : item.ownerBlocked
                                  ? "neutral"
                                  : "good"
                            }
                          >
                            {item.hidden
                              ? "Скрыто оператором"
                              : item.ownerBlocked
                                ? "Недоступно в каталоге"
                                : "В каталоге"}
                          </Badge>
                        </div>
                        {item.moderationReason && (
                          <p className="operator-reason">
                            {item.moderationReason}
                          </p>
                        )}
                      </td>
                      <td className="operator-actions" data-label="Действия">
                        <div>
                          <Link
                            className="button secondary"
                            to={`/listings/${item.id}`}
                          >
                            Просмотреть
                            <ArrowUpRight size={14} />
                          </Link>
                          <button
                            className="button secondary"
                            onClick={() =>
                              setChange({
                                resource: "listings",
                                id: item.id,
                                title: item.title,
                                action: item.hidden ? "restore" : "hide",
                              })
                            }
                          >
                            {item.hidden ? "Снять скрытие" : "Скрыть"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "reports" && (
              <table className="operator-table" role="table">
                <caption className="visually-hidden">
                  Обращения пользователей
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Обращение</th>
                    <th scope="col">Отправитель</th>
                    <th scope="col">Состояние</th>
                    <th scope="col">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items as OperatorReport[]).map((item) => (
                    <tr key={item.id}>
                      <td className="operator-main-cell" data-label="Обращение">
                        <strong>{REPORT_CATEGORIES[item.category]}</strong>
                        <span>{item.targetLabel}</span>
                        <p className="operator-excerpt">{item.description}</p>
                        <small>{date(item.createdAt)}</small>
                      </td>
                      <td data-label="Отправитель">{item.reporterName}</td>
                      <td data-label="Состояние">
                        <Badge
                          tone={
                            item.status === "open" ? "attention" : "neutral"
                          }
                        >
                          {reportLabel[item.status]}
                        </Badge>
                      </td>
                      <td className="operator-actions" data-label="Действия">
                        <button
                          className={`button ${item.status === "open" ? "primary" : "secondary"}`}
                          onClick={() => setReport(item)}
                        >
                          {item.status === "open"
                            ? "Рассмотреть"
                            : "Посмотреть решение"}
                          <ArrowUpRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "audit" && (
              <table
                className="operator-table operator-audit-table"
                role="table"
              >
                <caption className="visually-hidden">
                  Журнал действий оператора
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Действие</th>
                    <th scope="col">Участник</th>
                    <th scope="col">Причина</th>
                    <th scope="col">Изменение</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items as OperatorAudit[]).map((item) => (
                    <tr key={item.id}>
                      <td className="operator-main-cell" data-label="Действие">
                        <strong>
                          {AUDIT_ACTIONS[item.action] || item.action}
                        </strong>
                        <span>{item.targetLabel}</span>
                        <small>{date(item.createdAt)}</small>
                      </td>
                      <td data-label="Участник">{item.actorName}</td>
                      <td data-label="Причина">
                        <p className="preserve-lines">{item.reason}</p>
                      </td>
                      <td className="operator-diff" data-label="Изменение">
                        <small>До</small>
                        <Snapshot value={item.before} />
                        <small>После</small>
                        <Snapshot value={item.after} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
      {data && data.total > data.pageSize && (
        <nav className="operator-pagination" aria-label="Страницы панели">
          <button
            className="button secondary"
            disabled={page === 1 || isFetching}
            onClick={() => update({ page: String(page - 1) })}
          >
            <ArrowLeft size={16} />
            Назад
          </button>
          <span>
            {page} / {Math.ceil(data.total / data.pageSize)}
          </span>
          <button
            className="button secondary"
            disabled={page * data.pageSize >= data.total || isFetching}
            onClick={() => update({ page: String(page + 1) })}
          >
            Дальше
            <ArrowRight size={16} />
          </button>
        </nav>
      )}
      <p className="operator-footnote">
        <ShieldCheck size={15} />
        Блокировки и скрытие обратимы. Коммерческие споры рассматриваются
        арбитром в заказе.
      </p>
      {change && (
        <ChangeModal change={change} onClose={() => setChange(null)} />
      )}
      {report && (
        <ReportReview report={report} onClose={() => setReport(null)} />
      )}
    </div>
  );
}

function useOperatorChange(onClose: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api(path, { method: "PATCH", body: json(body) }),
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) =>
          [
            "operator",
            "listings",
            "listing",
            "favorites",
            "available-listings",
            "dashboard",
            "meta",
            "request",
            "requests",
            "discovery-requests",
            "notifications",
            "me",
          ].includes(String(q.queryKey[0])),
      });
      onClose();
      toast("Решение сохранено в журнале", "success");
    },
  });
}
function ChangeModal({
  change,
  onClose,
}: {
  change: Change;
  onClose: () => void;
}) {
  const mutation = useOperatorChange(onClose);
  const [reason, setReason] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      path: `/operator/${change.resource}/${change.id}`,
      body: { action: change.action, reason },
    });
  }
  return (
    <Modal
      title={changeLabels[change.action]}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <p className="operator-modal-target">{change.title}</p>
      <p className="modal-description">{changeDescriptions[change.action]}</p>
      <form className="form-stack" onSubmit={submit}>
        <Field
          label="Причина решения"
          hint="В журнале сохранятся автор, причина и изменение состояния."
        >
          <textarea
            aria-label="Причина решения"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </Field>
        <FormError message={mutation.error?.message} />
        <div className="operator-modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Отмена
          </button>
          <button className="button primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Сохраняем…" : changeLabels[change.action]}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReportReview({
  report,
  onClose,
}: {
  report: OperatorReport;
  onClose: () => void;
}) {
  const mutation = useOperatorChange(onClose);
  const [status, setStatus] = useState("resolved");
  const [action, setAction] = useState("none");
  const [resolution, setResolution] = useState("");
  return (
    <Modal
      title="Рассмотрение обращения"
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <div className="operator-report-heading">
        <Badge tone={report.status === "open" ? "attention" : "neutral"}>
          {reportLabel[report.status]}
        </Badge>
        <span>{date(report.createdAt)}</span>
      </div>
      <h3 className="operator-modal-target">{report.targetLabel}</h3>
      <p className="muted small">
        {REPORT_CATEGORIES[report.category]} · {report.reporterName}
      </p>
      <p className="operator-report-text">{report.description}</p>
      <Link
        className="quiet-link"
        to={
          report.targetType === "listing"
            ? `/listings/${report.targetId}`
            : `/operator?tab=users&q=${encodeURIComponent(report.targetId)}`
        }
        onClick={onClose}
      >
        Просмотреть объект обращения
        <ArrowUpRight size={15} />
      </Link>
      {report.status !== "open" ? (
        <div className="operator-resolution">
          <strong>Решение</strong>
          <p>{report.resolution}</p>
          <small>
            {report.resolvedByName} · {date(report.updatedAt)}
          </small>
        </div>
      ) : (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({
              path: `/operator/reports/${report.id}`,
              body: { status, action, resolution },
            });
          }}
        >
          <Field label="Результат">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setAction("none");
              }}
            >
              <option value="resolved">Рассмотрено</option>
              <option value="dismissed">Отклонено</option>
            </select>
          </Field>
          <Field label="Действие над объектом">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              disabled={status === "dismissed"}
            >
              <option value="none">Оставить текущее состояние</option>
              {report.targetType === "listing" ? (
                <option value="hide">Скрыть предложение</option>
              ) : (
                <option value="block">Заблокировать аккаунт</option>
              )}
            </select>
          </Field>
          <Field
            label="Решение и основание"
            hint="Этот текст получит отправитель обращения."
          >
            <textarea
              aria-label="Решение и основание"
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </Field>
          <FormError message={mutation.error?.message} />
          <button className="button primary full" disabled={mutation.isPending}>
            {mutation.isPending ? "Сохраняем…" : "Сохранить решение"}
            <Check size={16} />
          </button>
        </form>
      )}
    </Modal>
  );
}
