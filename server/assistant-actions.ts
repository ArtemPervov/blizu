import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CATEGORIES, CITIES, type Listing } from "../shared/types.js";
import {
  listingPriceUnits,
  type CatalogFilters,
  type ChatResult,
} from "../shared/assistant-stream.js";

const categories = CATEGORIES.filter((category) => category.id !== "all");
const category = z.enum(categories.map(({ id }) => id));
const city = z.enum(CITIES.filter((city) => city !== "Вся Черногория"));
const searchInput = z
  .strictObject({
    category: category.optional(),
    city: city.optional(),
    q: z.string().trim().max(80).optional(),
    minPrice: z.number().min(0).max(1000000).optional(),
    maxPrice: z.number().min(0).max(1000000).optional(),
    sort: z
      .enum(["recommended", "newest", "price", "price_desc", "rating"])
      .optional(),
  })
  .refine(
    ({ minPrice, maxPrice }) =>
      minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
  );
const draftInput = z.strictObject({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(5000),
  category,
  city,
  price: z.number().min(1).max(1000000),
  unit: z.enum(listingPriceUnits),
});

export type FindCatalogListings = (
  filters: CatalogFilters & { limit: number },
) => {
  items: Pick<Listing, "id" | "title" | "city" | "price" | "source">[];
  total: number;
};

export const assistantTools = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description:
        "Find public goods and services in the live Blizu catalog. Use for requests to find, show or open listings. When the user only mentions a category, pass the category ID alone. Use q for a short product, service or brand, with city, price and sort filters separately. Omit unspecified fields.",
      parameters: z.toJSONSchema(searchInput),
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_listing",
      description:
        "Prepare an editable draft of a sale or service listing when asked to create or publish it. Write title and description in the user's language and use only details they provided. Ask for missing facts such as city or price before calling. The form requires a price in euros and a suitable price unit. This tool prepares the form, without publishing it.",
      parameters: z.toJSONSchema(draftInput),
    },
  },
] as const;

const responses = {
  ru: {
    found: "Нашёл подходящие объявления в каталоге.",
    empty: "По этим условиям в каталоге пока нет объявлений.",
    draft:
      "Подготовил черновик. Проверьте детали в форме и нажмите «Опубликовать».",
    refine:
      "Уточните запрос. Можно указать товар, услугу, город или диапазон цен.",
    details:
      "Для черновика уточните, что предлагаете, в каком городе и по какой цене.",
  },
  en: {
    found: "I found matching listings in the catalog.",
    empty: "There are no listings matching these filters yet.",
    draft: "I prepared a draft. Review the form and choose Publish.",
    refine: "Please specify the item, service, city or price range.",
    details:
      "For the draft, please specify what you offer, the city and the price.",
  },
  me: {
    found: "Pronašao sam odgovarajuće oglase u katalogu.",
    empty: "U katalogu trenutno nema oglasa za ove filtere.",
    draft: "Pripremio sam nacrt. Provjerite podatke i izaberite Objavi.",
    refine: "Navedite proizvod, uslugu, grad ili raspon cijena.",
    details: "Za nacrt navedite šta nudite, grad i cijenu.",
  },
};

type Language = keyof typeof responses;

export function findCategory(message: string) {
  const match =
    /^(?:найди(?:те)?|покажи(?:те)?|открой(?:те)?|find|show|open|pronađi|pokaži|otvori)\s+(?:(?:объявлени[ея]|listings?|oglase?)\s+(?:(?:по|про|for|about|za)\s+)?)?(.+?)\s*[.!?]*$/iu.exec(
      message,
    );
  if (!match) return;
  const query = match[1].toLowerCase();
  if (
    ["авто", "машины", "автомобили", "cars", "vehicles", "vozila"].includes(
      query,
    )
  )
    return "auto";
  return categories.find(({ name, en, sr }) =>
    [name, en, sr].some((label) => label.toLowerCase() === query),
  )?.id;
}

export function catalogResult(
  find: FindCatalogListings,
  filters: CatalogFilters,
  language: Language,
): ChatResult {
  const { items, total } = find({ ...filters, limit: 4 });
  return {
    answer: total ? responses[language].found : responses[language].empty,
    action: {
      kind: "catalog",
      total,
      filters,
      listings: items.map(({ id, title, city, price, source }) => ({
        id,
        title,
        city,
        price: source?.priceKnown === false ? null : price,
      })),
    },
  };
}

export function runAssistantTool(
  call: { name: string; arguments: unknown },
  find: FindCatalogListings,
  language: Language,
): ChatResult | undefined {
  if (call.name === "search_catalog") {
    const filters = searchInput.safeParse(call.arguments);
    return filters.success
      ? catalogResult(find, filters.data, language)
      : { answer: responses[language].refine };
  }
  if (call.name === "prepare_listing") {
    const draft = draftInput.safeParse(call.arguments);
    return draft.success
      ? {
          answer: responses[language].draft,
          action: { kind: "listingDraft", id: randomUUID(), draft: draft.data },
        }
      : { answer: responses[language].details };
  }
}
