import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  CarFront,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Grid2X2,
  LayoutGrid,
  List,
  MapPin,
  MessageCircle,
  Package,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Wrench,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  CITIES,
  type Listing,
  type ServiceRequest,
} from "../shared/types";
import { api, euro, plural } from "./lib";
import { useMarket } from "./market-state";
import { Empty, ErrorState, ListingCard, Modal } from "./components/ui";
import type { CreateAction } from "./App";
import { useAvailableListings } from "./available-listings";
import { AdriaticLight } from "./components/AdriaticLight";
import { listingCity, listingPrice } from "./listing-format";

const icons = {
  all: Grid2X2,
  repair: Wrench,
  food: ChefHat,
  auto: CarFront,
  beauty: Sparkles,
  business: BriefcaseBusiness,
  goods: ShoppingBag,
  delivery: Package,
};
const shortNames: Record<string, string> = {
  all: "Все категории",
  repair: "Дом и ремонт",
  food: "Домашняя еда",
  auto: "Авто",
  beauty: "Красота",
  business: "Документы",
  goods: "Магазины",
  delivery: "Доставка",
};
const PAGE_SIZE = 12;
function storedHistory(): string[] {
  try {
    const history: unknown = JSON.parse(
      localStorage.getItem("blizu.search-history") || "[]",
    );
    return Array.isArray(history)
      ? history
          .filter(
            (item): item is string =>
              typeof item === "string" && item.length <= 200,
          )
          .slice(0, 4)
      : [];
  } catch {
    return [];
  }
}
function price(value: string | null) {
  if (!value?.trim()) return "";
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1000000
    ? String(amount)
    : "";
}
function scrollResults() {
  document.getElementById("catalog")?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}

export function DiscoverPage({
  city,
  setCity,
  create,
  meta,
}: {
  city: string;
  setCity: (value: string) => void;
  create: CreateAction;
  meta?: {
    demo: boolean;
    stats: {
      listings: number;
      providers: number;
      requests: number;
      imported?: number;
    };
  };
}) {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").slice(0, 200);
  const telegramOnly = params.get("source") === "telegram";
  const category = CATEGORIES.some((item) => item.id === params.get("category"))
    ? params.get("category")!
    : "all";
  const sort = [
    "recommended",
    "price",
    "price_desc",
    "newest",
    "rating",
  ].includes(params.get("sort") || "")
    ? params.get("sort")!
    : "recommended";
  const min = price(params.get("minPrice")),
    max = price(params.get("maxPrice"));
  const verified = params.get("verified") === "1",
    rated = params.get("minRating") === "4.5";
  const page = Math.max(
    1,
    Math.min(8334, Math.floor(Number(params.get("page")) || 1)),
  );
  const [search, setSearch] = useState(q),
    [history, setHistory] = useState(storedHistory);
  const [minDraft, setMinDraft] = useState(min),
    [maxDraft, setMaxDraft] = useState(max),
    [priceError, setPriceError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem("blizu.catalog-view") === "list"
        ? "list"
        : "grid";
    } catch {
      return "grid";
    }
  });
  const market = useMarket();
  const recent = useAvailableListings(market.recent.slice(0, 4));
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    setMinDraft(min);
    setMaxDraft(max);
    setPriceError("");
  }, [min, max]);
  const query = new URLSearchParams({
    q,
    category,
    city,
    sort,
    ...(telegramOnly ? { source: "telegram" } : {}),
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
    ...(min ? { minPrice: min } : {}),
    ...(max ? { maxPrice: max } : {}),
    ...(verified ? { verified: "1" } : {}),
    ...(rated ? { minRating: "4.5" } : {}),
  });
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["listings", query.toString()],
    queryFn: () =>
      api<{ items: Listing[]; total: number }>(`/listings?${query}`),
    placeholderData: keepPreviousData,
  });
  const requests = useQuery({
    queryKey: ["discovery-requests", city],
    queryFn: () =>
      api<{ items: ServiceRequest[] }>(
        `/requests?${new URLSearchParams({ city })}`,
      ),
  });
  const update = (values: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("page");
        for (const [key, value] of Object.entries(values))
          value && value !== "all" ? next.set(key, value) : next.delete(key);
        return next;
      },
      { preventScrollReset: true },
    );
  const rememberSearch = (term: string) => {
    if (!term) return;
    const next = [term, ...history.filter((item) => item !== term)].slice(0, 4);
    setHistory(next);
    try {
      localStorage.setItem("blizu.search-history", JSON.stringify(next));
    } catch {
      /* Optional history. */
    }
  };
  const find = (term: string) => {
    const clean = term.trim().slice(0, 200);
    setSearch(clean);
    update({ q: clean });
    rememberSearch(clean);
    scrollResults();
  };
  const reset = () => {
    setParams({});
    setSearch("");
    setMinDraft("");
    setMaxDraft("");
    setPriceError("");
  };
  const applyPrice = (event: FormEvent) => {
    event.preventDefault();
    if (
      minDraft !== "" &&
      maxDraft !== "" &&
      Number(minDraft) > Number(maxDraft)
    ) {
      setPriceError("Цена «от» не должна быть больше цены «до».");
      return;
    }
    setPriceError("");
    update({ minPrice: minDraft, maxPrice: maxDraft });
    setFiltersOpen(false);
  };
  const chips = [
    ...(telegramOnly
      ? [{ label: "Из Telegram", clear: () => update({ source: "" }) }]
      : []),
    ...(q
      ? [
          {
            label: `«${q}»`,
            clear: () => {
              setSearch("");
              update({ q: "" });
            },
          },
        ]
      : []),
    ...(category !== "all"
      ? [
          {
            label: CATEGORIES.find((item) => item.id === category)!.name,
            clear: () => update({ category: "" }),
          },
        ]
      : []),
    ...(city !== "Вся Черногория"
      ? [{ label: city, clear: () => setCity("Вся Черногория") }]
      : []),
    ...(min || max
      ? [
          {
            label: `${min ? `от ${min}` : ""}${min && max ? " " : ""}${max ? `до ${max}` : ""} €`,
            clear: () => update({ minPrice: "", maxPrice: "" }),
          },
        ]
      : []),
    ...(verified
      ? [{ label: "С отметкой профиля", clear: () => update({ verified: "" }) }]
      : []),
    ...(rated
      ? [{ label: "Рейтинг от 4,5", clear: () => update({ minRating: "" }) }]
      : []),
  ];
  const filterPanel = (
    <div className="filter-panel">
      <div className="filter-panel-title">
        <h3>Точнее под вашу задачу</h3>
        <SlidersHorizontal size={17} />
      </div>
      <form onSubmit={applyPrice}>
        <fieldset>
          <legend>Стоимость, €</legend>
          <div className="price-fields">
            <label>
              <span>От</span>
              <input
                type="number"
                aria-label="Минимальная цена"
                min={0}
                max={1000000}
                value={minDraft}
                onChange={(event) => setMinDraft(event.target.value)}
                placeholder="0"
              />
            </label>
            <label>
              <span>До</span>
              <input
                type="number"
                aria-label="Максимальная цена"
                min={0}
                max={1000000}
                value={maxDraft}
                onChange={(event) => setMaxDraft(event.target.value)}
                placeholder="Любая"
              />
            </label>
          </div>
          <p className="filter-hint">
            Смотрите единицу цены в карточке: услуга, час или товар.
          </p>
          {priceError && (
            <p className="form-error" role="alert">
              {priceError}
            </p>
          )}
        </fieldset>
        <fieldset>
          <legend>Больше уверенности</legend>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={rated}
              onChange={(event) =>
                update({ minRating: event.target.checked ? "4.5" : "" })
              }
            />
            <span>
              <Star size={16} />
              Рейтинг от 4,5
            </span>
          </label>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) =>
                update({ verified: event.target.checked ? "1" : "" })
              }
            />
            <span>
              <BadgeCheck size={17} />С отметкой профиля
            </span>
          </label>
        </fieldset>
        <button className="button secondary full">
          Применить фильтры
          <ArrowRight size={15} />
        </button>
      </form>
      {chips.length > 0 && (
        <button className="filter-reset" onClick={reset}>
          Сбросить всё
        </button>
      )}
      <div className="filter-help">
        <span className="filter-help-icon">
          <MessageCircle size={22} />
        </span>
        <h3>Проще рассказать?</h3>
        <p>Опишите задачу. Исполнители сами предложат цену и время.</p>
        <button
          onClick={() => {
            setFiltersOpen(false);
            create("request", {
              city: city === "Вся Черногория" ? undefined : city,
              category: category === "all" ? undefined : category,
            });
          }}
        >
          Создать заявку
          <ArrowUpRight size={17} />
        </button>
      </div>
    </div>
  );
  return (
    <div className="discover-page">
      <section className="discover-hero" aria-labelledby="discover-title">
        <div className="discover-intro">
          <AdriaticLight />
          <div className="discovery-eyebrow">
            <span />
            ДЛЯ ЖИЗНИ В ЧЕРНОГОРИИ
          </div>
          <h1 id="discover-title">
            Всё нужное. <span>Совсем рядом.</span>
          </h1>
          <p>Местные услуги, товары и хорошие люди в Черногории.</p>
          <form
            className="discovery-search glass-panel"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              find(search);
            }}
          >
            <label className="discovery-search-field">
              <Search size={21} />
              <span className="visually-hidden">Что вы ищете?</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                maxLength={200}
                placeholder="Что нужно сделать или найти?"
                list="search-ideas"
                autoComplete="off"
              />
              <datalist id="search-ideas">
                {[
                  ...new Set([
                    ...history,
                    "Кондиционер",
                    "Домашняя еда",
                    "Бухгалтер",
                    "Массаж",
                  ]),
                ].map((term) => (
                  <option key={term} value={term} />
                ))}
              </datalist>
            </label>
            <label className="discovery-city">
              <MapPin size={16} />
              <span className="visually-hidden">Город поиска</span>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
              >
                {CITIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button
              className="discovery-search-submit"
              type="submit"
              aria-label="Найти предложения"
            >
              Найти
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="discovery-suggestions">
            <span>
              {history.length ? (
                <>
                  <Clock3 size={13} />
                  Недавнее:
                </>
              ) : (
                "Например:"
              )}
            </span>
            {(history.length
              ? history.slice(0, 3)
              : ["Уборка", "Домашняя еда", "Кондиционер"]
            ).map((term) => (
              <button key={term} onClick={() => find(term)}>
                {term}
              </button>
            ))}
            {history.length > 0 && (
              <button
                className="clear-history"
                aria-label="Очистить историю поиска"
                onClick={() => {
                  setHistory([]);
                  try {
                    localStorage.removeItem("blizu.search-history");
                  } catch {}
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="discovery-hero-links">
            <button onClick={() => create("request")}>
              Нужна помощь с задачей?{" "}
              <span>
                Создайте заявку
                <ArrowUpRight size={14} />
              </span>
            </button>
            <span className="hero-link-divider" />
            <Link to="/delivery">
              Покупка издалека?{" "}
              <span>
                Закажите доставку
                <ArrowUpRight size={14} />
              </span>
            </Link>
          </div>
        </div>
      </section>
      <nav className="discovery-categories" aria-label="Категории предложений">
        {CATEGORIES.map((item) => {
          const Icon = icons[item.id];
          return (
            <button
              key={item.id}
              aria-label={item.name}
              aria-pressed={category === item.id}
              onClick={() => {
                update({ category: item.id });
                scrollResults();
              }}
            >
              <Icon size={21} strokeWidth={1.6} />
              <span>{shortNames[item.id]}</span>
              {category === item.id && <span className="category-active-dot" />}
            </button>
          );
        })}
      </nav>
      <section className="discovery-catalog" id="catalog">
        <div className="discovery-section-heading">
          <div>
            <span className="section-kicker">ПОЛЕЗНОЕ НА КАЖДЫЙ ДЕНЬ</span>
            <h2>
              {q
                ? `Результаты поиска`
                : category !== "all"
                  ? CATEGORIES.find((item) => item.id === category)?.name
                  : "Найдите своего человека"}
            </h2>
            <p aria-live="polite">
              {isFetching
                ? "Обновляем предложения…"
                : `${data?.total ?? 0} ${plural(data?.total ?? 0, ["предложение", "предложения", "предложений"])}${city !== "Вся Черногория" ? ` · ${city}` : " по всей Черногории"}`}
              {meta?.demo && (
                <span className="demo-tag">
                  {meta.stats.imported ? "Локальная версия" : "Демо-каталог"}
                </span>
              )}
            </p>
          </div>
          <Link className="quiet-link" to="/requests">
            Смотреть заявки
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {!!meta?.stats.imported && (
          <div
            className="catalog-source-switch"
            role="group"
            aria-label="Источник предложений"
          >
            <button
              type="button"
              aria-pressed={!telegramOnly}
              onClick={() => update({ source: "" })}
            >
              Все предложения
            </button>
            <button
              type="button"
              aria-pressed={telegramOnly}
              onClick={() => update({ source: "telegram", sort: "newest" })}
            >
              <Send size={14} /> Из Telegram <span>{meta.stats.imported}</span>
            </button>
          </div>
        )}
        <div className="catalog-layout">
          <aside className="catalog-sidebar" aria-label="Фильтры каталога">
            {filterPanel}
          </aside>
          <div className="catalog-results" aria-busy={isFetching}>
            <div className="catalog-toolbar">
              <button
                className="button secondary mobile-filter-button"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={17} />
                Фильтры{chips.length > 0 && <span>{chips.length}</span>}
              </button>
              <label className="catalog-sort">
                <span>Показывать</span>
                <select
                  aria-label="Сортировка предложений"
                  value={sort}
                  onChange={(event) => update({ sort: event.target.value })}
                >
                  <option value="recommended">Рекомендуем</option>
                  <option value="rating">По рейтингу</option>
                  <option value="price">Сначала дешевле</option>
                  <option value="price_desc">Сначала дороже</option>
                  <option value="newest">Сначала новые</option>
                </select>
              </label>
              <div
                className="view-switch"
                role="group"
                aria-label="Вид каталога"
              >
                {["grid", "list"].map((mode) => (
                  <button
                    key={mode}
                    aria-label={mode === "grid" ? "Плитка" : "Список"}
                    aria-pressed={view === mode}
                    onClick={() => {
                      setView(mode);
                      try {
                        localStorage.setItem("blizu.catalog-view", mode);
                      } catch {}
                    }}
                  >
                    {mode === "grid" ? (
                      <LayoutGrid size={17} />
                    ) : (
                      <List size={18} />
                    )}
                  </button>
                ))}
              </div>
            </div>
            {chips.length > 0 && (
              <div className="discovery-filter-chips">
                {chips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={chip.clear}
                    aria-label={`Убрать фильтр: ${chip.label}`}
                  >
                    {chip.label}
                    <X size={13} />
                  </button>
                ))}
              </div>
            )}
            {isPending ? (
              <div className="market-grid">
                {Array.from({ length: 6 }, (_, i) => (
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
              <div
                className={`market-grid ${view === "list" ? "market-list" : ""}`}
              >
                {data.items.map((item) => (
                  <ListingCard
                    key={item.id}
                    listing={item}
                    compared={market.compared.some(
                      (other) => other.id === item.id,
                    )}
                    onCompare={() => market.toggleCompare(item)}
                  />
                ))}
              </div>
            ) : (
              <Empty
                title="Кажется, здесь пока тихо"
                description="Попробуйте другой запрос, расширьте бюджет или расскажите о задаче — подходящие люди смогут откликнуться."
              >
                <div className="empty-actions">
                  <button className="button secondary" onClick={reset}>
                    Сбросить фильтры
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      create("request", {
                        title: q || undefined,
                        city: city === "Вся Черногория" ? undefined : city,
                      })
                    }
                  >
                    Создать заявку
                    <ArrowRight size={16} />
                  </button>
                </div>
              </Empty>
            )}
            {data && data.total > PAGE_SIZE && (
              <nav
                className="catalog-pagination"
                aria-label="Страницы каталога"
              >
                <button
                  className="button secondary"
                  disabled={page === 1 || isFetching}
                  onClick={() => {
                    update({ page: String(page - 1) });
                    scrollResults();
                  }}
                >
                  <ChevronLeft size={17} />
                  Назад
                </button>
                <span>
                  {page} / {Math.ceil(data.total / PAGE_SIZE)}
                </span>
                <button
                  className="button secondary"
                  disabled={page * PAGE_SIZE >= data.total || isFetching}
                  onClick={() => {
                    update({ page: String(page + 1) });
                    scrollResults();
                  }}
                >
                  Дальше
                  <ChevronRight size={17} />
                </button>
              </nav>
            )}
          </div>
        </div>
      </section>
      <section className="discovery-request-banner">
        <div>
          <span className="section-kicker">
            НЕ НУЖНО РАЗБИРАТЬСЯ ВО ВСЁМ САМОМУ
          </span>
          <h2>Нужна помощь с вашей задачей?</h2>
          <p>Расскажите о ней. Исполнители предложат свои условия.</p>
        </div>
        <button className="button primary" onClick={() => create("request")}>
          Рассказать о задаче
          <ArrowUpRight size={18} />
        </button>
      </section>
      {recent.items.length > 0 && (
        <section className="recent-section">
          <div className="discovery-section-heading">
            <div>
              <span className="section-kicker">
                ПРОДОЛЖИТЕ, ГДЕ ОСТАНОВИЛИСЬ
              </span>
              <h2>Вы недавно смотрели</h2>
            </div>
          </div>
          <div className="recent-grid">
            {recent.items.map((item) => (
              <Link key={item.id} to={`/listings/${item.id}`}>
                <img src={item.image} alt="" />
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {listingCity(item)} · {listingPrice(item)}
                  </span>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        </section>
      )}
      {requests.data?.items.some((item) => item.status === "open") && (
        <section className="discovery-open-requests">
          <div className="discovery-section-heading">
            <div>
              <span className="section-kicker">
                КОМУ-ТО ПРИГОДИТСЯ ВАШ ТАЛАНТ
              </span>
              <h2>Рядом нужна помощь</h2>
            </div>
            <Link className="quiet-link" to="/requests">
              Все заявки
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="discovery-request-grid">
            {requests.data.items
              .filter((item) => item.status === "open")
              .slice(0, 3)
              .map((item) => (
                <Link key={item.id} to={`/requests/${item.id}`}>
                  <span>
                    <MapPin size={13} />
                    {item.city}
                    <i>Открыта</i>
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <footer>
                    <strong>
                      {item.budget
                        ? `до ${euro(item.budget)}`
                        : "По договорённости"}
                    </strong>
                    <span>
                      {item.offerCount} откликов
                      <ArrowUpRight size={16} />
                    </span>
                  </footer>
                </Link>
              ))}
          </div>
        </section>
      )}
      <section className="discovery-how" id="how-it-works">
        <div>
          <span className="section-kicker">
            ПРОСТО. ПОНЯТНО. ПО-ЧЕЛОВЕЧЕСКИ.
          </span>
          <h2>
            Меньше забот.
            <br />
            <span>Больше жизни.</span>
          </h2>
          <Link className="quiet-link" to="/delivery">
            А если нужна доставка?
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {[
          {
            icon: Search,
            title: "Найдите или расскажите",
            text: "Выберите услугу в каталоге или создайте заявку с вашей задачей.",
          },
          {
            icon: MessageCircle,
            title: "Согласуйте детали",
            text: "Сравните отклики. Выберите исполнителя и зафиксируйте цену до начала работ.",
          },
          {
            icon: ShieldCheck,
            title: "Сохраняйте спокойствие",
            text: "Переписка и статусы остаются в заказе. Если возник спор, можно обратиться к арбитру.",
          },
        ].map((item, i) => (
          <div className="discovery-step" key={item.title}>
            <span>
              <item.icon size={21} />
              <small>0{i + 1}</small>
            </span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        ))}
      </section>
      {filtersOpen && (
        <Modal
          title="Фильтры предложений"
          onClose={() => setFiltersOpen(false)}
        >
          {filterPanel}
        </Modal>
      )}
    </div>
  );
}
