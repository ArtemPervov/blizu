import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Bell,
  Globe2,
  Heart,
  House,
  Leaf,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Package,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { CITIES, type Listing, type Notification } from "../shared/types";
import { api, json, useAuth, useI18n, useToast } from "./lib";
import {
  Brand,
  Empty,
  ErrorState,
  ListingCard,
  Loading,
} from "./components/ui";
import {
  AuthModal,
  CreateModal,
  type CreateKind,
  type CreatePreset,
} from "./forms";
import { ListingPage, OrderPage, RequestPage, RequestsPage } from "./pages";
import { DeliveryPage } from "./DeliveryPage";
import { DashboardPage, OrdersPage } from "./WorkspacePages";
import { DiscoverPage } from "./DiscoverPage";
import { CompareTray } from "./components/CompareTray";
import { useMarket } from "./market-state";
import { BrandSpark } from "./components/BrandIllustration";
import { OperatorPage } from "./OperatorPage";
import { useAvailableListings } from "./available-listings";
import { ReportModal, type ReportTarget } from "./components/ReportButton";
import { CityPicker } from "./components/CityPicker";
export type CreateAction = (kind: CreateKind, preset?: CreatePreset) => void;

export default function App() {
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [create, setCreate] = useState<{
    kind: CreateKind;
    preset?: CreatePreset;
  } | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [city, setCityState] = useState("Вся Черногория");
  const setCity = (value: string) => {
    setCityState(value);
    if (location.pathname === "/") {
      const search = new URLSearchParams(location.search);
      search.set("city", value);
      search.delete("page");
      navigate(
        { pathname: "/", search: search.toString() },
        { preventScrollReset: true },
      );
    }
  };
  useEffect(() => {
    if (location.pathname !== "/") return;
    const selected = new URLSearchParams(location.search).get("city");
    setCityState(
      selected && CITIES.some((item) => item === selected)
        ? selected
        : "Вся Черногория",
    );
  }, [location.pathname, location.search]);
  const intent = useRef<(() => void) | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () =>
      api<{
        demo: boolean;
        stats: {
          listings: number;
          providers: number;
          requests: number;
          imported?: number;
        };
      }>("/meta"),
  });
  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => api<{ items: Notification[] }>("/notifications"),
    enabled: !!user,
    refetchInterval: 30000,
  });
  const createAction: CreateAction = (kind, preset) => {
    if (!user) {
      intent.current = () => setCreate({ kind, preset });
      setAuthOpen(true);
    } else setCreate({ kind, preset });
  };
  const reportAction = (target: ReportTarget) => {
    if (!user) {
      intent.current = () => setReport(target);
      setAuthOpen(true);
    } else setReport(target);
  };
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setUserMenu(false);
    setMobileOpen(false);
    setNotificationsOpen(false);
    setReport(null);
  }, [location.pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenu(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Основная навигация">
            <NavLink to="/" end>
              {t.services}
            </NavLink>
            <NavLink to="/requests">
              {language === "ru" ? "Заявки" : t.requests}
            </NavLink>
            <NavLink to="/delivery">{t.delivery}</NavLink>
          </nav>
          <div className="header-actions">
            <CityPicker city={city} onChange={setCity} />
            <label className="language-control">
              <Globe2 size={15} />
              <select
                aria-label="Язык интерфейса"
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
              >
                <option value="ru">RU</option>
                <option value="en">EN</option>
                <option value="sr">SR</option>
              </select>
            </label>
            <div className="account-controls" ref={menuRef}>
              <Link
                className="header-favorites icon-button"
                to="/favorites"
                aria-label="Избранное"
              >
                <Heart size={20} />
              </Link>
              {user ? (
                <>
                  <button
                    className="icon-button notifications-button"
                    aria-label="Уведомления"
                    aria-expanded={notificationsOpen}
                    onClick={() => {
                      setNotificationsOpen((v) => !v);
                      setUserMenu(false);
                      if (!notificationsOpen) {
                        api("/notifications/read", { method: "POST" })
                          .then(() =>
                            qc.invalidateQueries({
                              queryKey: ["notifications"],
                            }),
                          )
                          .catch((e) => toast(e.message, "error"));
                      }
                    }}
                  >
                    <Bell size={19} />
                    {notifications?.items.some((n) => !n.read) && (
                      <span className="notification-dot" />
                    )}
                  </button>
                  <button
                    className="avatar-button"
                    aria-label="Меню аккаунта"
                    aria-expanded={userMenu}
                    onClick={() => {
                      setUserMenu((v) => !v);
                      setNotificationsOpen(false);
                    }}
                  >
                    {user.name[0]}
                  </button>
                  {userMenu && (
                    <div className="dropdown account-dropdown">
                      <strong>{user.name}</strong>
                      <small>
                        {user.isOperator
                          ? "Оператор"
                          : user.role === "arbiter"
                            ? "Арбитр"
                            : user.role === "provider"
                              ? "Исполнитель"
                              : "Заказчик"}
                      </small>
                      <Link to="/dashboard">
                        <UserRound size={16} />
                        Личный кабинет
                      </Link>
                      {user.isOperator && (
                        <Link to="/operator">
                          <ShieldCheck size={16} />
                          Панель оператора
                        </Link>
                      )}
                      <Link to="/orders">
                        <Package size={16} />
                        Мои заказы
                      </Link>
                      <Link to="/favorites">
                        <Heart size={16} />
                        {t.favorites}
                      </Link>
                      <button
                        onClick={async () => {
                          await logout();
                          setUserMenu(false);
                          navigate("/");
                          toast("Вы вышли из аккаунта");
                        }}
                      >
                        <LogOut size={16} />
                        Выйти
                      </button>
                    </div>
                  )}
                  {notificationsOpen && (
                    <div className="dropdown notifications-dropdown">
                      <strong>
                        <BrandSpark />
                        Уведомления
                      </strong>
                      {notifications?.items.length ? (
                        notifications.items.map((n) => (
                          <Link key={n.id} to={n.href}>
                            <span className="notification-symbol">
                              <Bell size={15} />
                            </span>
                            <span>{n.text}</span>
                            <ArrowUpRight size={14} />
                          </Link>
                        ))
                      ) : (
                        <p className="muted">
                          Здесь появятся отклики и новости ваших заказов.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <button
                  className="login-button"
                  onClick={() => setAuthOpen(true)}
                >
                  <UserRound size={17} />
                  {t.login}
                </button>
              )}
            </div>
            <button
              className="button primary header-create"
              onClick={() =>
                createAction(user?.role === "provider" ? "listing" : "request")
              }
            >
              <Plus size={18} />
              {user?.role === "provider" ? "Добавить услугу" : "Создать заявку"}
            </button>
            <button
              className="icon-button mobile-toggle"
              aria-label="Открыть меню"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="mobile-nav">
            <NavLink to="/">{t.services}</NavLink>
            <NavLink to="/requests">{t.requests}</NavLink>
            <NavLink to="/delivery">{t.delivery}</NavLink>
            <NavLink to="/dashboard">Личный кабинет</NavLink>
            <NavLink to="/orders">Мои заказы</NavLink>
            {user?.isOperator && (
              <NavLink to="/operator">Панель оператора</NavLink>
            )}
            <button onClick={() => createAction("request")}>
              Создать заявку
            </button>
          </nav>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={
              <DiscoverPage
                city={city}
                setCity={setCity}
                create={createAction}
                meta={meta}
              />
            }
          />
          <Route
            path="/requests"
            element={
              <RequestsPage
                city={city}
                setCity={setCity}
                create={createAction}
              />
            }
          />
          <Route
            path="/requests/:id"
            element={<RequestPage requireLogin={() => setAuthOpen(true)} />}
          />
          <Route
            path="/delivery"
            element={<DeliveryPage create={createAction} />}
          />
          <Route
            path="/listings/:id"
            element={
              <ListingPage create={createAction} report={reportAction} />
            }
          />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                create={createAction}
                requireLogin={() => setAuthOpen(true)}
              />
            }
          />
          <Route
            path="/operator"
            element={<OperatorPage requireLogin={() => setAuthOpen(true)} />}
          />
          <Route
            path="/orders"
            element={
              <OrdersPage
                create={createAction}
                requireLogin={() => setAuthOpen(true)}
              />
            }
          />
          <Route
            path="/orders/:id"
            element={<OrderPage requireLogin={() => setAuthOpen(true)} />}
          />
          <Route
            path="/favorites"
            element={<Favorites requireLogin={() => setAuthOpen(true)} />}
          />
          <Route
            path="*"
            element={
              <div className="page-shell">
                <Empty
                  title="Такой страницы нет"
                  description="Но рядом наверняка найдётся что-то полезное."
                >
                  <Link className="button primary" to="/">
                    На главную
                  </Link>
                </Empty>
              </div>
            }
          />
        </Routes>
      </main>
      <nav className="bottom-navigation" aria-label="Мобильная навигация">
        <NavLink to="/" end>
          <House size={20} />
          <span>Главная</span>
        </NavLink>
        <NavLink to="/requests">
          <MessageCircle size={20} />
          <span>Заявки</span>
        </NavLink>
        <button onClick={() => createAction("request")}>
          <Plus size={22} />
          <span>Создать</span>
        </button>
        <NavLink to="/favorites">
          <Heart size={20} />
          <span>Избранное</span>
        </NavLink>
        <NavLink to="/dashboard">
          <UserRound size={20} />
          <span>Мои дела</span>
        </NavLink>
      </nav>
      <CompareTray />
      <footer className="site-footer">
        <div className="footer-main">
          <div>
            <Brand />
            <p>
              Ближе к людям.
              <br />
              Ближе к дому.
            </p>
          </div>
          <div className="footer-links">
            <Link to="/">Услуги и товары</Link>
            <Link to="/requests">Найти исполнителя</Link>
            <Link to="/delivery">Заказать доставку</Link>
            <Link to="/dashboard">Личный кабинет</Link>
          </div>
          <div className="footer-note">
            <span>
              <Leaf size={16} />
              Сделано для жизни в Черногории
            </span>
            <small>
              Договаривайтесь, помогайте друг другу,
              <br />
              чувствуйте себя дома.
            </small>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} blizu ·{" "}
            <a href="/credits.html" target="_blank" rel="noreferrer">
              Фотографии
            </a>
          </span>
          <span>
            {meta?.demo
              ? "Демо-режим · предложения и отзывы вымышлены"
              : "Оплата напрямую между сторонами"}
          </span>
          <span className="footer-coordinates">42°25′ N &nbsp; 18°46′ E</span>
        </div>
      </footer>
      {authOpen && (
        <AuthModal
          demo={!!meta?.demo}
          onClose={() => {
            setAuthOpen(false);
            intent.current = null;
          }}
          onSuccess={() => {
            setAuthOpen(false);
            intent.current?.();
            intent.current = null;
          }}
        />
      )}
      {report && user && (
        <ReportModal {...report} onClose={() => setReport(null)} />
      )}
      {create && (
        <CreateModal
          kind={create.kind}
          preset={create.preset}
          onClose={() => setCreate(null)}
        />
      )}
    </>
  );
}

function Favorites({ requireLogin }: { requireLogin: () => void }) {
  const { user, loading } = useAuth();
  const market = useMarket();
  const qc = useQueryClient();
  const toast = useToast();
  const transfer = useMutation({
    mutationFn: () =>
      Promise.all(
        guestSaved.items.map((item) =>
          api(`/favorites/${item.id}`, {
            method: "PUT",
            body: json({ saved: true }),
          }),
        ),
      ),
    onSuccess: () => {
      market.clearSaved();
      qc.invalidateQueries({ queryKey: ["favorites"] });
      toast("Избранное перенесено в аккаунт");
    },
    onError: (error) => toast(error.message, "error"),
  });
  const { t } = useI18n();
  const ids = useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: () => api<{ ids: string[]; items: Listing[] }>("/favorites"),
    enabled: !!user,
  });
  const guestSaved = useAvailableListings(market.saved);
  const items = user ? ids.data?.items : guestSaved.items;
  return (
    <div className="page-shell">
      <div className="page-heading">
        <span className="section-kicker">ТО, ЧТО ПОНРАВИЛОСЬ</span>
        <h1>
          {t.favorites}
          <span className="heading-dot">.</span>
        </h1>
      </div>
      {user && guestSaved.items.length > 0 && (
        <div className="guest-saved-note">
          <Heart size={18} />
          <p>
            На этом устройстве есть сохранённые предложения. Перенести их в ваш
            аккаунт?
          </p>
          <button
            className="button primary"
            disabled={transfer.isPending}
            onClick={() => transfer.mutate()}
          >
            {transfer.isPending ? "Переносим…" : "Перенести избранное"}
          </button>
        </div>
      )}
      {!user && !!items?.length && (
        <div className="guest-saved-note">
          <Heart size={18} />
          <p>
            Избранное сохранено на этом устройстве. Предложения доступны и без
            регистрации.
          </p>
          <button className="button secondary" onClick={requireLogin}>
            Войти
          </button>
        </div>
      )}
      {loading || guestSaved.loading ? (
        <Loading />
      ) : !user && guestSaved.error ? (
        <ErrorState error={guestSaved.error} retry={guestSaved.refetch} />
      ) : !user && !items?.length ? (
        <Empty
          title="Сохраните полезные контакты"
          illustration="favorites"
          description="Нажимайте сердечко на карточках. Ваши находки останутся на этом устройстве."
        >
          <button className="button primary" onClick={requireLogin}>
            Войти в аккаунт
          </button>
        </Empty>
      ) : user && ids.isPending ? (
        <Loading />
      ) : user && ids.error ? (
        <ErrorState error={ids.error} />
      ) : items?.length ? (
        <div className="listing-grid">
          {items.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      ) : (
        <Empty
          title="Соберите своё избранное"
          illustration="favorites"
          description="Нажимайте на сердечко у предложений, которые хотите сохранить."
        >
          <Link className="button primary" to="/">
            Найти что-нибудь полезное
          </Link>
        </Empty>
      )}
    </div>
  );
}
