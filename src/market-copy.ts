import { CATEGORIES, CITIES } from "../shared/types";
import { latinCities } from "../shared/market-locations";
import type { Language } from "./lib";

export const orderHelpPath = "/order-help";
export const allMontenegro = "Вся Черногория";
export const localCities = CITIES.filter((city) => city !== allMontenegro);

export function catalogCities(params: URLSearchParams): string[] {
  const values = params.get("cities")?.split(",") ?? params.getAll("city");
  return localCities.filter((city) => values.includes(city));
}

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
