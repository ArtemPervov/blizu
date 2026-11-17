import { CATEGORIES, CITIES } from "../shared/types";
import type { Language } from "./lib";

export const orderHelpPath = "/?category=delivery#catalog";

const latinCities: Record<(typeof CITIES)[number], string> = {
  Бар: "Bar",
  Будва: "Budva",
  Котор: "Kotor",
  Тиват: "Tivat",
  Подгорица: "Podgorica",
  "Херцег-Нови": "Herceg Novi",
  Бечичи: "Bečići",
  Петровац: "Petrovac",
  Сутоморе: "Sutomore",
  Ульцинь: "Ulcinj",
  Цетине: "Cetinje",
  Никшич: "Nikšić",
  "Вся Черногория": "Cijela Crna Gora",
};

export function cityName(city: string, language: Language) {
  if (language === "ru") return city;
  if (city === "Вся Черногория" && language === "en") return "All Montenegro";
  return latinCities[city as keyof typeof latinCities] ?? city;
}

export function categoryName(id: string, language: Language) {
  const category = CATEGORIES.find((item) => item.id === id);
  return category?.[
    language === "ru" ? "name" : language === "me" ? "sr" : "en"
  ];
}
