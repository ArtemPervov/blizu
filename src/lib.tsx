import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "../shared/types";
import { Check, CircleAlert, X } from "lucide-react";
import { BrandSpark } from "./components/BrandIllustration";
import { translateUi } from "./ui-translations";

export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const form = options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(!form && options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Нет соединения с сервером. Проверьте подключение и попробуйте снова.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Сервис временно недоступен. Попробуйте ещё раз чуть позже.",
    );
  }
  if (!response.ok)
    throw new Error(result.error ?? "Не удалось выполнить запрос.");
  return result as T;
}
export const json = (data: unknown) => JSON.stringify(data);
const locales = { ru: "ru-RU", en: "en-IE", me: "sr-Latn-ME" } as const;
export function preferredLanguage(): Language {
  try {
    const selected = localStorage.getItem("blizu-language");
    return selected === "me" || selected === "sr"
      ? "me"
      : selected === "en"
        ? "en"
        : "ru";
  } catch {
    return "ru";
  }
}
const numbers = new Map<Language, Intl.NumberFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();
export function euro(value: number, language = preferredLanguage()) {
  let format = numbers.get(language);
  if (!format) {
    format = new Intl.NumberFormat(locales[language], {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
    numbers.set(language, format);
  }
  return format.format(value);
}
export function date(
  value: string,
  variant: "time" | "short" | "long" = "time",
) {
  const language = preferredLanguage();
  const key = `${language}-${variant}`;
  let format = dates.get(key);
  if (!format) {
    const options: Intl.DateTimeFormatOptions =
      variant === "long"
        ? { dateStyle: "long" }
        : variant === "short"
          ? { day: "numeric", month: "short" }
          : {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            };
    format = new Intl.DateTimeFormat(locales[language], options);
    dates.set(key, format);
  }
  return format.format(new Date(value));
}
export const plural = (n: number, forms: [string, string, string]) =>
  forms[
    n % 100 >= 11 && n % 100 <= 14
      ? 2
      : n % 10 === 1
        ? 0
        : n % 10 >= 2 && n % 10 <= 4
          ? 1
          : 2
  ];
export type Language = "ru" | "en" | "me";
const dictionary = {
  ru: {
    services: "Услуги и товары",
    requests: "Ищу исполнителя",
    delivery: "Доставка",
    orderHelp: "Помощь с заказами",
    orderHelpShort: "Закупки",
    demoListings: "Демо-примеры",
    demoLabel: "Демо",
    how: "Как это работает",
    login: "Войти",
    create: "Разместить",
    near: "Для жизни в Черногории",
    hero1: "Всё нужное.",
    hero2: "Совсем рядом.",
    intro:
      "Найдите своего мастера, закажите домашний обед или доставьте посылку. Больше жизни — меньше поисков.",
    search: "Что вы ищете?",
    find: "Найти",
    everywhere: "Вся Черногория",
    popular: "Популярное рядом",
    catalog: "Услуги и товары",
    catalogIntro: "Местные услуги, товары и хорошие люди в Черногории.",
    catalogHeading: "Найдите своего человека",
    searchPlaceholder: "Что вы ищете?",
    searchCity: "Город поиска",
    findListings: "Найти предложения",
    searchResults: "Результаты поиска",
    categories: "Категории предложений",
    deliveryPrompt: "Покупка издалека?",
    deliveryAction: "Закажите доставку",
    deliveryMarketplaces: "Доставка с Temu и других сайтов",
    needHelp: "Нужна помощь с задачей?",
    createRequestPrompt: "Создайте заявку",
    filters: "Фильтры",
    filterCategory: "Категория",
    filterCity: "Город",
    cost: "Стоимость",
    applyFilters: "Применить фильтры",
    refreshingListings: "Обновляем предложения…",
    listingsCount: (n: number) =>
      `${n} ${plural(n, ["предложение", "предложения", "предложений"])}`,
    sortListings: "Сортировка предложений",
    filterSort: "Сортировка",
    listingSource: "Источник",
    showResults: "Показать",
    askPrice: "Уточнить цену",
    pricesInDescription: "Цены в описании",
    recommended: "Рекомендуем",
    byRating: "По рейтингу",
    priceAsc: "Сначала дешевле",
    priceDesc: "Сначала дороже",
    newest: "Сначала новые",
    viewRequests: "Смотреть заявки",
    fromTelegram: "Из Telegram",
    searchCityUnknown: "Город уточните у автора",
    backToSaved: "К избранному",
    backToList: "К списку",
    listingBack: "Назад",
    shareListing: "Поделиться объявлением",
    listingLink: "Ссылка на объявление",
    linkCopied: "Ссылка скопирована",
    similarListings: "Похожие объявления",
    openTelegram: "Открыть в Telegram",
    contactSeller: "Связаться",
    all: "Все предложения",
    favorites: "Избранное",
    orders: "Мои дела",
    myOrders: "Мои заказы",
    home: "Главная",
    mobileNav: "Мобильная навигация",
    requestsShort: "Заявки",
    newListing: "Добавить объявление",
    newRequest: "Создать заявку",
    from: "от",
    details: "Подробнее",
    empty: "Пока ничего не нашлось",
    emptyHint: "Попробуйте другой город, категорию или поисковый запрос.",
    reset: "Сбросить",
  },
  en: {
    services: "Services & goods",
    requests: "Find a specialist",
    delivery: "Delivery",
    orderHelp: "Help with orders",
    orderHelpShort: "Order help",
    demoListings: "Demo examples",
    demoLabel: "Demo",
    how: "How it works",
    login: "Sign in",
    create: "Post",
    near: "Your people in Montenegro",
    hero1: "Everything you need.",
    hero2: "Closer than you think.",
    intro:
      "Find your specialist, order a homemade meal or get a parcel delivered. More living, less searching.",
    search: "What are you looking for?",
    find: "Search",
    everywhere: "All Montenegro",
    popular: "Discover nearby",
    catalog: "Services & goods",
    catalogIntro: "Find local services and goods in Montenegro.",
    catalogHeading: "Find what you need locally",
    searchPlaceholder: "What do you need?",
    searchCity: "Search city",
    findListings: "Search listings",
    searchResults: "Search results",
    categories: "Listing categories",
    deliveryPrompt: "Buying from abroad?",
    deliveryAction: "Arrange delivery",
    deliveryMarketplaces: "Delivery from Temu and other sites",
    needHelp: "Need a hand?",
    createRequestPrompt: "Post a request",
    filters: "Filters",
    filterCategory: "Category",
    filterCity: "City",
    cost: "Price",
    applyFilters: "Apply filters",
    refreshingListings: "Updating listings…",
    listingsCount: (n: number) => `${n} ${n === 1 ? "listing" : "listings"}`,
    sortListings: "Sort listings",
    filterSort: "Sort",
    listingSource: "Source",
    showResults: "Show results",
    askPrice: "Ask for price",
    pricesInDescription: "Prices in description",
    recommended: "Recommended",
    byRating: "Top rated",
    priceAsc: "Lowest price",
    priceDesc: "Highest price",
    newest: "Newest first",
    viewRequests: "Browse requests",
    fromTelegram: "From Telegram",
    searchCityUnknown: "Ask the seller for their city",
    backToSaved: "Back to saved",
    backToList: "Back to listings",
    listingBack: "Back",
    shareListing: "Share listing",
    listingLink: "Listing link",
    linkCopied: "Link copied",
    similarListings: "Similar listings",
    openTelegram: "Open in Telegram",
    contactSeller: "Contact seller",
    all: "All listings",
    favorites: "Saved",
    orders: "My activity",
    myOrders: "My orders",
    home: "Home",
    mobileNav: "Mobile navigation",
    requestsShort: "Requests",
    newListing: "Post a listing",
    newRequest: "Create a request",
    from: "from",
    details: "View details",
    empty: "No matches yet",
    emptyHint: "Try a different city, category or search term.",
    reset: "Reset",
  },
  me: {
    services: "Usluge i proizvodi",
    requests: "Tražim majstora",
    delivery: "Dostava",
    orderHelp: "Pomoć pri naručivanju",
    orderHelpShort: "Kupovina",
    demoListings: "Demo primjeri",
    demoLabel: "Demo",
    how: "Kako funkcioniše",
    login: "Prijava",
    create: "Objavi",
    near: "Vaši ljudi u Crnoj Gori",
    hero1: "Sve što vam treba.",
    hero2: "Sasvim blizu.",
    intro:
      "Pronađite majstora, naručite domaći ručak ili dostavu paketa. Više života, manje traženja.",
    search: "Šta tražite?",
    find: "Pretraži",
    everywhere: "Cijela Crna Gora",
    popular: "Istražite u blizini",
    catalog: "Usluge i proizvodi",
    catalogIntro: "Pronađite lokalne usluge i proizvode u Crnoj Gori.",
    catalogHeading: "Pronađite ono što vam treba",
    searchPlaceholder: "Šta vam treba?",
    searchCity: "Grad pretrage",
    findListings: "Pretraži oglase",
    searchResults: "Rezultati pretrage",
    categories: "Kategorije oglasa",
    deliveryPrompt: "Kupujete iz inostranstva?",
    deliveryAction: "Dogovorite dostavu",
    deliveryMarketplaces: "Dostava sa Temua i drugih sajtova",
    needHelp: "Treba vam pomoć?",
    createRequestPrompt: "Objavite zahtjev",
    filters: "Filteri",
    filterCategory: "Kategorija",
    filterCity: "Grad",
    cost: "Cijena",
    applyFilters: "Primijeni filtere",
    refreshingListings: "Osvježavamo oglase…",
    listingsCount: (n: number) =>
      `${n} ${n % 10 === 1 && n % 100 !== 11 ? "oglas" : "oglasa"}`,
    sortListings: "Sortiranje oglasa",
    filterSort: "Sortiranje",
    listingSource: "Izvor",
    showResults: "Prikaži",
    askPrice: "Pitajte za cijenu",
    pricesInDescription: "Cijene u opisu",
    recommended: "Preporučeno",
    byRating: "Po ocjeni",
    priceAsc: "Najniža cijena",
    priceDesc: "Najviša cijena",
    newest: "Najnoviji prvo",
    viewRequests: "Pogledajte zahtjeve",
    fromTelegram: "Sa Telegrama",
    searchCityUnknown: "Pitajte autora za grad",
    backToSaved: "Nazad na sačuvano",
    backToList: "Nazad na oglase",
    listingBack: "Nazad",
    shareListing: "Podijeli oglas",
    listingLink: "Link do oglasa",
    linkCopied: "Link je kopiran",
    similarListings: "Slični oglasi",
    openTelegram: "Otvori u Telegramu",
    contactSeller: "Kontaktiraj autora",
    all: "Sve ponude",
    favorites: "Sačuvano",
    orders: "Moje aktivnosti",
    myOrders: "Moje narudžbe",
    home: "Početna",
    mobileNav: "Mobilna navigacija",
    requestsShort: "Zahtjevi",
    newListing: "Objavi oglas",
    newRequest: "Kreiraj zahtjev",
    from: "od",
    details: "Detaljnije",
    empty: "Još nema rezultata",
    emptyHint: "Pokušajte drugi grad, kategoriju ili termin.",
    reset: "Poništi",
  },
};
type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  demoLogin: (role: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User | null }>("/auth/me"),
    retry: false,
  });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["me"] });
  };
  const setAuth = async (path: string, body: unknown) => {
    const result = await api<{ user: User }>(path, {
      method: "POST",
      body: json(body),
    });
    await qc.cancelQueries();
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    qc.setQueryData(["me"], result);
  };
  return (
    <AuthContext.Provider
      value={{
        user: data?.user ?? null,
        loading: isPending,
        refresh,
        login: (email, password) => setAuth("/auth/login", { email, password }),
        demoLogin: (role) => setAuth("/auth/demo", { role }),
        logout: async () => {
          await api("/auth/logout", { method: "POST" });
          await qc.cancelQueries();
          qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
          qc.setQueryData(["me"], { user: null });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
const I18nContext = createContext<{
  language: Language;
  setLanguage: (l: Language) => void;
  t: typeof dictionary.ru;
}>(null!);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(preferredLanguage);
  const setLanguage = (next: Language) => {
    try {
      localStorage.setItem("blizu-language", next);
    } catch {}
    setLanguageState(next);
  };
  useEffect(() => {
    document.documentElement.lang =
      language === "me" ? "cnr-Latn-ME" : language;
    document.title = `blizu — ${dictionary[language].services}`;
  }, [language]);
  return (
    <I18nContext.Provider
      value={{ language, setLanguage, t: dictionary[language] }}
    >
      {children}
    </I18nContext.Provider>
  );
}
export const useI18n = () => useContext(I18nContext);
export function useUiText() {
  const { language } = useI18n();
  return (source: string, ...values: (string | number)[]) =>
    translateUi(language, source, ...values);
}
type ToastTone = "info" | "success" | "error";
const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(
  null!,
);
export function ToastProvider({ children }: { children: ReactNode }) {
  const tr = useUiText();
  const [toast, setToast] = useState<{
    id: number;
    text: string;
    tone: ToastTone;
  } | null>(null);
  const serial = useRef(0);
  const notify = useCallback(
    (text: string, tone: ToastTone = "info") =>
      setToast(text ? { id: ++serial.current, text, tone } : null),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div
          className="toast glass-panel"
          key={toast.id}
          data-tone={toast.tone}
        >
          <span className="toast-mark" aria-hidden="true">
            {toast.tone === "success" ? (
              <Check size={17} />
            ) : toast.tone === "error" ? (
              <CircleAlert size={17} />
            ) : (
              <BrandSpark />
            )}
          </span>
          <span role={toast.tone === "error" ? "alert" : "status"}>
            {tr(toast.text)}
          </span>
          <button
            aria-label={tr("Закрыть уведомление")}
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
          <span className="toast-lifetime" aria-hidden="true" />
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
