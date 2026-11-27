import { CATEGORIES } from "../shared/types";
import { latinCities } from "../shared/market-locations";
import type { Language } from "./lib";

export const orderHelpPath = "/?category=delivery#catalog";

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
