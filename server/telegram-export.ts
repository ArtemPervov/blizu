import { createHash } from "node:crypto";

export const TELEGRAM_GROUP_ID = 1860715803;
export const TELEGRAM_CHANNEL = "montenegrobye";
export type TelegramMessage = {
  id: number;
  type: string;
  date_unixtime?: string;
  from?: string | null;
  from_id?: string;
  photo?: string;
  media_group_id?: string | number;
  text?: string | ({ text?: string } | string)[];
};
export type TelegramExport = {
  id: number;
  type: string;
  messages: TelegramMessage[];
};
export type ImportedAd = {
  messageId: number;
  title: string;
  description: string;
  authorName: string;
  postedAt: string;
  photos: string[];
  category: string;
  city: string;
  price: number;
  priceKnown: boolean;
  priceLabel: string;
  contentHash: string;
};
export function messageText(message: TelegramMessage) {
  return (
    typeof message.text === "string"
      ? message.text
      : (message.text ?? [])
          .map((part) => (typeof part === "string" ? part : (part.text ?? "")))
          .join("")
  )
    .replace(/\r\n?/g, "\n")
    .trim();
}
const cityPatterns: [string, RegExp][] = [
  ["Херцег-Нови", /херцег[\s-]*нов|herceg[\s-]*nov/iu],
  ["Подгорица", /подгориц|podgoric/iu],
  ["Бечичи", /бечич|becic|bečić/iu],
  ["Будва", /будв|budv/iu],
  ["Тиват", /тиват|tivat/iu],
  ["Котор", /(?:^|[^\p{L}])котор(?:[аеу])?(?:$|[^\p{L}])|\bkotor\b/iu],
  ["Бар", /(?:^|[^\p{L}])бар(?:е|а|у|ом)?(?:$|[^\p{L}])|\bbar\b/iu],
  ["Сутоморе", /сутомор|sutomor/iu],
  ["Ульцинь", /ульцин|ulcin/iu],
  ["Цетине", /цетин|cetin/iu],
  ["Никшич", /никшич|nikši|niksi/iu],
];
function categoryOf(text: string) {
  if (/доставк|посылк|перевоз.*груз|карго/iu.test(text)) return "delivery";
  if (
    /бров|маникюр|педикюр|ресниц|массаж|стрижк|косметолог|эпиляц/iu.test(text)
  )
    return "beauty";
  if (
    /ремонт|сантехник|электрик|монтаж|уборк|клининг|мастер на час/iu.test(text)
  )
    return "repair";
  if (
    /домашн.*(?:торт|ед|кухн)|торт.*заказ|выпечк|обед.*достав|пельмен.*заказ/iu.test(
      text,
    )
  )
    return "food";
  if (
    /консульств|боравак|бухгалтер|юрист|документ|переводчик|регистрац.*фирм/iu.test(
      text,
    )
  )
    return "business";
  if (
    /автомобил|машин[ауы].*(?:прод|аренд)|трансфер|пассажир|такси|визаран|автошин|резин.*(?:r\d|зимн)/iu.test(
      text,
    )
  )
    return "auto";
  return "goods";
}
export function adPrice(text: string) {
  const amounts = [
    ...text.matchAll(
      /(?<![\d.,])([\d]{1,6}(?:[ \u00a0]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|евро|eur\b)/giu,
    ),
  ]
    .map((match) =>
      Number(match[1].replace(/[ \u00a0]/g, "").replace(",", ".")),
    )
    .filter((amount) => amount > 0 && amount <= 1000000);
  const unique = [...new Set(amounts)];
  const otherCurrency = /(?:руб(?:лей|ля|ль)?|₽|\$|usd|доллар|динар)/iu.test(
    text,
  );
  if (
    !unique.length &&
    !otherCurrency &&
    /отда(?:м|ю|ём)[^\n.!?]{0,80}(?:бесплатно|даром|безвозмездно)|^[^\p{L}]*(?:бесплатно|даром)(?:\s|[.!:])/iu.test(
      text,
    )
  )
    return { price: 0, priceKnown: true, priceLabel: "Бесплатно" };
  // Multiple prices, currencies and old/new comparisons stay in the original text.
  if (unique.length !== 1 || otherCurrency)
    return {
      price: 0,
      priceKnown: false,
      priceLabel: unique.length ? "Цены в объявлении" : "Цена не указана",
    };
  return {
    price: unique[0],
    priceKnown: true,
    priceLabel: `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(unique[0])} €`,
  };
}
function isAd(text: string, hasPhoto: boolean) {
  if (text.length < 5 || text.length > 16000) return false;
  if (
    /^(?:[^\p{L}])*?(?:вс[её]\s+)?(?:продано|продана|проданы|закрыто|неактуально|не актуально)(?:$|[^\p{L}])/iu.test(
      text,
    )
  )
    return false;
  if (
    /казино|ставк[аи] на спорт|наркот|метадон|боевое оружие|огнестрельн/iu.test(
      text,
    )
  )
    return false;
  if (
    /^(?:здравствуйте|добрый день|подскажите|а где|сколько стоит|актуально\??|спасибо)[\s!,.?]*$/iu.test(
      text,
    )
  )
    return false;
  return (
    /прода[мюеё]|продажа|отда[мюеё]|куплю|покупа[юе]|ищ[уе]|аренд|услуг|запис[ьи]|мастер|достав|трансфер|бесплатно|€|евро|eur\b/iu.test(
      text,
    ) ||
    (hasPhoto && text.length >= 25)
  );
}
function titleOf(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^[^\p{L}\p{N}]+/u, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const line =
    lines.find((item) => item.length >= 12 && !/^https?:\/\//i.test(item)) ??
    lines[0] ??
    "Объявление из Telegram";
  return line.length <= 100
    ? line
    : `${line.slice(0, 96).replace(/\s+\S*$/, "")}…`;
}
export function selectTelegramAds(
  data: TelegramExport,
  limit = 100,
): ImportedAd[] {
  if (
    data.id !== TELEGRAM_GROUP_ID ||
    data.type !== "public_supergroup" ||
    !Array.isArray(data.messages)
  )
    throw new Error(
      "Ожидается JSON-экспорт группы montenegrobye (1860715803).",
    );
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Лимит должен быть от 1 до 100.");
  const messages = data.messages
    .filter(
      (message) =>
        message.type === "message" &&
        Number.isSafeInteger(message.id) &&
        Number.isFinite(Number(message.date_unixtime)),
    )
    .sort(
      (a, b) =>
        Number(a.date_unixtime) - Number(b.date_unixtime) || a.id - b.id,
    );
  const groups: {
    anchor: TelegramMessage;
    text: string;
    photos: string[];
    last: TelegramMessage;
  }[] = [];
  for (const message of messages) {
    const text = messageText(message),
      previous = groups.at(-1);
    const explicitAlbum =
      message.media_group_id !== undefined &&
      previous?.last.media_group_id === message.media_group_id;
    const adjacentPhotos = !!(
      message.photo &&
      previous?.photos.length &&
      message.from_id &&
      message.from_id === previous.last.from_id &&
      (!text || !previous.text) &&
      Number(message.date_unixtime) - Number(previous.last.date_unixtime) <=
        2 &&
      message.id - previous.last.id === 1
    );
    if (previous && (explicitAlbum || adjacentPhotos)) {
      if (message.photo) previous.photos.push(message.photo);
      if (text && !previous.text) {
        previous.text = text;
        previous.anchor = message;
      }
      previous.last = message;
    } else
      groups.push({
        anchor: message,
        text,
        photos: message.photo ? [message.photo] : [],
        last: message,
      });
  }
  const ads: ImportedAd[] = [],
    seen = new Set<string>();
  for (const group of groups.reverse()) {
    if (!isAd(group.text, group.photos.length > 0)) continue;
    const normalized = group.text
      .toLocaleLowerCase("ru")
      .replace(/[^\p{L}\p{N}]/gu, "");
    const key =
      normalized.length < 60
        ? `${normalized}|${group.photos[0] ?? ""}`
        : normalized;
    const contentHash = createHash("sha256").update(key).digest("hex");
    if (seen.has(contentHash)) continue;
    seen.add(contentHash);
    const cities = cityPatterns.filter(([, pattern]) =>
      pattern.test(group.text),
    );
    ads.push({
      messageId: group.anchor.id,
      title: titleOf(group.text),
      description: group.text,
      authorName: group.anchor.from?.trim().slice(0, 200) || "Автор объявления",
      postedAt: new Date(
        Number(group.anchor.date_unixtime) * 1000,
      ).toISOString(),
      photos: [...new Set(group.photos)].slice(0, 10),
      city: cities.length === 1 ? cities[0][0] : "Вся Черногория",
      category: categoryOf(group.text),
      ...adPrice(group.text),
      contentHash,
    });
    if (ads.length === limit) break;
  }
  return ads;
}
