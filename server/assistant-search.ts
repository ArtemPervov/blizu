import { CATEGORIES, CITIES } from "../shared/types.js";
import { latinCities } from "../shared/market-locations.js";
import type { CatalogFilters } from "../shared/assistant-stream.js";
import { catalogTermForms, foldCatalogText } from "./catalog-keywords.js";

const command =
  /^(?:(?:пожалуйста|please|molim vas)[,\s]+)?(?:найди(?:те)?|поищи(?:те)?|покажи(?:те)?|подбери(?:те)?|открой(?:те)?|ищу|где (?:можно )?(?:найти|купить)|(?:мне )?нуж(?:ен|на|ны|но)|find|search for|show|open|looking for|where (?:can i|to) (?:find|buy)|pronađi|pokaži|otvori|tražim|gdje (?:naći|kupiti))(?=$|[\s,])/iu;
const listingPrefix =
  /^(?:объявлени[еяй]|предложени[еяй]|listings?|oglase?|ponude?)(?:\s+(?:по|про|о|об|с|for|about|za|o))?(?=$|\s)\s*/iu;
const cityMarker =
  /(?<![\p{L}\p{N}])(?:в(?:\s+городе)?|из|in|near|u|iz|kod)\s+/giu;
const budget =
  /(?<![\p{L}\p{N}])(?<bound>не дороже|до|от|up to|under|from|do|od)\s+(?<amount>\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)(?:\s*(?:€|евро|eur)(?!\p{L})|(?=\s*(?:$|[,.!?]|(?:до|от|в|in|u)\s)))/giu;
const appSection =
  /^(?:мои заказы|заказы|личный кабинет|профиль|избранное|помощь(?: с заказами)?|каталог|заявки|my orders|account|favorites|catalog|requests|narudžbe)$/iu;
const assistantRequest =
  /^(?:как|где|что|почему|можно|могу|подскажи(?:те)?|помоги(?:те)?|хочу|размести(?:ть)?|опубликуй(?:те)?|опубликовать|созда(?:й|йте|ть)|прода(?:ть|ю|м)|связаться|написать|войти|how|where|what|why|can|please|post|publish|create|sell|contact|kako|gdje|može|objaviti)(?=$|[\s,])/iu;

const cityNames = CITIES.filter((city) => city !== "Вся Черногория").flatMap(
  (city) =>
    [city, latinCities[city]].map((name) => ({ city, words: cityWords(name) })),
);

function cityWords(name: string) {
  return name.split(/[\s-]+/u).map(catalogTermForms);
}

function locationIn(text: string) {
  for (const marker of text.matchAll(cityMarker)) {
    const start = marker.index + marker[0].length;
    const name = /^\p{L}+(?:[\s-]+\p{L}+)?/u.exec(text.slice(start))?.[0];
    if (!name) continue;
    for (const label of new Set([name, name.split(/[\s-]+/u)[0]])) {
      const words = cityWords(label);
      const city = cityNames.find(
        ({ words: aliases }) =>
          aliases.length === words.length &&
          aliases.every((forms, index) =>
            forms.some((form) => words[index].includes(form)),
          ),
      )?.city;
      if (city) return { city, start: marker.index, end: start + label.length };
    }
  }
}

function categoryOf(query: string) {
  const term = foldCatalogText(query);
  if (
    ["авто", "машины", "автомобили", "cars", "vehicles", "vozila"].includes(
      term,
    )
  )
    return "auto";
  return CATEGORIES.find(
    ({ id, name, en, sr }) =>
      id !== "all" &&
      [name, en, sr].some((label) => foldCatalogText(label) === term),
  )?.id;
}

function searchTarget(message: string) {
  return message
    .replace(command, "")
    .replace(
      /^[,\s]*(?:(?:мне|нам|пожалуйста|me|us|please|mi|nam)[,\s]+)*/iu,
      "",
    )
    .replace(listingPrefix, "")
    .replace(/^(?:по|про|о|об|for|about|za)\s+/iu, "")
    .replace(/^[\s"«]+|[\s".?!»]+$/gu, "");
}

export function catalogFiltersIn(message: string): CatalogFilters {
  const filters: CatalogFilters = {};
  let target = searchTarget(message).replace(
    budget,
    (text, bound: string, amount: string) => {
      const value = Number(amount.replace(/\s/gu, "").replace(",", "."));
      if (value > 1_000_000) return text;
      if (/^(?:от|from|od)$/iu.test(bound)) filters.minPrice = value;
      else filters.maxPrice = value;
      return " ";
    },
  );
  const location = locationIn(target);
  if (location) {
    filters.city = location.city;
    target = target.slice(0, location.start) + " " + target.slice(location.end);
  }
  const explicitCategory =
    /(?:^|\s)(?:в категории|in category|u kategoriji)\s+(.+)$/iu.exec(target);
  const category = explicitCategory && categoryOf(explicitCategory[1].trim());
  if (category && explicitCategory) {
    filters.category = category;
    target = target.slice(0, explicitCategory.index);
  }
  const sort = [
    [
      "price",
      /(?:^|\s)(?:сам(?:ый|ую|ые|ое)\s+деш[её]в(?:ый|ую|ые|ое)|cheapest|по возрастанию цены|сначала деш[её]вые)(?=$|\s)/iu,
    ],
    ["price_desc", /(?:^|\s)(?:по убыванию цены|сначала дорогие)(?=$|\s)/iu],
    [
      "newest",
      /(?:^|\s)(?:сначала новые|сначала свежие|newest first)(?=$|\s)/iu,
    ],
  ] as const;
  for (const [id, pattern] of sort) {
    if (pattern.test(target)) {
      filters.sort = id;
      target = target.replace(pattern, " ");
      break;
    }
  }
  const query = target
    .trim()
    .replace(/^[,\s]+|[,\s]+$/gu, "")
    .replace(/\s{2,}/gu, " ");
  const broad = categoryOf(query);
  if (broad) filters.category = broad;
  else if (query && query.length <= 200) filters.q = query;
  return filters;
}

export function isCatalogCommand(message: string) {
  const prefix = command.exec(message)?.[0];
  if (!prefix) return false;
  const target = searchTarget(message);
  const asksForHelp =
    /(?:^|\s)нуж(?:ен|на|ны|но)$/iu.test(prefix) &&
    assistantRequest.test(target);
  return !appSection.test(target) && !asksForHelp;
}

export function isBareCatalogQuery(message: string) {
  return (
    /^[\p{L}\p{N}][\p{L}\p{N} +.-]{2,79}$/u.test(message) &&
    !appSection.test(message) &&
    !assistantRequest.test(message)
  );
}
