import { useState, type ReactNode } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
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
  Truck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import {
  STATUS_LABELS,
  type Incident,
  type Listing,
  type Order,
  type ServiceRequest,
  type User,
} from "../shared/types";
import { api, date, euro, plural, useAuth } from "./lib";
import { Empty, ErrorState, ListingCard, Loading } from "./components/ui";
import { RequestCard } from "./pages";
import type { CreateAction } from "./App";
import { OrderProgress } from "./components/OrderProgress";
import { getOrderAction } from "./order-state";
import { BrandSpark } from "./components/BrandIllustration";

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
  customer: "Заказчик",
  provider: "Исполнитель",
  arbiter: "Арбитр",
};

function AccountRequired({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="page-shell refined-page">
      <Empty
        title="Ваши дела — в одном месте"
        description="Войдите, чтобы видеть свои заявки, заказы и переписку."
      >
        <button className="button primary" onClick={onLogin}>
          <UserRound size={17} />
          Войти в аккаунт
        </button>
      </Empty>
    </div>
  );
}
function WorkspaceFrame({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <div className="page-shell workspace-page refined-page">
      <div className="page-breadcrumb">
        <Link to="/">Главная</Link>
        <span>/</span>
        <span>Личное пространство</span>
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
              {roleNames[user.role]}
              {user.isOperator && " · Оператор"}
              {user.verified && (
                <BadgeCheck size={15} aria-label="Профиль с отметкой" />
              )}
            </span>
          </div>
          <nav className="workspace-nav" aria-label="Личное пространство">
            <NavLink to="/dashboard">
              <LayoutDashboard size={18} />
              Обзор
              <ArrowUpRight size={14} />
            </NavLink>
            <NavLink to="/orders">
              <Package size={18} />
              Мои заказы
              <ArrowUpRight size={14} />
            </NavLink>
            <NavLink to="/favorites">
              <Heart size={18} />
              Избранное
              <ArrowUpRight size={14} />
            </NavLink>
            {user.isOperator && (
              <NavLink to="/operator">
                <ShieldCheck size={18} />
                Оператор
                <ArrowUpRight size={14} />
              </NavLink>
            )}
          </nav>
          <button
            className="profile-details-toggle"
            aria-expanded={profileOpen}
            aria-controls="workspace-profile-details"
            onClick={() => setProfileOpen((v) => !v)}
          >
            Данные профиля
            <ChevronDown size={14} />
          </button>
          <div
            className={`profile-details${profileOpen ? " is-expanded" : ""}`}
            id="workspace-profile-details"
          >
            <span className="tiny-label">ВАШ ПРОФИЛЬ</span>
            <span>
              <MapPin size={14} />
              {user.city}
            </span>
            <span className="profile-contact">{user.email}</span>
            {user.contact && (
              <span className="profile-contact">{user.contact}</span>
            )}
            <span className="profile-rating">
              <ShieldCheck size={14} />
              Рейтинг {user.rating.toFixed(1)}
            </span>
          </div>
          <div className="workspace-sidebar-note">
            <span className="sidebar-note-line" />
            <p>
              Меньше хлопот.
              <br />
              <em>Больше жизни.</em>
            </p>
            <span>blizu — рядом с вами</span>
          </div>
        </aside>
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
function OrderRow({ order, user }: { order: Order; user: User }) {
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
            {order.kind === "delivery" ? "Доставка" : "Услуга"}
            <span>·</span>
            {order.city}
          </span>
          <h3>{order.title}</h3>
          <span className="order-row-person">{person}</span>
          {action?.status === "completed" && (
            <span className="order-row-next">
              {action.label}
              <ArrowRight size={12} />
            </span>
          )}
        </div>
        <div className="workspace-order-state">
          <span className={`status-pill status-${order.status}`}>
            {STATUS_LABELS[order.status]}
          </span>
          <OrderProgress order={order} compact />
          <small>
            Обновлён{" "}
            <time dateTime={order.updatedAt}>{date(order.updatedAt)}</time>
          </small>
        </div>
        <div className="workspace-order-price">
          <strong>{euro(order.price)}</strong>
          <span>Заказ от {date(order.createdAt)}</span>
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
          title: action.label,
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
        title: `Сравнить ${item.offerCount} ${plural(item.offerCount, ["отклик", "отклика", "откликов"])}`,
        description: item.title,
        icon: MessageCircle,
      })),
    ...(user.role === "arbiter"
      ? data.incidents
          .filter((item) => item.status === "open")
          .map((item) => ({
            id: `incident-${item.id}`,
            href: `/orders/${item.orderId}`,
            title: "Рассмотреть спор",
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
        <h2 id="attention-title">С чего продолжить</h2>
        <span>Ближайшие действия</span>
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
  return (
    <ul className="workspace-order-list" aria-label="Список заказов">
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} user={user} />
      ))}
    </ul>
  );
}

export function DashboardPage({
  create,
  requireLogin,
}: {
  create: CreateAction;
  requireLogin: () => void;
}) {
  const { user, loading } = useAuth();
  const query = useWorkspace(user);
  const [params, setParams] = useSearchParams();
  const available = [
    "overview",
    "requests",
    ...(user?.role === "provider" ? ["listings"] : []),
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
    { id: "overview", label: "Обзор" },
    { id: "requests", label: "Мои заявки", count: data?.requests.length },
    ...(user.role === "provider"
      ? [{ id: "listings", label: "Предложения", count: data?.listings.length }]
      : []),
    ...(user.role === "arbiter"
      ? [
          {
            id: "incidents",
            label: "Споры",
            count: data?.incidents.filter((i) => i.status === "open").length,
          },
        ]
      : []),
  ];
  return (
    <WorkspaceFrame user={user}>
      <div className="workspace-heading">
        <div>
          <span className="section-kicker">ВАШ ДЕНЬ СТАЛ ЧУТЬ ПРОЩЕ</span>
          <h1>
            {user.role === "arbiter" ? (
              "Помогаем договориться"
            ) : (
              <>
                Здравствуйте,
                <br />
                <em>{user.name.split(" ")[0]}.</em>
              </>
            )}
          </h1>
          <p>
            {user.role === "arbiter"
              ? "История договорённостей и споры, которым нужно решение."
              : "Всё, о чём договорились. Всё, что ещё впереди."}
          </p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            create(user.role === "provider" ? "listing" : "request")
          }
        >
          <Plus size={17} />
          {user.role === "provider" ? "Добавить предложение" : "Новая заявка"}
        </button>
      </div>
      <nav className="workspace-tabs" aria-label="Разделы кабинета">
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
                Активные заказы
                <ArrowUpRight size={15} />
              </span>
              <strong>
                {data.orders.filter(active).length.toString().padStart(2, "0")}
              </strong>
              <small>Статусы и переписка</small>
            </Link>
            <button
              onClick={() =>
                setParams({ tab: "requests" }, { preventScrollReset: true })
              }
            >
              <span>
                <MessageCircle size={17} />
                Открытые заявки
                <ArrowUpRight size={15} />
              </span>
              <strong>
                {data.requests
                  .filter((r) => r.status === "open")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
              <small>Здесь приходят отклики</small>
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
                  ? "Открытые споры"
                  : "Завершённые заказы"}
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
                  ? "Требуют вашего решения"
                  : "Вся история сохранена"}
              </small>
            </Link>
          </div>
          <WorkspaceAttention data={data} user={user} />
          <section className="workspace-recent">
            <div className="refined-section-heading">
              <div>
                <span className="section-kicker">ПОД РУКОЙ</span>
                <h2>Последние заказы</h2>
              </div>
              <Link className="quiet-link" to="/orders">
                Все заказы
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
                title="Начнём с хорошего дела?"
                description="Создайте заявку и выберите подходящий отклик. Здесь появится ваш первый заказ."
              >
                <button
                  className="button secondary"
                  onClick={() => create("request")}
                >
                  Создать заявку
                  <ArrowRight size={16} />
                </button>
              </Empty>
            )}
          </section>
          <div className="workspace-shortcuts">
            <Link to="/delivery">
              <span className="shortcut-icon">
                <Truck size={24} strokeWidth={1.3} />
              </span>
              <div>
                <h3>Что-то важное издалека?</h3>
                <p>Найдите логиста для вашей покупки.</p>
              </div>
              <ArrowUpRight size={19} />
            </Link>
            <Link to="/">
              <span className="shortcut-icon">
                <Search size={24} strokeWidth={1.3} />
              </span>
              <div>
                <h3>Хорошие люди рядом</h3>
                <p>Услуги и полезные находки в вашем городе.</p>
              </div>
              <ArrowUpRight size={19} />
            </Link>
          </div>
        </>
      ) : tab === "requests" ? (
        <section
          key={tab}
          className="workspace-collection"
          aria-label="Мои заявки"
        >
          <div className="collection-heading">
            <h2>Ваши задачи</h2>
            <p>
              Откройте заявку, чтобы сравнить отклики и выбрать исполнителя.
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
              title="Пока без забот"
              description="Нужна помощь? Расскажите о задаче — исполнители предложат свои условия."
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
      ) : tab === "listings" ? (
        <section
          key={tab}
          className="workspace-collection"
          aria-label="Мои предложения"
        >
          <div className="collection-heading">
            <h2>Ваши предложения</h2>
            <p>Услуги и товары, которые люди могут найти в каталоге.</p>
          </div>
          {data.listings.length ? (
            <div className="listing-grid workspace-listings">
              {data.listings.map((item) => (
                <ListingCard key={item.id} listing={item} />
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
          )}
        </section>
      ) : (
        <section key={tab} className="workspace-collection" aria-label="Споры">
          <div className="collection-heading">
            <h2>Помогаем найти решение</h2>
            <p>
              Переписка, история заказа и материалы сторон — внутри каждого
              спора.
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
                        ? "Нужно решение"
                        : "Решение принято"}
                    </span>
                    <ArrowUpRight size={17} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="Всё спокойно"
              description="Открытых споров нет."
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
    { id: "all", label: "Все", count: orders.length },
    { id: "active", label: "Активные", count: orders.filter(active).length },
    {
      id: "completed",
      label: "Завершённые",
      count: orders.filter((o) => !active(o)).length,
    },
    {
      id: "disputed",
      label: "Споры",
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
            ДОГОВОРИЛИСЬ. СОХРАНИЛИ. СДЕЛАЛИ.
          </span>
          <h1>
            Мои <em>заказы.</em>
          </h1>
          <p>Услуги, доставки и все договорённости — перед глазами.</p>
        </div>
        <button className="button primary" onClick={() => create("request")}>
          <Plus size={17} />
          Новая заявка
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
            aria-label="Состояние заказов"
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
              <span className="visually-hidden">Поиск по заказам</span>
              <input
                type="search"
                placeholder="Название, человек или город"
                maxLength={200}
                value={search}
                onChange={(e) => update("q", e.target.value)}
              />
              {search && (
                <button
                  aria-label="Очистить поиск заказов"
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
              Фильтры{kind !== "all" && <span className="filter-indicator" />}
            </button>
            <div
              id="order-filter-options"
              className={`orders-filter-options ${filtersOpen ? "is-open" : ""}`}
            >
              <label>
                <span className="visually-hidden">Тип заказа</span>
                <select
                  aria-label="Тип заказа"
                  value={kind}
                  onChange={(e) => update("kind", e.target.value)}
                >
                  <option value="all">Все типы</option>
                  <option value="service">Услуги</option>
                  <option value="delivery">Доставки</option>
                </select>
              </label>
              <label>
                <span className="visually-hidden">Сортировка заказов</span>
                <select
                  aria-label="Сортировка заказов"
                  value={sort}
                  onChange={(e) => update("sort", e.target.value)}
                >
                  <option value="newest">Сначала новые</option>
                  <option value="price">Сначала дешевле</option>
                  <option value="price_desc">Сначала дороже</option>
                </select>
              </label>
            </div>
          </div>
          <div className="orders-result-summary">
            <span role="status">
              {filtered.length}{" "}
              {plural(filtered.length, ["заказ", "заказа", "заказов"])}
              {kind === "delivery"
                ? " · Доставки"
                : kind === "service"
                  ? " · Услуги"
                  : ""}
            </span>
            {hasFilters && (
              <button
                onClick={() => setParams({}, { preventScrollReset: true })}
              >
                Сбросить фильтры
                <X size={13} />
              </button>
            )}
          </div>
          {filtered.length ? (
            <OrderRows orders={filtered} user={user} />
          ) : orders.length ? (
            <Empty
              title="Таких заказов пока нет"
              description="Попробуйте другое название, город или сочетание фильтров."
            >
              <button
                className="button secondary"
                onClick={() => setParams({}, { preventScrollReset: true })}
              >
                Показать все заказы
              </button>
            </Empty>
          ) : (
            <Empty
              title="Здесь начнутся хорошие дела"
              illustration="orders"
              description="Выберите отклик на свою заявку — заказ появится здесь вместе с перепиской и историей статусов."
            >
              <button
                className="button primary"
                onClick={() => create("request")}
              >
                Создать первую заявку
                <ArrowRight size={16} />
              </button>
            </Empty>
          )}
          <p className="orders-footnote">
            <ShieldCheck size={15} />
            Все условия, сообщения и изменения статуса сохраняются внутри
            заказа.
          </p>
        </>
      )}
    </WorkspaceFrame>
  );
}
