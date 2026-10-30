import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "../shared/types";

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
export const euro = (value: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
export const date = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
type Language = "ru" | "en" | "sr";
const dictionary = {
  ru: {
    services: "Услуги и товары",
    requests: "Ищу исполнителя",
    delivery: "Доставка",
    how: "Как это работает",
    login: "Войти",
    create: "Разместить",
    near: "Ваши люди в Черногории",
    hero1: "Всё нужное.",
    hero2: "Совсем рядом.",
    intro:
      "Найдите своего мастера, закажите домашний обед или доставьте посылку. Больше жизни — меньше поисков.",
    search: "Что вы ищете?",
    find: "Найти",
    everywhere: "Вся Черногория",
    popular: "Популярное рядом",
    catalog: "Услуги и товары",
    all: "Все предложения",
    favorites: "Избранное",
    orders: "Мои дела",
    newRequest: "Создать заявку",
    from: "от",
    details: "Подробнее",
    empty: "Пока ничего не нашлось",
    emptyHint: "Попробуйте другой город, категорию или поисковый запрос.",
    reset: "Сбросить фильтры",
  },
  en: {
    services: "Services & goods",
    requests: "Find a specialist",
    delivery: "Delivery",
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
    all: "All listings",
    favorites: "Saved",
    orders: "My activity",
    newRequest: "Create a request",
    from: "from",
    details: "View details",
    empty: "No matches yet",
    emptyHint: "Try a different city, category or search term.",
    reset: "Reset filters",
  },
  sr: {
    services: "Usluge i proizvodi",
    requests: "Tražim majstora",
    delivery: "Dostava",
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
    all: "Sve ponude",
    favorites: "Sačuvano",
    orders: "Moje aktivnosti",
    newRequest: "Kreiraj zahtjev",
    from: "od",
    details: "Detaljnije",
    empty: "Još nema rezultata",
    emptyHint: "Pokušajte drugi grad, kategoriju ili termin.",
    reset: "Poništi filtere",
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
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const l = localStorage.getItem("blizu-language");
      return l === "en" || l === "sr" ? l : "ru";
    } catch {
      return "ru";
    }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("blizu-language", language);
    } catch {}
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
const ToastContext = createContext<(text: string) => void>(null!);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={setToast}>
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
