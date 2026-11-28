import { useUiText } from "./lib";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
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
import { CATEGORIES, type Listing, type ServiceRequest } from "../shared/types";
import { api, euro, plural, useI18n } from "./lib";
import { useMarket } from "./market-state";
import { Brand, Empty, ErrorState, ListingCard, Modal } from "./components/ui";
import type { CreateAction } from "./App";
import { useAvailableListings } from "./available-listings";
import { AdriaticLight } from "./components/AdriaticLight";
import { MobileSearchPrompt } from "./components/MobileSearchPrompt";
import { SearchCityPicker } from "./components/SearchCityPicker";
import { LanguagePicker, ThemeToggle } from "./components/AppearanceControls";
import { listingCity, listingPrice } from "./listing-format";
import {
  allMontenegro,
  catalogCities,
  categoryName,
  cityName,
  orderHelpPath,
} from "./market-copy";

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
  delivery: "Помощь с заказами",
};
const mobileCategoryNames = {
  all: { ru: "Все", en: "All", me: "Sve" },
  repair: { ru: "Ремонт", en: "Repairs", me: "Popravke" },
  food: { ru: "Еда", en: "Food", me: "Hrana" },
  auto: { ru: "Авто", en: "Cars", me: "Auto" },
  beauty: { ru: "Красота", en: "Beauty", me: "Ljepota" },
  business: { ru: "Документы", en: "Business", me: "Posao" },
  goods: { ru: "Товары", en: "Goods", me: "Roba" },
  delivery: { ru: "Заказы", en: "Orders", me: "Narudžbe" },
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
  create,
  meta,
}: {
  create: CreateAction;
  meta?: {
    demo: boolean;
    deliveryEnabled: boolean;
    stats: {
      listings: number;
      providers: number;
      requests: number;
      imported?: number;
    };
  };
}) {
  const tr = useUiText();
  const { language, t } = useI18n();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const cities = catalogCities(params);
  const selectedCities = cities.join(",");
  const city = cities.length === 1 ? cities[0] : allMontenegro;
  const citySummary = cities.length
    ? cities.map((item) => cityName(item, language)).join(", ")
    : t.everywhere;
  const q = (params.get("q") || "").slice(0, 200);
  const telegramOnly = params.get("source") === "telegram";
  const demoOnly = !!meta?.demo && params.get("source") === "demo";
  const filteredSource = telegramOnly ? "telegram" : demoOnly ? "demo" : "";
  const pageSize = demoOnly ? 20 : PAGE_SIZE;
  const deliveryEnabled = meta?.deliveryEnabled === true;
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
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [minDraft, setMinDraft] = useState(min),
    [maxDraft, setMaxDraft] = useState(max),
    [priceError, setPriceError] = useState("");
  const [mobileFilters, setMobileFilters] = useState<{
    category: string;
    cities: string[];
    rated: boolean;
    verified: boolean;
    sort: string;
    source: string;
  } | null>(null);
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
  useEffect(() => {
    if (location.hash === "#catalog" && !location.state?.restoreListing) {
      document.getElementById("catalog")?.scrollIntoView({ block: "start" });
    }
  }, [location.hash, location.state]);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    setMinDraft(min);
    setMaxDraft(max);
    setPriceError("");
  }, [min, max]);
  const query = new URLSearchParams({
    q,
    category,
    ...(selectedCities ? { cities: selectedCities } : {}),
    sort,
    ...(filteredSource ? { source: filteredSource } : {}),
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
    ...(min ? { minPrice: min } : {}),
    ...(max ? { maxPrice: max } : {}),
    ...(verified ? { verified: "1" } : {}),
    ...(rated ? { minRating: "4.5" } : {}),
  });
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["listings", query.toString()],
    queryFn: ({ signal }) =>
      api<{ items: Listing[]; total: number }>(`/listings?${query}`, {
        signal,
      }),
    placeholderData: keepPreviousData,
  });
  const requests = useQuery({
    queryKey: ["discovery-requests", selectedCities],
    queryFn: () =>
      api<{ items: ServiceRequest[] }>(
        `/requests?${new URLSearchParams({ cities: selectedCities })}`,
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
      setPriceError(tr("Цена «от» не должна быть больше цены «до»."));
      return;
    }
    setPriceError("");
    update({
      minPrice: minDraft,
      maxPrice: maxDraft,
      ...(mobileFilters && {
        category: mobileFilters.category,
        city: "",
        cities: mobileFilters.cities.join(","),
        minRating: mobileFilters.rated ? "4.5" : "",
        verified: mobileFilters.verified ? "1" : "",
        sort: mobileFilters.sort === "recommended" ? "" : mobileFilters.sort,
        source: mobileFilters.source,
      }),
    });
    setMobileFilters(null);
    if (mobileFilters) scrollResults();
  };
  const chips = [
    ...(filteredSource
      ? [
          {
            label: telegramOnly ? t.fromTelegram : t.demoListings,
            clear: () => update({ source: "" }),
          },
        ]
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
            label: categoryName(category, language)!,
            clear: () => update({ category: "" }),
          },
        ]
      : []),
    ...cities.map((item) => ({
      label: cityName(item, language),
      clear: () =>
        update({
          city: "",
          cities: cities.filter((value) => value !== item).join(","),
        }),
    })),
    ...(min || max
      ? [
          {
            label: `${min ? tr("от {0}", min) : ""}${min && max ? " " : ""}${max ? tr("до {0}", max) : ""} €`,
            clear: () => update({ minPrice: "", maxPrice: "" }),
          },
        ]
      : []),
    ...(verified
      ? [
          {
            label: tr("С отметкой профиля"),
            clear: () => update({ verified: "" }),
          },
        ]
      : []),
    ...(rated
      ? [
          {
            label: tr("Рейтинг от 4,5"),
            clear: () => update({ minRating: "" }),
          },
        ]
      : []),
  ];
  const filterCount =
    chips.length - Number(!!q) + Number(sort !== "recommended");
  const sortingOptions = [
    ["recommended", t.recommended],
    ["rating", t.byRating],
    ["price", t.priceAsc],
    ["price_desc", t.priceDesc],
    ["newest", t.newest],
  ];
  const categoryButtons = (selected: string, select: (id: string) => void) =>
    CATEGORIES.map((item) => {
      const Icon = icons[item.id];
      return (
        <button
          key={item.id}
          type="button"
          data-category={item.id}
          aria-label={categoryName(item.id, language)}
          aria-pressed={selected === item.id}
          onClick={() => select(item.id)}
        >
          <Icon size={21} strokeWidth={1.6} aria-hidden="true" />
          <span className="desktop-category-label">
            {language === "ru"
              ? shortNames[item.id]
              : categoryName(item.id, language)}
          </span>
          <span className="mobile-category-label">
            {mobileCategoryNames[item.id][language]}
          </span>
          {selected === item.id && <span className="category-active-dot" />}
        </button>
      );
    });
  const filterPanel = (draft: typeof mobileFilters = null) => (
    <div className="filter-panel">
      <div className="filter-panel-title">
        <h3>{tr("Точнее под вашу задачу")}</h3>
        <SlidersHorizontal size={17} />
      </div>
      <form onSubmit={applyPrice}>
        {draft && (
          <>
            <fieldset className="mobile-filter-categories">
              <legend>{t.filterCategory}</legend>
              <div className="category-tiles">
                {categoryButtons(draft.category, (id) =>
                  setMobileFilters({ ...draft, category: id }),
                )}
              </div>
            </fieldset>
            <SearchCityPicker
              className="mobile-filter-city"
              value={draft.cities}
              onChange={(cities) => setMobileFilters({ ...draft, cities })}
            />
          </>
        )}
        <fieldset aria-label={tr("Стоимость в евро")}>
          <legend>{t.cost}</legend>
          <div className="price-fields">
            <label>
              <span className="price-field-label">{tr("От")}</span>
              <span className="price-field-control">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  aria-label={tr("Минимальная цена")}
                  aria-invalid={!!priceError}
                  min={0}
                  max={1000000}
                  value={minDraft}
                  onChange={(event) => {
                    setMinDraft(event.target.value);
                    setPriceError("");
                  }}
                  placeholder="—"
                />
                <span aria-hidden="true">€</span>
              </span>
            </label>
            <label>
              <span className="price-field-label">{tr("До")}</span>
              <span className="price-field-control">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  aria-label={tr("Максимальная цена")}
                  aria-invalid={!!priceError}
                  min={0}
                  max={1000000}
                  value={maxDraft}
                  onChange={(event) => {
                    setMaxDraft(event.target.value);
                    setPriceError("");
                  }}
                  placeholder="—"
                />
                <span aria-hidden="true">€</span>
              </span>
            </label>
          </div>
          <p className="filter-hint">
            {tr("Укажите одну границу цены или обе.")}
          </p>
          {priceError && (
            <p className="form-error" role="alert">
              {priceError}
            </p>
          )}
        </fieldset>
        <fieldset>
          <legend>{tr("Больше уверенности")}</legend>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={draft?.rated ?? rated}
              onChange={(event) =>
                draft
                  ? setMobileFilters({ ...draft, rated: event.target.checked })
                  : update({ minRating: event.target.checked ? "4.5" : "" })
              }
            />
            <span>
              <Star size={16} />
              {tr("Рейтинг от 4,5")}
            </span>
          </label>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={draft?.verified ?? verified}
              onChange={(event) =>
                draft
                  ? setMobileFilters({
                      ...draft,
                      verified: event.target.checked,
                    })
                  : update({ verified: event.target.checked ? "1" : "" })
              }
            />
            <span>
              <BadgeCheck size={17} />
              {tr("С отметкой профиля")}
            </span>
          </label>
        </fieldset>
        {draft && (
          <div className="mobile-filter-selects">
            <label>
              <span>{t.filterSort}</span>
              <select
                value={draft.sort}
                onChange={(event) =>
                  setMobileFilters({ ...draft, sort: event.target.value })
                }
              >
                {sortingOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(!!meta?.stats.imported || meta?.demo || telegramOnly) && (
              <label>
                <span>{t.listingSource}</span>
                <select
                  value={draft.source}
                  onChange={(event) =>
                    setMobileFilters({ ...draft, source: event.target.value })
                  }
                >
                  <option value="">{t.all}</option>
                  {(!!meta?.stats.imported || telegramOnly) && (
                    <option value="telegram">{t.fromTelegram}</option>
                  )}
                  {meta?.demo && <option value="demo">{t.demoListings}</option>}
                </select>
              </label>
            )}
          </div>
        )}
        <div className={draft ? "mobile-filter-actions" : undefined}>
          {draft && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setMinDraft("");
                setMaxDraft("");
                setPriceError("");
                setMobileFilters({
                  category: "all",
                  cities: [],
                  rated: false,
                  verified: false,
                  sort: "recommended",
                  source: "",
                });
              }}
            >
              {t.reset}
            </button>
          )}
          <button
            className={draft ? "button primary full" : "button secondary full"}
            type="submit"
          >
            {draft ? t.showResults : t.applyFilters}
            {!draft && <ArrowRight size={15} />}
          </button>
        </div>
      </form>
      {!draft && chips.length > 0 && (
        <button
          className="filter-reset"
          onClick={() => {
            reset();
            setMobileFilters(null);
          }}
        >
          {tr("Сбросить всё")}
        </button>
      )}
      <div className="filter-help">
        <span className="filter-help-icon">
          <MessageCircle size={22} />
        </span>
        <h3>{tr("Проще рассказать?")}</h3>
        <p>{tr("Опишите задачу. Исполнители сами предложат цену и время.")}</p>
        <button
          onClick={() => {
            setMobileFilters(null);
            create("request", {
              city: city === "Вся Черногория" ? undefined : city,
              category: category === "all" ? undefined : category,
            });
          }}
        >
          {tr("Создать заявку")}
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
            {t.near}
          </div>
          <h1 id="discover-title">
            {t.hero1} <span>{t.hero2}</span>
          </h1>
          <p>{t.catalogIntro}</p>
          <div className="mobile-discovery-brand">
            <Brand />
            <div className="mobile-appearance">
              <LanguagePicker />
              <ThemeToggle />
            </div>
          </div>
          <form
            className="discovery-search glass-panel"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !search.trim() &&
                !q &&
                matchMedia("(max-width: 760px)").matches
              ) {
                searchInput.current?.focus();
                return;
              }
              find(search);
            }}
          >
            <label className="discovery-search-field">
              <Search size={21} />
              <span className="visually-hidden">{t.search}</span>
              <input
                ref={searchInput}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                maxLength={200}
                placeholder={t.searchPlaceholder}
                enterKeyHint="search"
                autoComplete="off"
              />
              <MobileSearchPrompt
                active={!search && !searchFocused && !mobileFilters}
                language={language}
              />
            </label>
            <SearchCityPicker
              className="discovery-city"
              value={cities}
              onChange={(value) =>
                update({ city: "", cities: value.join(",") })
              }
            />
            <button
              className="discovery-search-submit"
              type="submit"
              aria-label={t.findListings}
            >
              <span>{t.find}</span>
              <ArrowRight
                className="desktop-search-icon"
                size={18}
                aria-hidden="true"
              />
              <Search
                className="mobile-search-icon"
                size={20}
                aria-hidden="true"
              />
            </button>
            <button
              className="button secondary mobile-filter-button"
              type="button"
              aria-label={
                filterCount ? `${t.filters} (${filterCount})` : t.filters
              }
              aria-haspopup="dialog"
              aria-expanded={!!mobileFilters}
              onClick={() => {
                setMinDraft(min);
                setMaxDraft(max);
                setPriceError("");
                setMobileFilters({
                  category,
                  cities,
                  rated,
                  verified,
                  sort,
                  source: filteredSource,
                });
              }}
            >
              <SlidersHorizontal size={20} aria-hidden="true" />
              {filterCount > 0 && <span aria-hidden="true">{filterCount}</span>}
            </button>
          </form>
          <div className="discovery-suggestions">
            <span>
              {history.length ? (
                <>
                  <Clock3 size={13} />
                  {tr("Недавнее:")}
                </>
              ) : (
                tr("Например:")
              )}
            </span>
            {(history.length
              ? history.slice(0, 3)
              : [tr("Уборка"), tr("Домашняя еда"), tr("Кондиционер")]
            ).map((term) => (
              <button key={term} onClick={() => find(term)}>
                {term}
              </button>
            ))}
            {history.length > 0 && (
              <button
                className="clear-history"
                aria-label={tr("Очистить историю поиска")}
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
              {t.needHelp}{" "}
              <span>
                {t.createRequestPrompt}
                <ArrowUpRight size={14} />
              </span>
            </button>
            <span className="hero-link-divider" />
            {deliveryEnabled ? (
              <Link to="/delivery">
                <span>{t.deliveryPrompt}</span>{" "}
                <span>
                  <span>{t.deliveryAction}</span>
                  <ArrowUpRight size={14} />
                </span>
              </Link>
            ) : (
              <Link to={orderHelpPath}>
                <span>
                  <Package size={19} aria-hidden="true" />
                  <span className="hero-order-help">{t.orderHelp}</span>
                  <ArrowUpRight size={14} />
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>
      <nav
        className="discovery-categories category-tiles"
        aria-label={t.categories}
      >
        {categoryButtons(category, (id) => {
          update({ category: id });
          if (!matchMedia("(max-width: 760px)").matches) scrollResults();
        })}
      </nav>
      <section className="discovery-catalog" id="catalog">
        <div className="discovery-section-heading">
          <div>
            <span className="section-kicker">
              {tr("ПОЛЕЗНОЕ НА КАЖДЫЙ ДЕНЬ")}
            </span>
            <h2>
              {q
                ? t.searchResults
                : category !== "all"
                  ? categoryName(category, language)
                  : t.catalogHeading}
            </h2>
            <p aria-live="polite">
              {isFetching
                ? t.refreshingListings
                : `${t.listingsCount(data?.total ?? 0)} · ${citySummary}`}
              {meta?.demo && (
                <span className="demo-tag">
                  {meta.stats.imported
                    ? tr("Локальная версия")
                    : tr("Демо-каталог")}
                </span>
              )}
            </p>
          </div>
          <Link className="quiet-link" to="/requests">
            {t.viewRequests}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {(!!meta?.stats.imported || meta?.demo) && (
          <div
            className="catalog-source-switch"
            role="group"
            aria-label={tr("Источник предложений")}
          >
            <button
              type="button"
              aria-pressed={!filteredSource}
              onClick={() => update({ source: "" })}
            >
              {t.all}
            </button>
            {!!meta?.stats.imported && (
              <button
                type="button"
                aria-pressed={telegramOnly}
                onClick={() => update({ source: "telegram", sort: "newest" })}
              >
                <Send size={14} /> {t.fromTelegram}{" "}
                <span>{meta.stats.imported}</span>
              </button>
            )}
            {meta?.demo && (
              <button
                type="button"
                aria-pressed={demoOnly}
                onClick={() => update({ source: "demo" })}
              >
                {t.demoListings}
              </button>
            )}
          </div>
        )}
        <div className="catalog-layout">
          <aside
            className="catalog-sidebar"
            aria-label={tr("Фильтры каталога")}
          >
            {filterPanel()}
          </aside>
          <div className="catalog-results" aria-busy={isFetching}>
            <div className="catalog-toolbar">
              <label className="catalog-sort">
                <span>{tr("Показывать")}</span>
                <select
                  aria-label={t.sortListings}
                  value={sort}
                  onChange={(event) => update({ sort: event.target.value })}
                >
                  {sortingOptions.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="view-switch"
                role="group"
                aria-label={tr("Вид каталога")}
              >
                {["grid", "list"].map((mode) => (
                  <button
                    key={mode}
                    aria-label={mode === "grid" ? tr("Плитка") : tr("Список")}
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
                    aria-label={tr("Убрать фильтр: {0}", chip.label)}
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
                {data.items.map((item, index) => (
                  <ListingCard
                    key={item.id}
                    listing={item}
                    leadPhoto={index === 0}
                    compared={market.compared.some(
                      (other) => other.id === item.id,
                    )}
                    onCompare={() => market.toggleCompare(item)}
                  />
                ))}
              </div>
            ) : (
              <Empty
                title={tr("Кажется, здесь пока тихо")}
                description={tr(
                  "Попробуйте другой запрос, расширьте бюджет или расскажите о задаче — подходящие люди смогут откликнуться.",
                )}
              >
                <div className="empty-actions">
                  <button className="button secondary" onClick={reset}>
                    {tr("Сбросить фильтры")}
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
                    {tr("Создать заявку")}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </Empty>
            )}
            {data && data.total > pageSize && (
              <nav
                className="catalog-pagination"
                aria-label={tr("Страницы каталога")}
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
                  {tr("Назад")}
                </button>
                <span>
                  {page} / {Math.ceil(data.total / pageSize)}
                </span>
                <button
                  className="button secondary"
                  disabled={page * pageSize >= data.total || isFetching}
                  onClick={() => {
                    update({ page: String(page + 1) });
                    scrollResults();
                  }}
                >
                  {tr("Дальше")}
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
            {tr("НЕ НУЖНО РАЗБИРАТЬСЯ ВО ВСЁМ САМОМУ")}
          </span>
          <h2>{tr("Нужна помощь с вашей задачей?")}</h2>
          <p>{tr("Расскажите о ней. Исполнители предложат свои условия.")}</p>
        </div>
        <button className="button primary" onClick={() => create("request")}>
          {tr("Рассказать о задаче")}
          <ArrowUpRight size={18} />
        </button>
      </section>
      {recent.items.length > 0 && (
        <section className="recent-section">
          <div className="discovery-section-heading">
            <div>
              <span className="section-kicker">
                {tr("ПРОДОЛЖИТЕ, ГДЕ ОСТАНОВИЛИСЬ")}
              </span>
              <h2>{tr("Вы недавно смотрели")}</h2>
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
                {tr("КОМУ-ТО ПРИГОДИТСЯ ВАШ ТАЛАНТ")}
              </span>
              <h2>{tr("Рядом нужна помощь")}</h2>
            </div>
            <Link className="quiet-link" to="/requests">
              {tr("Все заявки")}
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
                    <i>{tr("Открыта")}</i>
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <footer>
                    <strong>
                      {item.budget
                        ? tr("до {0}", euro(item.budget))
                        : tr("По договорённости")}
                    </strong>
                    <span>
                      {item.offerCount} {tr("откликов")}
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
            {tr("ПРОСТО. ПОНЯТНО. ПО-ЧЕЛОВЕЧЕСКИ.")}
          </span>
          <h2>
            {tr("Меньше забот.")}
            <br />
            <span>{tr("Больше жизни.")}</span>
          </h2>
          <Link
            className="quiet-link"
            to={deliveryEnabled ? "/delivery" : orderHelpPath}
          >
            {deliveryEnabled ? tr("А если нужна доставка?") : t.orderHelp}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        {[
          {
            icon: Search,
            title: tr("Найдите или расскажите"),
            text: tr(
              "Выберите услугу в каталоге или создайте заявку с вашей задачей.",
            ),
          },
          {
            icon: MessageCircle,
            title: tr("Согласуйте детали"),
            text: tr(
              "Сравните отклики. Выберите исполнителя и зафиксируйте цену до начала работ.",
            ),
          },
          {
            icon: ShieldCheck,
            title: tr("Сохраняйте спокойствие"),
            text: tr(
              "Переписка и статусы остаются в заказе. Если возник спор, можно обратиться к арбитру.",
            ),
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
      {mobileFilters && (
        <Modal
          className="catalog-filter-sheet"
          title={t.filters}
          onClose={() => setMobileFilters(null)}
        >
          {filterPanel(mobileFilters)}
        </Modal>
      )}
    </div>
  );
}
