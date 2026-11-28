import { useUiText } from "./lib";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Heart,
  House,
  Leaf,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Package,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
  X,
  Trash2,
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
import {
  DashboardPage,
  OrdersPage,
  ProfilePage,
  WorkspaceFrame,
} from "./WorkspacePages";
import { OrderHelpPage, PublicProviderPage } from "./PublicPages";
import { ConversationsPage } from "./ConversationPages";
import { LanguagePicker, ThemeToggle } from "./components/AppearanceControls";
import { DiscoverPage } from "./DiscoverPage";
import { CompareTray } from "./components/CompareTray";
import { useMarket } from "./market-state";
import { BrandSpark } from "./components/BrandIllustration";
import { OperatorPage } from "./OperatorPage";
import { useAvailableListings } from "./available-listings";
import { ReportModal, type ReportTarget } from "./components/ReportButton";
import { CityPicker } from "./components/CityPicker";
import { DesktopNavigation } from "./components/DesktopNavigation";
import { AssistantWidget } from "./AssistantPage";
import { catalogCities, orderHelpPath } from "./market-copy";
export type CreateAction = (kind: CreateKind, preset?: CreatePreset) => void;

export default function App() {
  const tr = useUiText();
  const { user, logout } = useAuth();
  const { t } = useI18n();
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
  const activeCatalogCities =
    location.pathname === "/"
      ? catalogCities(new URLSearchParams(location.search))
      : [];
  const setCity = (value: string) => {
    setCityState(value);
    if (location.pathname === "/") {
      const search = new URLSearchParams(location.search);
      search.delete("cities");
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
    const [selected] = catalogCities(new URLSearchParams(location.search));
    setCityState(
      selected && CITIES.some((item) => item === selected)
        ? selected
        : "Вся Черногория",
    );
  }, [location.pathname, location.search]);
  const intent = useRef<(() => void) | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: meta, isPending: metaPending } = useQuery({
    queryKey: ["meta"],
    queryFn: () =>
      api<{
        demo: boolean;
        deliveryEnabled: boolean;
        assistantEnabled?: boolean;
        stats: {
          listings: number;
          providers: number;
          requests: number;
          imported?: number;
        };
      }>("/meta"),
  });
  const deliveryEnabled = meta?.deliveryEnabled === true;
  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => api<{ items: Notification[] }>("/notifications"),
    enabled: !!user,
    refetchInterval: 30000,
  });
  const clearNotifications = useMutation({
    mutationFn: () =>
      api("/notifications", { method: "DELETE", body: json({}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
    },
    onError: (error) => toast(error.message, "error"),
  });
  const authorize = (action: () => void) => {
    if (user) action();
    else {
      intent.current = action;
      setAuthOpen(true);
    }
  };
  const createAction: CreateAction = (kind, preset) => {
    if (kind === "delivery" && !deliveryEnabled) return;
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
    if (location.hash !== "#catalog")
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
        {tr("Перейти к содержимому")}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <DesktopNavigation deliveryEnabled={deliveryEnabled} />
          <div className="header-actions">
            <CityPicker
              city={city}
              summary={
                activeCatalogCities.length > 1
                  ? `${tr("Выбрано")} ${activeCatalogCities.length}`
                  : undefined
              }
              onChange={setCity}
            />
            <LanguagePicker />
            <ThemeToggle />
            <div className="account-controls" ref={menuRef}>
              <Link
                className="header-favorites icon-button"
                to="/favorites"
                aria-label={tr("Избранное")}
              >
                <Heart size={20} />
              </Link>
              {user ? (
                <>
                  <button
                    className="icon-button notifications-button"
                    aria-label={tr("Уведомления")}
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
                    aria-label={tr("Меню аккаунта")}
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
                          ? tr("Оператор")
                          : user.role === "arbiter"
                            ? tr("Арбитр")
                            : user.role === "provider"
                              ? tr("Исполнитель")
                              : tr("Заказчик")}
                      </small>
                      <Link to="/dashboard">
                        <UserRound size={16} />
                        {tr("Личный кабинет")}
                      </Link>
                      {user.isOperator && (
                        <Link to="/operator">
                          <ShieldCheck size={16} />
                          {tr("Панель оператора")}
                        </Link>
                      )}
                      <Link to="/orders">
                        <Package size={16} />
                        {tr("Мои заказы")}
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
                          toast(tr("Вы вышли из аккаунта"));
                        }}
                      >
                        <LogOut size={16} />
                        {tr("Выйти")}
                      </button>
                    </div>
                  )}
                  {notificationsOpen && (
                    <div className="dropdown notifications-dropdown">
                      <strong>
                        <BrandSpark />
                        {tr("Уведомления")}
                      </strong>
                      {!!notifications?.items.length && (
                        <button
                          type="button"
                          className="notification-clear"
                          disabled={clearNotifications.isPending}
                          onClick={() => clearNotifications.mutate()}
                        >
                          <Trash2 size={15} /> {tr("Очистить уведомления")}
                        </button>
                      )}
                      {notifications?.items.length ? (
                        notifications.items.map((n) => (
                          <Link key={n.id} to={n.href}>
                            <span className="notification-symbol">
                              <Bell size={15} />
                            </span>
                            <span>{tr(n.text)}</span>
                            <ArrowUpRight size={14} />
                          </Link>
                        ))
                      ) : (
                        <p className="muted">
                          {tr(
                            "Здесь появятся отклики и новости ваших заказов.",
                          )}
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
              {user?.role === "provider"
                ? tr("Добавить услугу")
                : tr("Создать заявку")}
            </button>
            <button
              className="icon-button mobile-toggle"
              aria-label={mobileOpen ? tr("Закрыть меню") : tr("Открыть меню")}
              aria-expanded={mobileOpen}
              aria-controls={mobileOpen ? "mobile-menu" : undefined}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav
            className="mobile-nav"
            id="mobile-menu"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a, button"))
                setMobileOpen(false);
            }}
          >
            <NavLink to="/" end>
              {t.services}
            </NavLink>
            <NavLink to="/requests">{t.requests}</NavLink>
            {deliveryEnabled ? (
              <NavLink to="/delivery">{t.delivery}</NavLink>
            ) : (
              <NavLink to={orderHelpPath}>{t.orderHelp}</NavLink>
            )}
            <NavLink to="/dashboard">{t.orders}</NavLink>
            <NavLink to="/orders">{t.myOrders}</NavLink>
            {user?.isOperator && (
              <NavLink to="/operator">{tr("Панель оператора")}</NavLink>
            )}
            <button
              onClick={() =>
                createAction(user?.role === "provider" ? "listing" : "request")
              }
            >
              {user?.role === "provider" ? t.newListing : t.newRequest}
            </button>
          </nav>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={<DiscoverPage create={createAction} meta={meta} />}
          />
          <Route
            path="/requests"
            element={
              <RequestsPage
                city={city}
                setCity={setCity}
                create={createAction}
                deliveryEnabled={deliveryEnabled}
              />
            }
          />
          <Route
            path="/requests/:id"
            element={<RequestPage requireLogin={() => setAuthOpen(true)} />}
          />
          <Route
            path="/delivery"
            element={
              deliveryEnabled ? (
                <DeliveryPage create={createAction} />
              ) : metaPending ? (
                <Loading />
              ) : (
                <Navigate replace to={orderHelpPath} />
              )
            }
          />
          <Route
            path={orderHelpPath}
            element={<OrderHelpPage create={createAction} />}
          />
          <Route path="/providers/:id" element={<PublicProviderPage />} />
          <Route
            path="/listings/:id"
            element={
              <ListingPage authorize={authorize} report={reportAction} />
            }
          />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                create={createAction}
                deliveryEnabled={deliveryEnabled}
                requireLogin={() => setAuthOpen(true)}
              />
            }
          />
          <Route
            path="/dashboard/profile"
            element={<ProfilePage requireLogin={() => setAuthOpen(true)} />}
          />
          <Route
            path="/dashboard/messages/:id?"
            element={
              <ConversationsPage requireLogin={() => setAuthOpen(true)} />
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
          {meta?.assistantEnabled && (
            <Route
              path="/assistant"
              element={<Navigate to="/" replace state={{ openAssistant: true }} />}
            />
          )}
          <Route
            path="*"
            element={
              <div className="page-shell">
                <Empty
                  title={tr("Такой страницы нет")}
                  description={tr(
                    "Но рядом наверняка найдётся что-то полезное.",
                  )}
                >
                  <Link className="button primary" to="/">
                    {tr("На главную")}
                  </Link>
                </Empty>
              </div>
            }
          />
        </Routes>
      </main>
      <nav className="bottom-navigation" aria-label={t.mobileNav}>
        <NavLink to="/" end>
          <House size={20} />
          <span>{t.home}</span>
        </NavLink>
        <NavLink to="/requests">
          <MessageCircle size={20} />
          <span>{t.requestsShort}</span>
        </NavLink>
        {deliveryEnabled ? (
          <NavLink to="/delivery">
            <Truck size={20} />
            <span>{t.delivery}</span>
          </NavLink>
        ) : (
          <NavLink to={orderHelpPath}>
            <ShoppingBag size={20} />
            <span>{t.orderHelpShort}</span>
          </NavLink>
        )}
        <NavLink to="/favorites">
          <Heart size={20} />
          <span>{t.favorites}</span>
        </NavLink>
        <NavLink to="/dashboard">
          <UserRound size={20} />
          <span>{t.orders}</span>
        </NavLink>
      </nav>
      <CompareTray />
      {meta?.assistantEnabled && (
        <AssistantWidget
          openOnLoad={location.state?.openAssistant === true}
          editDraft={(action) => {
            const preset = { ...action.draft, id: `assistant-${action.id}` };
            if (action.kind === "requestDraft") {
              createAction("request", { ...preset, request: action.draft });
            } else {
              createAction("listing", preset);
            }
          }}
        />
      )}
      <footer className="site-footer">
        <div className="footer-main">
          <div>
            <Brand />
            <p>
              {tr("Ближе к людям.")}
              <br />
              {tr("Ближе к дому.")}
            </p>
          </div>
          <div className="footer-links">
            <Link to="/">{tr("Услуги и товары")}</Link>
            <Link to="/requests">{tr("Найти исполнителя")}</Link>
            <Link to={deliveryEnabled ? "/delivery" : orderHelpPath}>
              {deliveryEnabled ? tr("Заказать доставку") : t.orderHelp}
            </Link>
            <Link to="/dashboard">{tr("Личный кабинет")}</Link>
          </div>
          <div className="footer-note">
            <span>
              <Leaf size={16} />
              {tr("Сделано для жизни в Черногории")}
            </span>
            <small>
              {tr("Договаривайтесь, помогайте друг другу,")}
              <br />
              {tr("чувствуйте себя дома.")}
            </small>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} blizu ·{" "}
            <a href="/credits.html" target="_blank" rel="noreferrer">
              {tr("Фотографии")}
            </a>
          </span>
          <span>
            {meta?.demo
              ? tr("Карточки с пометкой «Демо» содержат вымышленные данные")
              : tr("Оплата напрямую между сторонами")}
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
          deliveryEnabled={deliveryEnabled}
          onClose={() => setCreate(null)}
        />
      )}
    </>
  );
}

function Favorites({ requireLogin }: { requireLogin: () => void }) {
  const tr = useUiText();
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
      toast(tr("Избранное перенесено в аккаунт"));
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
  const content = (
    <>
      {user && (
        <Link className="back-link favorites-back" to="/dashboard">
          <ArrowLeft size={16} aria-hidden="true" />
          {tr("В личный кабинет")}
        </Link>
      )}
      <div className="page-heading">
        <span className="section-kicker">{tr("ТО, ЧТО ПОНРАВИЛОСЬ")}</span>
        <h1>
          {t.favorites}
          <span className="heading-dot">.</span>
        </h1>
      </div>
      {user && guestSaved.items.length > 0 && (
        <div className="guest-saved-note">
          <Heart size={18} />
          <p>
            {tr(
              "На этом устройстве есть сохранённые предложения. Перенести их в ваш аккаунт?",
            )}
          </p>
          <button
            className="button primary"
            disabled={transfer.isPending}
            onClick={() => transfer.mutate()}
          >
            {transfer.isPending ? tr("Переносим…") : tr("Перенести избранное")}
          </button>
        </div>
      )}
      {!user && !!items?.length && (
        <div className="guest-saved-note">
          <Heart size={18} />
          <p>
            {tr(
              "Избранное сохранено на этом устройстве. Предложения доступны и без регистрации.",
            )}
          </p>
          <button className="button secondary" onClick={requireLogin}>
            {tr("Войти")}
          </button>
        </div>
      )}
      {loading || guestSaved.loading ? (
        <Loading />
      ) : !user && guestSaved.error ? (
        <ErrorState error={guestSaved.error} retry={guestSaved.refetch} />
      ) : !user && !items?.length ? (
        <Empty
          title={tr("Сохраните полезные контакты")}
          illustration="favorites"
          description={tr(
            "Нажимайте сердечко на карточках. Ваши находки останутся на этом устройстве.",
          )}
        >
          <button className="button primary" onClick={requireLogin}>
            {tr("Войти в аккаунт")}
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
          title={tr("Соберите своё избранное")}
          illustration="favorites"
          description={tr(
            "Нажимайте на сердечко у предложений, которые хотите сохранить.",
          )}
        >
          <Link className="button primary" to="/">
            {tr("Найти что-нибудь полезное")}
          </Link>
        </Empty>
      )}
    </>
  );
  return user ? (
    <WorkspaceFrame user={user}>{content}</WorkspaceFrame>
  ) : (
    <div className="page-shell">{content}</div>
  );
}
