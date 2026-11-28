import { useUiText } from "./lib";
import { useState, type ReactNode } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CircleAlert,
  Heart,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCog,
  Truck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import {
  STATUS_LABELS,
  isMarketplaceUser,
  type Incident,
  type Listing,
  type Order,
  type ServiceRequest,
  type User,
} from "../shared/types";
import { api, date, euro, plural, useAuth, useI18n } from "./lib";
import { Empty, ErrorState, ListingCard, Loading } from "./components/ui";
import { RequestCard } from "./pages";
import type { CreateAction } from "./App";
import { OrderProgress } from "./components/OrderProgress";
import { getOrderAction } from "./order-state";
import { BrandSpark } from "./components/BrandIllustration";
import { cityName, orderHelpPath } from "./market-copy";
import { ProfileEditor } from "./components/ProfileEditor";

type WorkspaceData = {
  orders: Order[];
  requests: ServiceRequest[];
  listings: Listing[];
  incidents: Incident[];
};
function useWorkspace(user?: User | null) {
  return useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: () => api<WorkspaceData>("/dashboard"),
    enabled: !!user,
    refetchInterval: 30000,
  });
}
const active = (order: Order) =>
  !["completed", "resolved"].includes(order.status);
const newest = (a: Order, b: Order) => b.createdAt.localeCompare(a.createdAt);
const roleNames = {
  customer: "Участник Blizu",
  provider: "Участник Blizu",
  arbiter: "Арбитр",
};

function AccountRequired({ onLogin }: { onLogin: () => void }) {
  const tr = useUiText();
  return (
    <div className="page-shell refined-page">
      <Empty
        title={tr("Ваши дела — в одном месте")}
        description={tr(
          "Войдите, чтобы видеть свои заявки, заказы и переписку.",
        )}
      >
        <button className="button primary" onClick={onLogin}>
          <UserRound size={17} />
          {tr("Войти в аккаунт")}
        </button>
      </Empty>
    </div>
  );
}
export function WorkspaceFrame({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const tr = useUiText();
  const { language } = useI18n();
  return (
    <div className="page-shell workspace-page refined-page">
      <div className="page-breadcrumb">
        <Link to="/">{tr("Главная")}</Link>
        <span>/</span>
        <span>{tr("Личное пространство")}</span>
      </div>
      <div className="workspace-layout">
        <aside className="workspace-sidebar glass-panel">
          <div className="profile-summary">
            <span className="profile-monogram">
              {user.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </span>
            <strong>{user.name}</strong>
            <span className="profile-role">
              {tr(roleNames[user.role])}
              {user.isOperator && tr(" · Оператор")}
              {user.verified && (
                <BadgeCheck size={15} aria-label={tr("Профиль с отметкой")} />
              )}
            </span>
          </div>
          <nav className="workspace-nav" aria-label={tr("Личное пространство")}>
            <NavLink to="/dashboard" end>
              <LayoutDashboard size={18} />
              {tr("Обзор")}
              <ArrowUpRight size={14} />
            </NavLink>
            <NavLink to="/orders">
              <Package size={18} />
              {tr("Мои заказы")}
              <ArrowUpRight size={14} />
            </NavLink>
            <NavLink to="/favorites">
              <Heart size={18} />
              {tr("Избранное")}
              <ArrowUpRight size={14} />
            </NavLink>
            <NavLink to="/dashboard/profile">
              <UserRoundCog size={18} />
              {tr("Профиль")}
              <ArrowUpRight size={14} />
            </NavLink>
            <NavLink to="/dashboard/messages">
              <MessageCircle size={18} />
              {tr("Сообщения")}
              <ArrowUpRight size={14} />
            </NavLink>
            {user.isOperator && (
              <NavLink to="/operator">
                <ShieldCheck size={18} />
                {tr("Оператор")}
                <ArrowUpRight size={14} />
              </NavLink>
            )}
          </nav>
          <div className="profile-details">
            <span>
              <MapPin size={14} />
              {cityName(user.city, language)}
            </span>
            <span className="profile-rating">
              <ShieldCheck size={14} />
              {tr("Рейтинг")} {user.rating.toFixed(1)}
            </span>
          </div>
        </aside>
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
export function ProfilePage({ requireLogin }: { requireLogin: () => void }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <AccountRequired onLogin={requireLogin} />;
  return (
    <WorkspaceFrame user={user}>
      <ProfileEditor key={user.id} user={user} />
    </WorkspaceFrame>
  );
}
function OrderRow({ order, user }: { order: Order; user: User }) {
  const tr = useUiText();
  const { language } = useI18n();
  const action = getOrderAction(order, user.id);
  const person =
    user.role === "arbiter"
      ? `${order.customerName} · ${order.providerName}`
      : order.customerId === user.id
        ? order.providerName
        : order.customerName;
  return (
    <li>
      <Link className="workspace-order-row" to={`/orders/${order.id}`}>
        <span
          className={`workspace-order-icon ${order.kind === "delivery" ? "is-delivery" : ""}`}
        >
          {order.kind === "delivery" ? (
            <Truck size={22} strokeWidth={1.5} />
          ) : (
            <Wrench size={21} strokeWidth={1.5} />
          )}
        </span>
        <div className="workspace-order-main">
          <span className="order-row-meta">
            {order.kind === "delivery" ? tr("Доставка") : tr("Услуга")}
            <span>·</span>
            {cityName(order.city, language)}
          </span>
          <h3>{order.title}</h3>
          <span className="order-row-person">{person}</span>
          {action?.status === "completed" && (
            <span className="order-row-next">
              {tr(action.label)}
              <ArrowRight size={12} />
            </span>
          )}
        </div>
        <div className="workspace-order-state">
          <span className={`status-pill status-${order.status}`}>
            {tr(STATUS_LABELS[order.status])}
          </span>
          <OrderProgress order={order} compact />
          <small>
            {tr("Обновлён")}{" "}
            <time dateTime={order.updatedAt}>{date(order.updatedAt)}</time>
          </small>
        </div>
        <div className="workspace-order-price">
          <strong>{euro(order.price)}</strong>
          <span>
            {tr("Заказ от")} {date(order.createdAt)}
          </span>
        </div>
        <ArrowUpRight className="order-open-arrow" size={18} />
      </Link>
    </li>
  );
}
function WorkspaceAttention({
  data,
  user,
}: {
  data: WorkspaceData;
  user: User;
}) {
  const tr = useUiText();
  const items = [
    ...data.orders.flatMap((order) => {
      const action = getOrderAction(order, user.id);
      if (
        !action ||
        (order.status !== "confirmed" && action.status !== "completed")
      )
        return [];
      return [
        {
          id: `order-${order.id}`,
          href: `/orders/${order.id}`,
          title: tr(action.label),
          description: order.title,
          icon: Package,
        },
      ];
    }),
    ...data.requests
      .filter((item) => item.status === "open" && item.offerCount > 0)
      .map((item) => ({
        id: `request-${item.id}`,
        href: `/requests/${item.id}`,
        title: tr(
          "Сравнить {0} {1}",
          item.offerCount,
          tr(plural(item.offerCount, ["отклик", "отклика", "откликов"])),
        ),
        description: item.title,
        icon: MessageCircle,
      })),
    ...(user.role === "arbiter"
      ? data.incidents
          .filter((item) => item.status === "open")
          .map((item) => ({
            id: `incident-${item.id}`,
            href: `/orders/${item.orderId}`,
            title: tr("Рассмотреть спор"),
            description: item.title,
            icon: ShieldCheck,
          }))
      : []),
  ];
  if (!items.length) return null;
  return (
    <section className="workspace-attention" aria-labelledby="attention-title">
      <div className="attention-heading">
        <span className="attention-spark" aria-hidden="true">
          <BrandSpark />
        </span>
        <h2 id="attention-title">{tr("С чего продолжить")}</h2>
        <span>{tr("Ближайшие действия")}</span>
      </div>
      <ul>
        {items
          .slice(0, 3)
          .map(({ id, href, title, description, icon: Icon }) => (
            <li key={id}>
              <Link to={href}>
                <span className="attention-item-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
                <ArrowRight size={17} />
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}
function OrderRows({ orders, user }: { orders: Order[]; user: User }) {
  const tr = useUiText();
  return (
    <ul className="workspace-order-list" aria-label={tr("Список заказов")}>
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} user={user} />
      ))}
    </ul>
  );
}

export function DashboardPage({
  create,
  requireLogin,
  deliveryEnabled,
}: {
  create: CreateAction;
  requireLogin: () => void;
  deliveryEnabled: boolean;
}) {
  const tr = useUiText();
  const { user, loading } = useAuth();
  const query = useWorkspace(user);
  const [params, setParams] = useSearchParams();
  const available = [
    "overview",
    "requests",
    ...(isMarketplaceUser(user?.role) ? ["listings"] : []),
    ...(user?.role === "arbiter" ? ["incidents"] : []),
  ];
  const tab = available.includes(params.get("tab") || "")
    ? params.get("tab")!
    : "overview";
  if (loading)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (!user) return <AccountRequired onLogin={requireLogin} />;
  const { data, isPending, error, refetch } = query;
  const tabs = [
    { id: "overview", label: tr("Обзор") },
    { id: "requests", label: tr("Мои заявки"), count: data?.requests.length },
    ...(isMarketplaceUser(user.role)
      ? [
          {
            id: "listings",
            label: tr("Предложения"),
            count: data?.listings.length,
          },
        ]
      : []),
    ...(user.role === "arbiter"
      ? [
          {
            id: "incidents",
            label: tr("Споры"),
            count: data?.incidents.filter((i) => i.status === "open").length,
          },
        ]
      : []),
  ];
  return (
    <WorkspaceFrame user={user}>
      <div className="workspace-heading">
        <div>
          <span className="section-kicker">
            {tr("ВАШ ДЕНЬ СТАЛ ЧУТЬ ПРОЩЕ")}
          </span>
          <h1>
            {user.role === "arbiter" ? (
              tr("Помогаем договориться")
            ) : (
              <>
                {tr("Здравствуйте,")} <em>{user.name.split(" ")[0]}.</em>
              </>
            )}
          </h1>
          <p>
            {user.role === "arbiter"
              ? tr("История договорённостей и споры, которым нужно решение.")
              : tr("Всё, о чём договорились. Всё, что ещё впереди.")}
          </p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            create(user.role === "provider" ? "listing" : "request")
          }
        >
          <Plus size={17} />
          {user.role === "provider"
            ? tr("Добавить предложение")
            : tr("Новая заявка")}
        </button>
      </div>
      <nav
        className="workspace-tabs dashboard-tabs"
        aria-label={tr("Разделы кабинета")}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            aria-pressed={tab === item.id}
            onClick={() =>
              setParams(item.id === "overview" ? {} : { tab: item.id }, {
                preventScrollReset: true,
              })
            }
          >
            {item.label}
            {item.count !== undefined && <span>{item.count}</span>}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <Link
          className="workspace-profile-link glass-panel"
          to="/dashboard/profile"
        >
          <span className="workspace-profile-link-icon">
            <UserRoundCog size={20} />
          </span>
          <span>
            <strong>{tr("Профиль и контакты")}</strong>
            <small>{tr("Имя, город, Viber и Telegram")}</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      )}
      {isPending ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} retry={refetch} />
      ) : tab === "overview" ? (
        <>
          <div className="workspace-metrics">
            <Link to="/orders?phase=active">
              <span>
                <Package size={17} />
                {tr("Активные заказы")}
                <ArrowUpRight size={15} />
              </span>
              <strong>
                {data.orders.filter(active).length.toString().padStart(2, "0")}
              </strong>
              <small>{tr("Статусы и переписка")}</small>
            </Link>
            <button
              onClick={() =>
                setParams({ tab: "requests" }, { preventScrollReset: true })
              }
            >
              <span>
                <MessageCircle size={17} />
                {tr("Открытые заявки")}
                <ArrowUpRight size={15} />
              </span>
              <strong>
                {data.requests
                  .filter((r) => r.status === "open")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
              <small>{tr("Здесь приходят отклики")}</small>
            </button>
            <Link
              to={
                user.role === "arbiter"
                  ? "/dashboard?tab=incidents"
                  : "/orders?phase=completed"
              }
            >
              <span>
                {user.role === "arbiter" ? (
                  <CircleAlert size={17} />
                ) : (
                  <Check size={17} />
                )}
                {user.role === "arbiter"
                  ? tr("Открытые споры")
                  : tr("Завершённые заказы")}
                <ArrowUpRight size={15} />
              </span>
              <strong>
                {(user.role === "arbiter"
                  ? data.incidents.filter((i) => i.status === "open").length
                  : data.orders.filter((o) => !active(o)).length
                )
                  .toString()
                  .padStart(2, "0")}
              </strong>
              <small>
                {user.role === "arbiter"
                  ? tr("Требуют вашего решения")
                  : tr("Вся история сохранена")}
              </small>
            </Link>
          </div>
          <WorkspaceAttention data={data} user={user} />
          <section className="workspace-recent">
            <div className="refined-section-heading">
              <div>
                <span className="section-kicker">{tr("ПОД РУКОЙ")}</span>
                <h2>{tr("Последние заказы")}</h2>
              </div>
              <Link className="quiet-link" to="/orders">
                {tr("Все заказы")}
                <ArrowUpRight size={15} />
              </Link>
            </div>
            {data.orders.length ? (
              <OrderRows
                user={user}
                orders={[...data.orders].sort(newest).slice(0, 3)}
              />
            ) : (
              <Empty
                illustration="orders"
                title={tr("Начнём с хорошего дела?")}
                description={tr(
                  "Создайте заявку и выберите подходящий отклик. Здесь появится ваш первый заказ.",
                )}
              >
                <button
                  className="button secondary"
                  onClick={() => create("request")}
                >
                  {tr("Создать заявку")}
                  <ArrowRight size={16} />
                </button>
              </Empty>
            )}
          </section>
          <div className="workspace-shortcuts">
            <Link to={deliveryEnabled ? "/delivery" : orderHelpPath}>
              <span className="shortcut-icon">
                <Truck size={24} strokeWidth={1.3} />
              </span>
              <div>
                <h3>
                  {deliveryEnabled
                    ? tr("Что-то важное издалека?")
                    : tr("Помощь с заказами")}
                </h3>
                <p>
                  {deliveryEnabled
                    ? tr("Найдите логиста для вашей покупки.")
                    : tr("Найдите помощь с оформлением покупки.")}
                </p>
              </div>
              <ArrowUpRight size={19} />
            </Link>
            <Link to="/">
              <span className="shortcut-icon">
                <Search size={24} strokeWidth={1.3} />
              </span>
              <div>
                <h3>{tr("Хорошие люди рядом")}</h3>
                <p>{tr("Услуги и полезные находки в вашем городе.")}</p>
              </div>
              <ArrowUpRight size={19} />
            </Link>
          </div>
        </>
      ) : tab === "requests" ? (
        <section
          key={tab}
          className="workspace-collection"
          aria-label={tr("Мои заявки")}
        >
          <div className="collection-heading">
            <h2>{tr("Ваши задачи")}</h2>
            <p>
              {tr(
                "Откройте заявку, чтобы сравнить отклики и выбрать исполнителя.",
              )}
            </p>
          </div>
          {data.requests.length ? (
            <div className="request-list">
              {data.requests.map((r) => (
                <RequestCard key={r.id} item={r} showStatus />
              ))}
            </div>
          ) : (
            <Empty
              illustration="conversation"
              title={tr("Пока без забот")}
              description={tr(
                "Нужна помощь? Расскажите о задаче — исполнители предложат свои условия.",
              )}
            >
              <button
                className="button primary"
                onClick={() => create("request")}
              >
                {tr("Создать заявку")}
              </button>
            </Empty>
          )}
        </section>
      ) : tab === "listings" ? (
        <section
          key={tab}
          className="workspace-collection"
          aria-label={tr("Мои предложения")}
        >
          <div className="collection-heading">
            <h2>{tr("Ваши предложения")}</h2>
            <p>{tr("Услуги и товары, которые люди могут найти в каталоге.")}</p>
          </div>
          {data.listings.length ? (
            <div className="listing-grid workspace-listings">
              {data.listings.map((item) => (
                <ListingCard key={item.id} listing={item} />
              ))}
            </div>
          ) : (
            <Empty title={tr("Покажите, чем можете помочь")}>
              <button
                className="button primary"
                onClick={() => create("listing")}
              >
                {tr("Добавить предложение")}
              </button>
            </Empty>
          )}
        </section>
      ) : (
        <section
          key={tab}
          className="workspace-collection"
          aria-label={tr("Споры")}
        >
          <div className="collection-heading">
            <h2>{tr("Помогаем найти решение")}</h2>
            <p>
              {tr(
                "Переписка, история заказа и материалы сторон — внутри каждого спора.",
              )}
            </p>
          </div>
          {data.incidents.length ? (
            <ul className="workspace-incident-list">
              {data.incidents.map((i) => (
                <li key={i.id}>
                  <Link to={`/orders/${i.orderId}`}>
                    <CircleAlert size={22} />
                    <div>
                      <h3>{i.title}</h3>
                      <p>
                        {i.customerName} · {i.providerName}
                      </p>
                    </div>
                    <span
                      className={`status-pill ${i.status === "open" ? "status-disputed" : "status-completed"}`}
                    >
                      {i.status === "open"
                        ? tr("Нужно решение")
                        : tr("Решение принято")}
                    </span>
                    <ArrowUpRight size={17} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title={tr("Всё спокойно")}
              description={tr("Открытых споров нет.")}
              illustration="conversation"
            />
          )}
        </section>
      )}
    </WorkspaceFrame>
  );
}

export function OrdersPage({
  create,
  requireLogin,
}: {
  create: CreateAction;
  requireLogin: () => void;
}) {
  const tr = useUiText();
  const { user, loading } = useAuth();
  const { data, isPending, error, refetch } = useWorkspace(user);
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = (params.get("q") || "").slice(0, 200);
  const phase = ["active", "completed", "disputed"].includes(
    params.get("phase") || "",
  )
    ? params.get("phase")!
    : "all";
  const kind = ["service", "delivery"].includes(params.get("kind") || "")
    ? params.get("kind")!
    : "all";
  const sort = ["price", "price_desc"].includes(params.get("sort") || "")
    ? params.get("sort")!
    : "newest";
  function update(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        value && value !== "all" && value !== "newest"
          ? next.set(key, value)
          : next.delete(key);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }
  if (loading)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (!user) return <AccountRequired onLogin={requireLogin} />;
  const orders = data?.orders || [];
  const filtered = orders
    .filter(
      (o) =>
        (phase === "all" ||
          (phase === "active" && active(o)) ||
          (phase === "completed" && !active(o)) ||
          (phase === "disputed" && o.status === "disputed")) &&
        (kind === "all" || o.kind === kind) &&
        [o.title, o.customerName, o.providerName, o.city]
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(search.trim().toLocaleLowerCase("ru")),
    )
    .sort(
      sort === "price"
        ? (a, b) => a.price - b.price
        : sort === "price_desc"
          ? (a, b) => b.price - a.price
          : newest,
    );
  const phases = [
    { id: "all", label: tr("Все"), count: orders.length },
    {
      id: "active",
      label: tr("Активные"),
      count: orders.filter(active).length,
    },
    {
      id: "completed",
      label: tr("Завершённые"),
      count: orders.filter((o) => !active(o)).length,
    },
    {
      id: "disputed",
      label: tr("Споры"),
      count: orders.filter((o) => o.status === "disputed").length,
    },
  ];
  const hasFilters =
    !!search || phase !== "all" || kind !== "all" || sort !== "newest";
  return (
    <WorkspaceFrame user={user}>
      <div className="workspace-heading orders-heading">
        <div>
          <span className="section-kicker">
            {tr("ДОГОВОРИЛИСЬ. СОХРАНИЛИ. СДЕЛАЛИ.")}
          </span>
          <h1>
            {tr("Мои")} <em>{tr("заказы.")}</em>
          </h1>
          <p>{tr("Услуги, доставки и все договорённости — перед глазами.")}</p>
        </div>
        <button className="button primary" onClick={() => create("request")}>
          <Plus size={17} />
          {tr("Новая заявка")}
        </button>
      </div>
      {isPending ? (
        <Loading />
      ) : error || !data ? (
        <ErrorState error={error} retry={refetch} />
      ) : (
        <>
          <div
            className="workspace-tabs order-phase-tabs"
            role="group"
            aria-label={tr("Состояние заказов")}
          >
            {phases.map((item) => (
              <button
                key={item.id}
                aria-pressed={phase === item.id}
                onClick={() => update("phase", item.id)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
          <div className="orders-toolbar glass-panel">
            <label className="orders-search">
              <Search size={18} />
              <span className="visually-hidden">{tr("Поиск по заказам")}</span>
              <input
                type="search"
                placeholder={tr("Название, человек или город")}
                maxLength={200}
                value={search}
                onChange={(e) => update("q", e.target.value)}
              />
              {search && (
                <button
                  aria-label={tr("Очистить поиск заказов")}
                  onClick={() => update("q", "")}
                >
                  <X size={16} />
                </button>
              )}
            </label>
            <button
              className="button secondary orders-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="order-filter-options"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal size={16} />
              {tr("Фильтры")}
              {kind !== "all" && <span className="filter-indicator" />}
            </button>
            <div
              id="order-filter-options"
              className={`orders-filter-options ${filtersOpen ? "is-open" : ""}`}
            >
              <label>
                <span className="visually-hidden">{tr("Тип заказа")}</span>
                <select
                  aria-label={tr("Тип заказа")}
                  value={kind}
                  onChange={(e) => update("kind", e.target.value)}
                >
                  <option value="all">{tr("Все типы")}</option>
                  <option value="service">{tr("Услуги")}</option>
                  <option value="delivery">{tr("Доставки")}</option>
                </select>
              </label>
              <label>
                <span className="visually-hidden">
                  {tr("Сортировка заказов")}
                </span>
                <select
                  aria-label={tr("Сортировка заказов")}
                  value={sort}
                  onChange={(e) => update("sort", e.target.value)}
                >
                  <option value="newest">{tr("Сначала новые")}</option>
                  <option value="price">{tr("Сначала дешевле")}</option>
                  <option value="price_desc">{tr("Сначала дороже")}</option>
                </select>
              </label>
            </div>
          </div>
          <div className="orders-result-summary">
            <span role="status">
              {filtered.length}{" "}
              {plural(filtered.length, [
                tr("заказ"),
                tr("заказа"),
                tr("заказов"),
              ])}
              {kind === "delivery"
                ? tr(" · Доставки")
                : kind === "service"
                  ? tr(" · Услуги")
                  : ""}
            </span>
            {hasFilters && (
              <button
                onClick={() => setParams({}, { preventScrollReset: true })}
              >
                {tr("Сбросить фильтры")}
                <X size={13} />
              </button>
            )}
          </div>
          {filtered.length ? (
            <OrderRows orders={filtered} user={user} />
          ) : orders.length ? (
            <Empty
              title={tr("Таких заказов пока нет")}
              description={tr(
                "Попробуйте другое название, город или сочетание фильтров.",
              )}
            >
              <button
                className="button secondary"
                onClick={() => setParams({}, { preventScrollReset: true })}
              >
                {tr("Показать все заказы")}
              </button>
            </Empty>
          ) : (
            <Empty
              title={tr("Здесь начнутся хорошие дела")}
              illustration="orders"
              description={tr(
                "Выберите отклик на свою заявку — заказ появится здесь вместе с перепиской и историей статусов.",
              )}
            >
              <button
                className="button primary"
                onClick={() => create("request")}
              >
                {tr("Создать первую заявку")}
                <ArrowRight size={16} />
              </button>
            </Empty>
          )}
          <p className="orders-footnote">
            <ShieldCheck size={15} />
            {tr(
              "Все условия, сообщения и изменения статуса сохраняются внутри заказа.",
            )}
          </p>
        </>
      )}
    </WorkspaceFrame>
  );
}
