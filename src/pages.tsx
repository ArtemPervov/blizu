import { lazy, Suspense, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Clock3,
  ExternalLink,
  FileImage,
  Handshake,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Send,
  ShieldCheck,
  Star,
  Truck,
  UserRound,
} from "lucide-react";
import {
  CATEGORIES,
  CITIES,
  STATUS_LABELS,
  type Incident,
  type Listing,
  type Offer,
  type Order,
  type OrderDetail,
  type OrderStatus,
  type ServiceRequest,
} from "../shared/types";
import { api, date, euro, json, useAuth, useToast } from "./lib";
import {
  Empty,
  ErrorState,
  Field,
  FormError,
  Loading,
  Modal,
} from "./components/ui";
import type { CreateAction } from "./App";
const ParticleScene = lazy(() => import("./components/Particles"));

function LoginRequired({ onLogin }: { onLogin: () => void }) {
  return (
    <Empty
      title="Ваши дела — в одном месте"
      description="Войдите, чтобы создавать заявки, договариваться и следить за заказами."
    >
      <button className="button primary" onClick={onLogin}>
        <UserRound size={17} />
        Войти в аккаунт
      </button>
    </Empty>
  );
}
function RequestCard({ item }: { item: ServiceRequest }) {
  return (
    <Link className="request-card" to={`/requests/${item.id}`}>
      <div
        className={`request-category-icon ${item.kind === "delivery" ? "blue-bg" : ""}`}
      >
        {item.kind === "delivery" ? (
          <Package size={22} />
        ) : (
          <MessageCircle size={22} />
        )}
      </div>
      <div className="request-card-content">
        <div className="request-meta">
          <span>
            <MapPin size={12} />
            {item.city}
          </span>
          <span>
            {item.kind === "delivery"
              ? "Доставка"
              : CATEGORIES.find((c) => c.id === item.category)?.name}
          </span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div className="request-card-footer">
          <span className="provider-line">
            <span className="mini-avatar">{item.customerName[0]}</span>
            {item.customerName}
          </span>
          <span>
            <MessageCircle size={13} />
            {item.offerCount} откликов
          </span>
        </div>
      </div>
      <div className="request-price">
        <strong>{item.budget ? euro(item.budget) : "Обсудим"}</strong>
        <span>{item.budget ? "бюджет" : "стоимость"}</span>
        <ArrowUpRight size={20} />
      </div>
    </Link>
  );
}

export function RequestsPage({
  city,
  setCity,
  create,
}: {
  city: string;
  setCity: (value: string) => void;
  create: CreateAction;
}) {
  const [category, setCategory] = useState("all");
  const [kind, setKind] = useState("");
  const query = new URLSearchParams({
    city,
    category,
    ...(kind ? { kind } : {}),
  });
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["requests", city, category, kind],
    queryFn: () => api<{ items: ServiceRequest[] }>(`/requests?${query}`),
  });
  return (
    <div className="page-shell">
      <div className="page-heading heading-with-action">
        <div>
          <span className="section-kicker">ПОМОЩЬ НАЧИНАЕТСЯ С ЗАПРОСА</span>
          <h1>
            Ищу исполнителя<span className="heading-dot">.</span>
          </h1>
          <p>
            У кого-то есть задача. У кого-то — свободное время и нужный навык.
          </p>
        </div>
        <button className="button primary" onClick={() => create("request")}>
          <Plus size={18} />
          Создать заявку
        </button>
      </div>
      <div className="filter-bar">
        <div className="pill-tabs">
          {[
            ["", "Все заявки"],
            ["service", "Услуги"],
            ["delivery", "Доставка"],
          ].map(([value, label]) => (
            <button
              className={kind === value ? "active" : ""}
              key={value}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Категория заявок"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Город заявок"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          {CITIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="two-column-page">
        <section className="request-list">
          {isPending ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} retry={refetch} />
          ) : data?.items.length ? (
            data.items.map((item) => <RequestCard key={item.id} item={item} />)
          ) : (
            <Empty
              title="Пока тихо"
              description="Создайте первую заявку в этой категории — пусть нужные люди вас найдут."
            >
              <button
                className="button primary"
                onClick={() => create("request")}
              >
                Создать заявку
              </button>
            </Empty>
          )}
        </section>
        <aside className="help-card">
          <span className="help-card-icon">
            <Handshake size={29} />
          </span>
          <h3>
            Хорошие дела
            <br />
            находят своих людей.
          </h3>
          <p>
            Опишите задачу, сравните отклики и выберите человека, которому
            доверяете.
          </p>
          <div className="help-divider" />
          <span>
            <Check size={15} />
            Цена до начала работы
          </span>
          <span>
            <Check size={15} />
            Контакты после выбора
          </span>
          <span>
            <Check size={15} />
            Помощь при споре
          </span>
        </aside>
      </div>
    </div>
  );
}

export function RequestPage({ requireLogin }: { requireLogin: () => void }) {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["request", id, user?.id],
    queryFn: () =>
      api<{ item: ServiceRequest; offers: Offer[] }>(`/requests/${id}`),
  });
  const offer = useMutation({
    mutationFn: (f: FormData) =>
      api(`/requests/${id}/offers`, {
        method: "POST",
        body: json({ ...Object.fromEntries(f), price: Number(f.get("price")) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["request", id] });
      toast("Отклик отправлен. Заказчик получил уведомление.");
    },
  });
  const accept = useMutation({
    mutationFn: (offerId: string) =>
      api<{ id: string }>(`/offers/${offerId}/accept`, {
        method: "POST",
        body: json({}),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      navigate(`/orders/${r.id}`);
      toast("Исполнитель выбран. Условия сохранены в заказе.");
    },
  });
  if (isPending)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell">
        <ErrorState error={error} retry={refetch} />
      </div>
    );
  const { item, offers } = data;
  const owner = user?.id === item.customerId;
  const already = offers.some((o) => o.providerId === user?.id);
  return (
    <div className="page-shell">
      <Link className="back-link" to="/requests">
        <ArrowLeft size={16} />
        Все заявки
      </Link>
      <div className="detail-layout">
        <div>
          <span
            className={`status-pill ${item.status === "open" ? "green-pill" : ""}`}
          >
            {item.status === "open"
              ? "Ищет исполнителя"
              : item.status === "assigned"
                ? "Исполнитель выбран"
                : "Заявка закрыта"}
          </span>
          <h1 className="detail-title">{item.title}</h1>
          <div className="detail-meta">
            <span>
              <MapPin size={15} />
              {item.city}
            </span>
            <span>
              <Clock3 size={15} />
              {date(item.createdAt)}
            </span>
            <span>
              <UserRound size={15} />
              {item.customerName}
            </span>
          </div>
          <section className="content-card">
            <h2>О задаче</h2>
            <p className="preserve-lines">{item.description}</p>
            {item.kind === "delivery" && (
              <div className="delivery-details">
                <span>
                  <Package size={17} />
                  Отправление: {item.origin}
                </span>
                {item.productUrl && (
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Посмотреть товар
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )}
          </section>
          <section className="content-card">
            <h2>
              {owner ? "Отклики исполнителей" : "Отклики"}{" "}
              <span className="count-badge">{item.offerCount}</span>
            </h2>
            {!user ? (
              <p className="muted">
                Войдите, чтобы откликнуться или увидеть свой отклик.
              </p>
            ) : !owner && user.role !== "arbiter" ? (
              <p className="muted small">
                Вам видны только ваши отклики. Полный список доступен автору
                заявки.
              </p>
            ) : null}
            {offers.length ? (
              offers.map((o) => (
                <div className="offer-card" key={o.id}>
                  <div className="offer-top">
                    <span className="large-avatar">{o.providerName[0]}</span>
                    <div>
                      <strong>{o.providerName}</strong>
                      <span className="offer-rating">
                        <Star size={12} fill="currentColor" />
                        {o.providerRating.toFixed(1)}
                        <span>Исполнитель</span>
                      </span>
                    </div>
                    <strong className="offer-price">{euro(o.price)}</strong>
                  </div>
                  <p>{o.message}</p>
                  <span className="offer-eta">
                    <Clock3 size={14} />
                    {o.eta}
                  </span>
                  {owner && item.status === "open" && (
                    <button
                      className="button primary"
                      disabled={accept.isPending}
                      onClick={() => accept.mutate(o.id)}
                    >
                      Выбрать за {euro(o.price)}
                      <Check size={16} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="muted padded">
                {owner
                  ? "Первые отклики появятся здесь. Мы уведомим вас."
                  : "Пока нет доступных откликов."}
              </div>
            )}
            <FormError message={accept.error?.message} />
          </section>
        </div>
        <aside className="sticky-aside">
          <div className="content-card">
            <span className="section-kicker">БЮДЖЕТ ЗАКАЗЧИКА</span>
            <div className="big-price">
              {item.budget ? euro(item.budget) : "Обсудим"}
            </div>
            <p className="muted small">
              Итоговая цена фиксируется при выборе отклика. Оплата — при личной
              встрече.
            </p>
            {!user ? (
              <button className="button primary full" onClick={requireLogin}>
                Войти и откликнуться
                <ArrowRight size={16} />
              </button>
            ) : user.role === "provider" &&
              !owner &&
              item.status === "open" &&
              !already ? (
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  offer.mutate(new FormData(e.currentTarget));
                }}
              >
                <h3>Поможете с задачей?</h3>
                <Field label="Ваша цена, €">
                  <input
                    type="number"
                    name="price"
                    required
                    min={1}
                    max={1000000}
                    step="0.01"
                    placeholder="Итоговая стоимость"
                  />
                </Field>
                <Field label="Когда сможете">
                  <input
                    name="eta"
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="Например, завтра после 14:00"
                  />
                </Field>
                <Field label="Сообщение">
                  <textarea
                    name="message"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    placeholder="Как поможете, что входит в цену…"
                  />
                </Field>
                <FormError message={offer.error?.message} />
                <button
                  className="button primary full"
                  disabled={offer.isPending}
                >
                  {offer.isPending ? "Отправляем…" : "Отправить отклик"}
                  <Send size={16} />
                </button>
              </form>
            ) : (
              <div className="form-note">
                <ShieldCheck size={20} />
                <p>
                  {owner
                    ? "Сравните предложения и выберите подходящее."
                    : already
                      ? "Ваш отклик отправлен. Ждём решения заказчика."
                      : user.role === "provider"
                        ? "По заявке уже выбран исполнитель."
                        : "Откликаться могут аккаунты исполнителей."}
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ListingPage({ create }: { create: CreateAction }) {
  const { id } = useParams();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => api<{ item: Listing }>(`/listings/${id}`),
  });
  if (isPending)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell">
        <ErrorState error={error} retry={refetch} />
      </div>
    );
  const l = data.item;
  return (
    <div className="page-shell">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Все предложения
      </Link>
      <div className="detail-layout">
        <div>
          <div className="detail-image">
            <img src={l.image} alt={l.title} />
            <span className="image-tag">
              {CATEGORIES.find((c) => c.id === l.category)?.name}
            </span>
          </div>
          <h1 className="detail-title">{l.title}</h1>
          <div className="detail-meta">
            <span>
              <MapPin size={15} />
              {l.city}
            </span>
            <span className="rating">
              <Star size={14} fill="currentColor" />
              {l.providerRating.toFixed(1)}{" "}
              <span>· {l.reviewCount} оценок</span>
            </span>
          </div>
          <section className="content-card">
            <h2>Чем могу помочь</h2>
            <p className="preserve-lines">{l.description}</p>
            <div className="tag-list">
              {l.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </section>
        </div>
        <aside className="sticky-aside">
          <div className="content-card provider-card">
            <span className="large-avatar">{l.providerName[0]}</span>
            <h2>
              {l.providerName}
              {l.providerVerified && <BadgeCheck size={20} className="green" />}
            </h2>
            <span className="muted small">Местный исполнитель · {l.city}</span>
            <div className="price-divider" />
            <span className="muted small">Стоимость от</span>
            <div className="big-price">
              {euro(l.price)} <span>/ {l.unit}</span>
            </div>
            <button
              className="button primary full"
              onClick={() => create("request", l)}
            >
              Обсудить задачу
              <ArrowUpRight size={18} />
            </button>
            <p className="muted small">
              Создадим заявку по этому предложению. Согласуйте итоговую цену в
              отклике до начала работы.
            </p>
            <div className="form-note">
              <ShieldCheck size={21} />
              <p>Контакты открываются в заказе после выбора исполнителя.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function DeliveryPage({ create }: { create: CreateAction }) {
  return (
    <div className="page-shell">
      <section className="delivery-hero">
        <div>
          <span className="eyebrow">
            <Package size={15} />
            ВАЖНОЕ ПРИЕДЕТ
          </span>
          <h1>
            Расстояние —<br />
            <span>только часть пути.</span>
          </h1>
          <p>
            Товары из РФ, Китая и Европы — с понятной стоимостью и историей
            каждого этапа. От ссылки до «забрал, спасибо».
          </p>
          <button className="button primary" onClick={() => create("delivery")}>
            Рассчитать доставку
            <ArrowUpRight size={18} />
          </button>
          <span className="delivery-hero-note">
            <ShieldCheck size={15} />
            Условия до заказа. Оплата при встрече.
          </span>
        </div>
        <div className="parcel-art">
          <Suspense
            fallback={
              <div className="parcel-fallback">
                <span>✳</span>
              </div>
            }
          >
            <ParticleScene variant="delivery" />
          </Suspense>
          <span className="route-badge route-rf">
            RU <span>Москва</span>
          </span>
          <span className="route-badge route-china">
            CN <span>Шанхай</span>
          </span>
          <span className="route-badge route-me">
            <span className="live-dot" />
            ME <span>Черногория</span>
          </span>
          <div className="parcel-status">
            <span className="status-check">
              <Check size={16} />
            </span>
            <div>
              <strong>Всё под контролем</strong>
              <span>Каждый этап — в вашем заказе</span>
            </div>
          </div>
        </div>
      </section>
      <div className="section-header section-space">
        <div>
          <span className="section-kicker">ПОНЯТНО НА КАЖДОМ ЭТАПЕ</span>
          <h2>Как доберётся ваша покупка</h2>
        </div>
        <Link className="text-link" to="/dashboard">
          Мои доставки
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="delivery-steps">
        {[
          [
            Plus,
            "Оставьте ссылку",
            "Что за товар, откуда и в какой город доставить.",
          ],
          [
            Handshake,
            "Выберите логиста",
            "Сравните итоговую цену и срок в откликах.",
          ],
          [
            Truck,
            "Следите за дорогой",
            "От склада до Черногории — статусы всегда под рукой.",
          ],
          [
            CircleCheck,
            "Заберите покупку",
            "Подтвердите получение. Рассчитайтесь напрямую.",
          ],
        ].map(([Icon, title, description], i) => {
          const I = Icon as typeof Plus;
          return (
            <div className="content-card" key={String(title)}>
              <span className="delivery-step-icon">
                <I size={25} />
              </span>
              <span className="step-index">0{i + 1}</span>
              <h3>{String(title)}</h3>
              <p>{String(description)}</p>
            </div>
          );
        })}
      </div>
      <section className="request-callout">
        <div className="callout-doodle">
          <ShieldCheck size={42} strokeWidth={1.3} />
        </div>
        <div>
          <h2>Если путь оказался непростым</h2>
          <p>
            Откройте спор в заказе и приложите фото. Арбитр поможет разобраться.
            <br />
            Если статус долго не меняется, система сама создаст инцидент.
          </p>
        </div>
        <Link className="button dark" to="/dashboard">
          Перейти к заказам
          <ArrowRight size={17} />
        </Link>
      </section>
    </div>
  );
}

type Dashboard = {
  orders: Order[];
  requests: ServiceRequest[];
  listings: Listing[];
  incidents: Incident[];
};
export function DashboardPage({
  create,
  requireLogin,
}: {
  create: CreateAction;
  requireLogin: () => void;
}) {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState("orders");
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: () => api<Dashboard>("/dashboard"),
    enabled: !!user,
    refetchInterval: 30000,
  });
  if (loading)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (!user)
    return (
      <div className="page-shell">
        <LoginRequired onLogin={requireLogin} />
      </div>
    );
  const tabs = [
    ["orders", "Заказы", data?.orders.length],
    ["requests", "Мои заявки", data?.requests.length],
    ...(user.role === "provider"
      ? [["listings", "Предложения", data?.listings.length]]
      : []),
    ...(user.role === "arbiter"
      ? [
          [
            "incidents",
            "Споры",
            data?.incidents.filter((i) => i.status === "open").length,
          ],
        ]
      : []),
  ];
  return (
    <div className="page-shell">
      <div className="page-heading heading-with-action">
        <div>
          <span className="section-kicker">ВАШ ЛИЧНЫЙ УГОЛОК</span>
          <h1>
            {user.role === "arbiter"
              ? "Помогаем договориться"
              : `Здравствуйте, ${user.name.split(" ")[0]}`}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {user.role === "arbiter"
              ? "Все споры, история договорённостей и решения."
              : "Заявки, заказы и хорошие люди — всё под рукой."}
          </p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            create(user.role === "provider" ? "listing" : "request")
          }
        >
          <Plus size={18} />
          {user.role === "provider" ? "Добавить предложение" : "Создать заявку"}
        </button>
      </div>
      <div className="dashboard-stats">
        <div>
          <span className="stat-icon">
            <Package size={20} />
          </span>
          <strong>
            {data?.orders.filter(
              (o) => !["completed", "resolved"].includes(o.status),
            ).length ?? 0}
          </strong>
          <span>заказов в работе</span>
        </div>
        <div>
          <span className="stat-icon">
            <MessageCircle size={20} />
          </span>
          <strong>
            {data?.requests.filter((r) => r.status === "open").length ?? 0}
          </strong>
          <span>открытых заявок</span>
        </div>
        <div>
          <span className="stat-icon">
            <ShieldCheck size={20} />
          </span>
          <strong>{user.rating.toFixed(1)}</strong>
          <span>ваш рейтинг</span>
        </div>
      </div>
      <div className="pill-tabs dashboard-tabs">
        {tabs.map(([value, label, count]) => (
          <button
            className={tab === value ? "active" : ""}
            key={String(value)}
            onClick={() => setTab(String(value))}
          >
            {label}
            <span>{count ?? 0}</span>
          </button>
        ))}
      </div>
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={refetch} />
      ) : tab === "orders" ? (
        data?.orders.length ? (
          <div className="order-list">
            {data.orders.map((o) => (
              <Link
                key={o.id}
                className="order-card content-card"
                to={`/orders/${o.id}`}
              >
                <span
                  className={`order-type-icon ${o.kind === "delivery" ? "blue-bg" : ""}`}
                >
                  {o.kind === "delivery" ? (
                    <Truck size={25} />
                  ) : (
                    <Handshake size={25} />
                  )}
                </span>
                <div>
                  <span className="muted small">
                    {o.kind === "delivery" ? "Доставка" : "Услуга"} · {o.city}
                  </span>
                  <h3>{o.title}</h3>
                  <span className="muted small">
                    {o.customerId === user.id ? o.providerName : o.customerName}
                  </span>
                </div>
                <span className={`status-pill status-${o.status}`}>
                  {STATUS_LABELS[o.status]}
                </span>
                <strong>{euro(o.price)}</strong>
                <ArrowUpRight size={19} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="Здесь начнутся хорошие дела"
            description="Создайте заявку и выберите отклик — заказ появится здесь."
          >
            <button
              className="button primary"
              onClick={() => create("request")}
            >
              Создать заявку
            </button>
          </Empty>
        )
      ) : tab === "requests" ? (
        data?.requests.length ? (
          <div className="request-list">
            {data.requests.map((r) => (
              <RequestCard key={r.id} item={r} />
            ))}
          </div>
        ) : (
          <Empty title="Вы ещё не создавали заявки">
            <button
              className="button primary"
              onClick={() => create("request")}
            >
              Создать первую
            </button>
          </Empty>
        )
      ) : tab === "listings" ? (
        data?.listings.length ? (
          <div className="listing-grid">
            {data.listings.map((l) => (
              <Link
                className="content-card"
                to={`/listings/${l.id}`}
                key={l.id}
              >
                <img className="dashboard-listing-image" src={l.image} alt="" />
                <h3>{l.title}</h3>
                <p>
                  {euro(l.price)} / {l.unit}
                </p>
                <span className="text-link">
                  Открыть предложение
                  <ArrowUpRight size={16} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Покажите, чем можете помочь">
            <button
              className="button primary"
              onClick={() => create("listing")}
            >
              Добавить предложение
            </button>
          </Empty>
        )
      ) : data?.incidents.length ? (
        <div className="order-list">
          {data.incidents.map((i) => (
            <Link
              key={i.id}
              className="order-card content-card"
              to={`/orders/${i.orderId}`}
            >
              <span className="order-type-icon">
                <CircleAlert size={24} />
              </span>
              <div>
                <h3>{i.title}</h3>
                <p className="muted small">
                  {i.customerName} · {i.providerName}
                </p>
              </div>
              <span
                className={`status-pill ${i.status === "open" ? "status-disputed" : "status-completed"}`}
              >
                {i.status === "open" ? "Нужно решение" : "Решение принято"}
              </span>
              <ArrowUpRight size={19} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="Всё спокойно" description="Открытых споров нет." />
      )}
    </div>
  );
}

export function OrderPage({ requireLogin }: { requireLogin: () => void }) {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["order", id, user?.id],
    queryFn: () => api<OrderDetail>(`/orders/${id}`),
    enabled: !!user,
    refetchInterval: 15000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const status = useMutation({
    mutationFn: (newStatus: OrderStatus) =>
      api(`/orders/${id}/status`, {
        method: "PATCH",
        body: json({ status: newStatus }),
      }),
    onSuccess: () => {
      refresh();
      toast("Статус заказа обновлён");
    },
  });
  const send = useMutation({
    mutationFn: () =>
      api(`/orders/${id}/messages`, {
        method: "POST",
        body: json({ text: message }),
      }),
    onSuccess: () => {
      setMessage("");
      refresh();
    },
  });
  if (loading)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (!user)
    return (
      <div className="page-shell">
        <LoginRequired onLogin={requireLogin} />
      </div>
    );
  if (isPending)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell">
        <ErrorState error={error} retry={refetch} />
      </div>
    );
  const { order, events, messages, incident } = data;
  const owner = order.customerId === user.id;
  const provider = order.providerId === user.id;
  const next: Partial<
    Record<OrderStatus, { status: OrderStatus; label: string }>
  > =
    order.kind === "delivery"
      ? {
          confirmed: { status: "in_progress", label: "Принять в работу" },
          in_progress: { status: "in_transit", label: "Посылка отправлена" },
          in_transit: { status: "arrived", label: "Прибыло в пункт выдачи" },
          arrived: { status: "completed", label: "Подтвердить получение" },
        }
      : {
          confirmed: { status: "in_progress", label: "Начать работу" },
          in_progress: { status: "completed", label: "Подтвердить выполнение" },
        };
  const action = next[order.status];
  const canUpdate =
    action && (action.status === "completed" ? owner : provider);
  return (
    <div className="page-shell">
      <Link className="back-link" to="/dashboard">
        <ArrowLeft size={16} />
        Мои дела
      </Link>
      <div className="page-heading">
        <span className="section-kicker">
          ЗАКАЗ #{order.id.slice(0, 8).toUpperCase()}
        </span>
        <h1 className="order-title">{order.title}</h1>
        <div className="detail-meta">
          <span className={`status-pill status-${order.status}`}>
            {STATUS_LABELS[order.status]}
          </span>
          <span>
            <MapPin size={15} />
            {order.city}
          </span>
          <span>Обновлён {date(order.updatedAt)}</span>
        </div>
      </div>
      <div className="detail-layout">
        <div>
          <section className="content-card">
            <div className="card-section-header">
              <h2>
                {order.kind === "delivery"
                  ? "Путь вашей посылки"
                  : "История заказа"}
              </h2>
              {order.kind === "delivery" && (
                <Truck size={23} className="muted" />
              )}
            </div>
            <div className="timeline">
              {events.map((event, i) => (
                <div
                  className={`timeline-item ${i === events.length - 1 ? "current" : ""}`}
                  key={event.id}
                >
                  <span className="timeline-marker">
                    {i === events.length - 1 ? <span /> : <Check size={12} />}
                  </span>
                  <div>
                    <span className="muted small">{date(event.createdAt)}</span>
                    <h3>{STATUS_LABELS[event.status]}</h3>
                    <p>{event.note}</p>
                  </div>
                </div>
              ))}
            </div>
            {canUpdate && (
              <button
                className="button primary"
                disabled={status.isPending}
                onClick={() => status.mutate(action.status)}
              >
                {status.isPending ? "Сохраняем…" : action.label}
                <Check size={17} />
              </button>
            )}
            <FormError message={status.error?.message} />
          </section>
          {incident && (
            <section className="content-card incident-card">
              <span
                className={`status-pill ${incident.status === "open" ? "status-disputed" : "green-pill"}`}
              >
                <ShieldCheck size={13} />
                {incident.status === "open"
                  ? "Арбитр разбирается"
                  : "Решение принято"}
              </span>
              <h2>Проблема с заказом</h2>
              <p className="preserve-lines">{incident.description}</p>
              {incident.evidence && (
                <a
                  className="evidence-link"
                  href={`/api/incidents/${incident.id}/evidence`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileImage size={17} />
                  Фото к претензии
                  <ExternalLink size={13} />
                </a>
              )}
              {incident.status === "closed" && (
                <div className="resolution">
                  <strong>
                    {incident.decision === "refund"
                      ? "Полный возврат"
                      : incident.decision === "partial"
                        ? "Частичный возврат"
                        : "Жалоба отклонена"}
                  </strong>
                  <p>{incident.resolution}</p>
                  <span>Сумма возврата: {euro(incident.refundAmount)}</span>
                  <small>Возврат выполняется сторонами напрямую.</small>
                </div>
              )}
              {user.role === "arbiter" && incident.status === "open" && (
                <ResolveForm
                  incident={incident}
                  price={order.price}
                  onSuccess={refresh}
                />
              )}
            </section>
          )}
          <section className="content-card">
            <div className="card-section-header">
              <h2>Диалог по заказу</h2>
              <MessageCircle size={21} className="muted" />
            </div>
            <p className="muted small">
              Договорённости сохраняются здесь. При споре их увидит арбитр.
            </p>
            <div
              className="messages"
              role="log"
              aria-label="Сообщения по заказу"
            >
              {messages.length ? (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`message ${m.authorId === user.id ? "own" : ""}`}
                  >
                    <strong>{m.authorName}</strong>
                    <p>{m.text}</p>
                    <small>{date(m.createdAt)}</small>
                  </div>
                ))
              ) : (
                <div className="conversation-empty">
                  <MessageCircle size={28} />
                  <p>Поздоровайтесь и уточните детали.</p>
                </div>
              )}
            </div>
            <form
              className="message-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (message.trim()) send.mutate();
              }}
            >
              <input
                aria-label="Сообщение"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                required
                placeholder="Напишите сообщение…"
              />
              <button
                className="button primary"
                aria-label="Отправить сообщение"
                disabled={send.isPending || !message.trim()}
              >
                <Send size={17} />
              </button>
            </form>
            <FormError message={send.error?.message} />
          </section>
        </div>
        <aside className="sticky-aside">
          <section className="content-card">
            <span className="section-kicker">СОГЛАСОВАННАЯ СТОИМОСТЬ</span>
            <div className="big-price">{euro(order.price)}</div>
            <div className="payment-note">
              <Handshake size={18} />
              <span>Наличными при личной встрече</span>
            </div>
            <div className="price-divider" />
            <h3>Ваши контакты</h3>
            <div className="contact-block">
              <span className="mini-avatar">{order.providerName[0]}</span>
              <div>
                <strong>{order.providerName}</strong>
                <span>Исполнитель</span>
                <p>{order.providerContact}</p>
              </div>
            </div>
            <div className="contact-block">
              <span className="mini-avatar">{order.customerName[0]}</span>
              <div>
                <strong>{order.customerName}</strong>
                <span>Заказчик</span>
                <p>{order.customerContact}</p>
              </div>
            </div>
            {owner &&
              !incident &&
              !["resolved", "disputed"].includes(order.status) && (
                <button
                  className="button danger-outline full"
                  onClick={() => setIncidentOpen(true)}
                >
                  <CircleAlert size={16} />
                  Проблема с заказом
                </button>
              )}
            <p className="muted small">
              Контакты видны только участникам заказа и арбитру.
            </p>
          </section>
          <div className="aside-care">
            <ShieldCheck size={23} />
            <p>Если что-то пошло не так, мы поможем разобраться.</p>
          </div>
        </aside>
      </div>
      {incidentOpen && (
        <IncidentModal
          orderId={order.id}
          onClose={() => setIncidentOpen(false)}
          onSuccess={() => {
            setIncidentOpen(false);
            refresh();
            toast("Спор открыт. Арбитр и исполнитель получили уведомления.");
          }}
        />
      )}
    </div>
  );
}

function IncidentModal({
  orderId,
  onClose,
  onSuccess,
}: {
  orderId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const mutation = useMutation({
    mutationFn: (body: FormData) =>
      api(`/orders/${orderId}/incident`, { method: "POST", body }),
    onSuccess,
  });
  return (
    <Modal title="Поможем разобраться" onClose={onClose}>
      <p className="modal-description">
        Опишите, что произошло. Исполнитель и арбитр получат уведомление, а
        заказ перейдёт в статус «Открыт спор».
      </p>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(new FormData(e.currentTarget));
        }}
      >
        <Field label="Что пошло не так">
          <textarea
            name="description"
            required
            minLength={15}
            maxLength={5000}
            rows={5}
            placeholder="Что ожидали получить, что получили, как хотели бы решить вопрос…"
          />
        </Field>
        <Field
          label="Фото, если есть"
          hint="JPG, PNG или WebP, до 5 МБ. Видно только участникам и арбитру."
        >
          <input
            name="evidence"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </Field>
        <FormError message={mutation.error?.message} />
        <button className="button primary full" disabled={mutation.isPending}>
          {mutation.isPending ? "Отправляем…" : "Открыть спор"}
          <ShieldCheck size={17} />
        </button>
      </form>
    </Modal>
  );
}

function ResolveForm({
  incident,
  price,
  onSuccess,
}: {
  incident: Incident;
  price: number;
  onSuccess: () => void;
}) {
  const [decision, setDecision] = useState("refund");
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (f: FormData) =>
      api(`/incidents/${incident.id}/resolve`, {
        method: "POST",
        body: json({
          ...Object.fromEntries(f),
          decision,
          refundAmount:
            decision === "refund"
              ? price
              : decision === "rejected"
                ? 0
                : Number(f.get("refundAmount")),
        }),
      }),
    onSuccess: () => {
      onSuccess();
      toast("Решение зафиксировано, стороны уведомлены.");
    },
  });
  return (
    <form
      className="form-stack resolve-form"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(new FormData(e.currentTarget));
      }}
    >
      <h3>Решение арбитра</h3>
      <Field label="Результат">
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="refund">Полный возврат</option>
          <option value="partial">Частичный возврат</option>
          <option value="rejected">Отклонить жалобу</option>
        </select>
      </Field>
      {decision === "partial" && (
        <Field label="Сумма возврата, €">
          <input
            name="refundAmount"
            type="number"
            min={0.01}
            max={price - 0.01}
            step="0.01"
            required
          />
        </Field>
      )}
      <Field label="Комментарий к решению">
        <textarea
          name="resolution"
          minLength={15}
          maxLength={3000}
          rows={3}
          required
          placeholder="На основании чего принято решение и что должны сделать стороны…"
        />
      </Field>
      <Field label="Ответственная сторона">
        <select name="guilty">
          <option value="none">Рейтинг не меняется</option>
          <option value="provider">Исполнитель · рейтинг −0,2</option>
          <option value="customer">Заказчик · рейтинг −0,2</option>
        </select>
      </Field>
      <p className="muted small">
        Решение закрывает спор. Перевод средств стороны выполняют
        самостоятельно.
      </p>
      <FormError message={mutation.error?.message} />
      <button className="button dark" disabled={mutation.isPending}>
        Зафиксировать решение
        <CheckCheck size={17} />
      </button>
    </form>
  );
}
