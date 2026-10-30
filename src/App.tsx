import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CarFront,
  Check,
  ChevronDown,
  ChefHat,
  CircleCheck,
  Clock3,
  Globe2,
  Grid2X2,
  Handshake,
  Heart,
  House,
  Leaf,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Truck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  CITIES,
  type Listing,
  type Notification,
} from "../shared/types";
import { api, json, plural, useAuth, useI18n, useToast } from "./lib";
import {
  Brand,
  Empty,
  ErrorState,
  ListingCard,
  Loading,
} from "./components/ui";
import { AuthModal, CreateModal, type CreateKind } from "./forms";
import {
  DashboardPage,
  DeliveryPage,
  ListingPage,
  OrderPage,
  RequestPage,
  RequestsPage,
} from "./pages";
const ParticleScene = lazy(() => import("./components/Particles"));
const categoryIcons: Record<string, typeof House> = {
  all: Grid2X2,
  repair: Wrench,
  food: ChefHat,
  auto: CarFront,
  beauty: Sparkles,
  business: BriefcaseBusiness,
  goods: ShoppingBag,
  delivery: Package,
};
export type CreateAction = (
  kind: CreateKind,
  preset?: Partial<Listing>,
) => void;

export default function App() {
  const { user, logout } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [create, setCreate] = useState<{
    kind: CreateKind;
    preset?: Partial<Listing>;
  } | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [city, setCity] = useState("Вся Черногория");
  const intent = useRef<(() => void) | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: meta } = useQuery({
    queryKey: ["meta"],
    queryFn: () =>
      api<{
        demo: boolean;
        stats: { listings: number; providers: number; requests: number };
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
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setUserMenu(false);
    setMobileOpen(false);
    setNotificationsOpen(false);
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
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Основная навигация">
            <NavLink to="/" end>
              {t.services}
            </NavLink>
            <NavLink to="/requests">{t.requests}</NavLink>
            <NavLink to="/delivery">
              {t.delivery}
              <span className="nav-new">new</span>
            </NavLink>
          </nav>
          <div className="header-actions">
            <label className="city-control">
              <MapPin size={15} />
              <select
                aria-label="Ваш город"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c === "Вся Черногория" ? t.everywhere : c}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
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
                          .catch((e) => toast(e.message));
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
                        {user.role === "arbiter"
                          ? "Арбитр"
                          : user.role === "provider"
                            ? "Исполнитель"
                            : "Заказчик"}
                      </small>
                      <Link to="/dashboard">
                        <UserRound size={16} />
                        {t.orders}
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
                      <strong>Уведомления</strong>
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
              {t.create}
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
            <NavLink to="/dashboard">{t.orders}</NavLink>
            <button onClick={() => createAction("request")}>
              Создать заявку
            </button>
          </nav>
        )}
      </header>
      <main>
        <Routes>
          <Route
            path="/"
            element={
              <Home
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
            element={<ListingPage create={createAction} />}
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

function Home({
  city,
  setCity,
  create,
  meta,
}: {
  city: string;
  setCity: (city: string) => void;
  create: CreateAction;
  meta?: {
    stats: { listings: number; providers: number; requests: number };
    demo: boolean;
  };
}) {
  const { t, language } = useI18n();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const category = params.get("category") ?? "all";
  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "recommended";
  useEffect(() => setSearch(q), [q]);
  const filters = new URLSearchParams({ q, category, city, sort });
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["listings", q, category, city, sort],
    queryFn: () => api<{ items: Listing[] }>(`/listings?${filters}`),
  });
  const setFilter = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { preventScrollReset: true },
    );
  function submit(e: FormEvent) {
    e.preventDefault();
    setFilter("q", search);
    document
      .getElementById("catalog")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="live-dot" />
            {t.near}
          </span>
          <h1>
            {t.hero1}
            <br />
            <span>{t.hero2}</span>
          </h1>
          <p className="hero-description">{t.intro}</p>
          <div className="hero-social">
            <div className="avatar-stack">
              <span>ЕК</span>
              <span>СМ</span>
              <span>АВ</span>
              <span>
                <Heart size={14} fill="currentColor" />
              </span>
            </div>
            <p>
              <strong>Место, где помогают свои</strong>
              <span>Местные люди. Понятные договорённости.</span>
            </p>
          </div>
          <a className="hero-text-link" href="#how-it-works">
            {t.how}
            <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="hero-visual">
          <div className="hero-photo-shell">
            <img
              className="hero-photo"
              src="/images/kotor.jpg"
              alt="Терракотовые крыши Котора на берегу Бока-Которского залива"
              fetchPriority="high"
            />
          </div>
          <div className="hero-shade" />
          <Suspense fallback={null}>
            <ParticleScene />
          </Suspense>
          <span className="photo-location">
            <MapPin size={13} />
            Котор, Черногория
          </span>
          <div className="hero-photo-title">
            Маленькая страна.
            <br />
            <em>Большое чувство дома.</em>
          </div>
          <div className="floating-trust">
            <div className="trust-icon">
              <Handshake size={23} />
            </div>
            <div>
              <strong>Свои люди — рядом</strong>
              <span>От первой заявки до результата</span>
            </div>
            <span className="tiny-sparkle">✳</span>
          </div>
          <div className="photo-pagination">
            <span />
            <span />
            <span />
          </div>
          <span className="visual-stamp">
            <svg width="44" height="44" viewBox="0 0 44 44">
              <path
                d="M22 3v38M5.5 12.5l33 19M5.5 31.5l33-19"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </div>
      </section>
      <section className="discovery-section" aria-label="Поиск предложений">
        <form className="search-bar" onSubmit={submit}>
          <div className="search-input">
            <Search size={21} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              aria-label={t.search}
            />
            {search && (
              <button
                type="button"
                className="icon-button"
                aria-label="Очистить поиск"
                onClick={() => {
                  setSearch("");
                  setFilter("q", "");
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <label className="search-city">
            <MapPin size={18} />
            <select
              aria-label="Город поиска"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c === "Вся Черногория" ? t.everywhere : c}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </label>
          <button className="button primary search-submit" type="submit">
            {t.find}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="suggestions">
          <span>Например:</span>
          {["Кондиционер", "Домашняя еда", "Бухгалтер", "Доставка из РФ"].map(
            (term, i) => (
              <button
                key={term}
                onClick={() => {
                  if (i === 3) {
                    create("delivery");
                    return;
                  }
                  setSearch(term);
                  setFilter("q", term);
                }}
              >
                {term}
              </button>
            ),
          )}
        </div>
      </section>
      <section className="category-section" aria-label="Категории">
        {CATEGORIES.map((c) => {
          const Icon = categoryIcons[c.id];
          return (
            <button
              key={c.id}
              className={`category-tile cat-${c.id} ${category === c.id ? "selected" : ""}`}
              onClick={() => {
                setFilter("category", c.id);
                document
                  .getElementById("catalog")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              aria-pressed={category === c.id}
            >
              <span className="category-icon">
                <Icon size={25} strokeWidth={1.5} />
              </span>
              <span>
                {language === "en" ? c.en : language === "sr" ? c.sr : c.name}
              </span>
            </button>
          );
        })}
      </section>
      <section className="catalog-section section-space" id="catalog">
        <div className="section-header">
          <div>
            <span className="section-kicker">МЕСТНЫЕ. БЛИЗКИЕ. ВАШИ.</span>
            <h2>
              {q || category !== "all" ? t.catalog : t.popular}
              <span className="heading-dot">.</span>
            </h2>
          </div>
          <label className="sort-control">
            <SlidersHorizontal size={15} />
            <select
              aria-label="Сортировка предложений"
              value={sort}
              onChange={(e) => setFilter("sort", e.target.value)}
            >
              <option value="recommended">Рекомендуем</option>
              <option value="newest">Сначала новые</option>
              <option value="price">Сначала дешевле</option>
            </select>
            <ChevronDown size={13} />
          </label>
        </div>
        {(q || category !== "all" || city !== "Вся Черногория") && (
          <div className="active-filters">
            <span>
              {data?.items.length ?? 0}{" "}
              {plural(data?.items.length ?? 0, [
                "предложение",
                "предложения",
                "предложений",
              ])}
              {q && ` по запросу «${q}»`}
            </span>
            <button
              onClick={() => {
                setParams({});
                setSearch("");
                setCity("Вся Черногория");
              }}
            >
              {t.reset}
              <X size={13} />
            </button>
          </div>
        )}
        {isPending ? (
          <div className="listing-grid">
            {[1, 2, 3, 4].map((i) => (
              <div className="skeleton-card" key={i}>
                <span />
                <i />
                <i />
                <i />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} retry={refetch} />
        ) : data?.items.length ? (
          <div className="listing-grid">
            {data.items.map((l) => (
              <ListingCard listing={l} key={l.id} />
            ))}
          </div>
        ) : (
          <Empty title={t.empty} description={t.emptyHint}>
            <button
              className="button secondary"
              onClick={() => {
                setParams({});
                setSearch("");
                setCity("Вся Черногория");
              }}
            >
              {t.reset}
            </button>
          </Empty>
        )}
      </section>
      <section className="request-callout">
        <div className="callout-doodle">
          <MessageCircle size={43} strokeWidth={1.25} />
          <span>✳</span>
        </div>
        <div>
          <span className="section-kicker">ПУСТЬ ВАС НАЙДУТ</span>
          <h2>Не ищите. Расскажите, что нужно.</h2>
          <p>Создайте заявку — мастера сами предложат цену и удобное время.</p>
        </div>
        <button className="button dark" onClick={() => create("request")}>
          {t.newRequest}
          <ArrowUpRight size={18} />
        </button>
      </section>
      <section className="local-life section-space">
        <div className="local-life-heading">
          <span className="section-kicker">МЕНЬШЕ ХЛОПОТ. БОЛЬШЕ ЖИЗНИ.</span>
          <h2>
            Одна площадка.
            <br />
            Тысяча повседневных решений.
          </h2>
          <p>
            Чтобы в новой стране было чуть уютнее.
            <br />И всё важное находилось рядом.
          </p>
        </div>
        <Link className="feature-card delivery-feature" to="/delivery">
          <span className="feature-icon">
            <Package size={27} />
          </span>
          <span className="feature-overline">ИЗ-ЗА ГРАНИЦЫ — ДО ДВЕРИ</span>
          <h3>
            Далеко —<br />
            тоже близко.
          </h3>
          <p>
            Покупки из РФ, Китая и Европы.
            <br />
            Понятная цена. Каждый этап на виду.
          </p>
          <span className="feature-link">
            Как устроена доставка
            <ArrowUpRight size={18} />
          </span>
          <div className="feature-parcel-scene">
            <Suspense fallback={null}>
              <ParticleScene variant="delivery" compact />
            </Suspense>
          </div>
        </Link>
        <div className="feature-card care-feature">
          <span className="feature-icon">
            <ShieldCheck size={27} />
          </span>
          <span className="feature-overline">ПОМОЖЕМ ДОГОВОРИТЬСЯ</span>
          <h3>
            Всё начинается
            <br />с доверия.
          </h3>
          <p>
            Контакты в заказе, история договорённостей
            <br />и арбитр, если что-то пошло не так.
          </p>
          <a className="feature-link" href="#how-it-works">
            Узнать больше
            <ArrowUpRight size={18} />
          </a>
          <span className="care-decoration">✳</span>
        </div>
      </section>
      <section id="how-it-works" className="how-section section-space">
        <div className="section-header">
          <div>
            <span className="section-kicker">ПРОСТО, ПО-ЧЕЛОВЕЧЕСКИ</span>
            <h2>От «мне нужно» до «готово».</h2>
          </div>
          <span className="handwritten">
            Всё получится <span>↗</span>
          </span>
        </div>
        <div className="steps">
          <div>
            <span className="step-number">01</span>
            <h3>Найдите или попросите</h3>
            <p>Выберите предложение или расскажите о своей задаче.</p>
          </div>
          <div>
            <span className="step-number">02</span>
            <h3>Договоритесь напрямую</h3>
            <p>
              Выберите отклик, согласуйте цену и время. Контакты будут в заказе.
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <h3>Живите чуть спокойнее</h3>
            <p>
              Следите за статусами, подтвердите результат и рассчитайтесь при
              встрече.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function Favorites({ requireLogin }: { requireLogin: () => void }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const ids = useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: () => api<{ ids: string[]; items: Listing[] }>("/favorites"),
    enabled: !!user,
  });
  const items = ids.data?.items;
  return (
    <div className="page-shell">
      <div className="page-heading">
        <span className="section-kicker">ТО, ЧТО ПОНРАВИЛОСЬ</span>
        <h1>
          {t.favorites}
          <span className="heading-dot">.</span>
        </h1>
      </div>
      {loading ? (
        <Loading />
      ) : !user ? (
        <Empty
          title="Сохраните полезные контакты"
          description="Войдите, чтобы ваши находки всегда были под рукой."
        >
          <button className="button primary" onClick={requireLogin}>
            Войти в аккаунт
          </button>
        </Empty>
      ) : ids.isPending ? (
        <Loading />
      ) : ids.error ? (
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
