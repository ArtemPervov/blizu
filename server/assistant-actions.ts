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
const keywords = z.string().trim().min(1).max(200).optional();
const searchInput = z
  .strictObject({
    category: category.optional(),
    city: city.optional(),
    q: keywords,
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
const searchToolInput = z.object({ q: keywords });
const draftFields = {
  title: z.string().trim().min(5).max(120),
  category,
  city,
};
const listingInput = z.strictObject({
  ...draftFields,
  description: z.string().trim().min(20).max(5000),
  price: z.number().min(1).max(1000000),
  unit: z.enum(listingPriceUnits),
});
const requestInput = z.strictObject({
  ...draftFields,
  description: z.string().trim().min(15).max(5000),
  budget: z.number().min(0).max(1000000).default(0),
});

type DraftKind = "request" | "listing";

const russianDraftCommand =
  /(?<!\p{L})(?:созда(?:й|йте|ть)|сдела(?:й|йте|ть)|добав(?:ь|ьте|ить)|оформ(?:и|ите|ить)|подготов(?:ь|ьте|ить)|размест(?:и|ите|ить)|под(?:ай|айте|ать)|хочу|опублику(?:й|йте)|опубликовать)[,\s]+(?:(?:мне|пожалуйста|новую|новое|мою|мо[ёе])[,\s]+)*(заяв(?:к[ауи]|ок)|объявлени[ея]|предложени[ея])(?!\p{L})/iu;

export function draftKindIn(text: string): DraftKind | undefined {
  if (/^(?:как|где|how|where|kako|gdje)(?=\s)/iu.test(text)) return;
  const russian = russianDraftCommand.exec(text)?.[1];
  if (russian) return /^заяв/iu.test(russian) ? "request" : "listing";

  if (
    /\b(?:create|post|submit|draft)\s+(?:(?:a|my|new)\s+)*(?:service\s+)?request\b|\b(?:napravi|objavi|podnesi)\s+(?:novi\s+)?zahtjev\b/iu.test(text)
  ) return "request";
  if (
    /\b(?:create|post|publish|draft)\s+(?:(?:a|my|new)\s+)*listing\b|\b(?:napravi|objavi)\s+(?:novi\s+)?oglas\b/iu.test(text)
  ) return "listing";
}

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
        "Find public goods and services in the live Blizu catalog. Use for requests to find, show or open listings, including a bare product or service name. Pass short keywords the user actually mentioned. The app applies cities and prices explicitly given by the user.",
      parameters: z.toJSONSchema(searchToolInput),
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_listing",
      description:
        "Prepare an editable draft of a sale or service listing when asked to create or publish it. Write title and description in the user's language and use only details they provided. Ask for missing facts such as city or price before calling. The form requires a price in euros and a suitable price unit. This tool prepares the form, without publishing it.",
      parameters: z.toJSONSchema(listingInput),
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_request",
      description:
        "Draft a service request ('заявка', 'zahtjev') for a user who needs someone to do work, such as a repair or cleaning. Write the title and description using their own requirements. Ask them for the task and city if missing. Leave the budget at 0 if they did not specify one. The user reviews and submits the form.",
      parameters: z.toJSONSchema(requestInput, { io: "input" }),
    },
  },
] as const;

const responses = {
  ru: {
    found: "Нашёл подходящие объявления в каталоге.",
    empty: "По этим условиям в каталоге пока нет объявлений.",
    draft:
      "Подготовил черновик. Проверьте детали в форме и нажмите «Опубликовать».",
    request:
      "Подготовил черновик заявки. Проверьте детали и отправьте её из формы.",
    requestDetails:
      "Расскажите, что нужно сделать и в каком городе. Бюджет можно указать по желанию.",
    refine:
      "Уточните запрос. Можно указать товар, услугу, город или диапазон цен.",
    details:
      "Для черновика уточните, что предлагаете, в каком городе и по какой цене.",
  },
  en: {
    found: "I found matching listings in the catalog.",
    empty: "There are no listings matching these filters yet.",
    draft: "I prepared a draft. Review the form and choose Publish.",
    request: "I drafted your request. Review the details and submit the form.",
    requestDetails:
      "What do you need help with, and in which city? You can also add a budget.",
    refine: "Please specify the item, service, city or price range.",
    details:
      "For the draft, please specify what you offer, the city and the price.",
  },
  me: {
    found: "Pronašao sam odgovarajuće oglase u katalogu.",
    empty: "U katalogu trenutno nema oglasa za ove filtere.",
    draft: "Pripremio sam nacrt. Provjerite podatke i izaberite Objavi.",
    request:
      "Pripremio sam nacrt zahtjeva. Provjerite podatke i pošaljite obrazac.",
    requestDetails:
      "Navedite šta vam treba i u kojem gradu. Možete dodati i budžet.",
    refine: "Navedite proizvod, uslugu, grad ili raspon cijena.",
    details: "Za nacrt navedite šta nudite, grad i cijenu.",
  },
};

type Language = keyof typeof responses;

export function catalogResult(
  find: FindCatalogListings,
  filters: CatalogFilters,
  language: Language,
): ChatResult {
  const validated = searchInput.safeParse(filters);
  if (!validated.success || Object.keys(filters).length === 0) {
    return { answer: responses[language].refine };
  }
  const { items, total } = find({ ...validated.data, limit: 4 });
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
  userFilters: CatalogFilters,
  draftKind?: DraftKind,
): ChatResult | undefined {
  if (call.name === "search_catalog") {
    const keywords = searchToolInput.safeParse(call.arguments);
    return keywords.success
      ? catalogResult(
          find,
          { ...userFilters, ...(keywords.data.q && { q: keywords.data.q }) },
          language,
        )
      : { answer: responses[language].refine };
  }
  if (call.name === "prepare_listing") {
    if (draftKind === "request")
      return { answer: responses[language].requestDetails };
    const draft = listingInput.safeParse(call.arguments);
    return draft.success
      ? {
          answer: responses[language].draft,
          action: { kind: "listingDraft", id: randomUUID(), draft: draft.data },
        }
      : { answer: responses[language].details };
  }
  if (call.name === "prepare_request") {
    if (draftKind === "listing") return { answer: responses[language].details };
    const draft = requestInput.safeParse(call.arguments);
    return draft.success
      ? {
          answer: responses[language].request,
          action: { kind: "requestDraft", id: randomUUID(), draft: draft.data },
        }
      : { answer: responses[language].requestDetails };
  }
}
