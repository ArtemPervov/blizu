import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import {
  TELEGRAM_GROUP_ID,
  type TelegramExport,
  type TelegramMessage,
} from "./telegram-export.js";

export class IncompleteHtmlExport extends SyntaxError {}
const expectedTitle =
  "Барахолка Черногория | Объявления| Скупка | Продам | Отдам | Куплю | Обмен | Будва | Бар | Тиват | Подгорица | Котор";
const normalizeTitle = (value: string) =>
  value.replace(/\s+/gu, "").toLocaleLowerCase("ru");

function content(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (["SCRIPT", "STYLE"].includes(element.tagName)) return "";
  if (element.tagName === "BR") return "\n";
  let value = [...element.childNodes].map(content).join("");
  if (element.tagName === "A") {
    const href = element.getAttribute("href") ?? "";
    if (
      /^https?:\/\//i.test(href) &&
      !value.includes(href) &&
      !value.startsWith("@")
    )
      value += ` (${href})`;
  }
  return ["DIV", "P", "BLOCKQUOTE", "LI"].includes(element.tagName)
    ? `\n${value}\n`
    : value;
}
function messageTime(value: string) {
  const match =
    /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}:\d{2}) GMT([+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match)
    throw new Error(
      "Не удалось определить часовой пояс сообщения HTML-экспорта.",
    );
  const time = new Date(
    `${match[3]}-${match[2]}-${match[1]}T${match[4]}${match[5]}`,
  ).getTime();
  if (!Number.isFinite(time))
    throw new Error("Некорректная дата в HTML-экспорте.");
  return String(Math.floor(time / 1000));
}

/** Reads local HTML as data; exported scripts and remote resources are never run. */
export function readTelegramHtml(exportDir: string): TelegramExport {
  const messages: TelegramMessage[] = [],
    seen = new Set<string>();
  let page = "messages.html",
    author = "";
  while (page) {
    if (
      !/^messages(?:[2-9]\d*|1\d+)?\.html$/.test(page) ||
      seen.has(page) ||
      seen.size >= 10000
    )
      throw new Error("Некорректная цепочка страниц HTML-экспорта.");
    seen.add(page);
    const path = resolve(exportDir, page);
    if (!existsSync(path))
      throw new IncompleteHtmlExport(`Страница ${page} ещё не записана.`);
    const before = statSync(path),
      html = readFileSync(path, "utf8"),
      after = statSync(path);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      !/<\/html>\s*$/i.test(html)
    )
      throw new IncompleteHtmlExport(`Страница ${page} ещё записывается.`);
    const dom = new JSDOM(html);
    try {
      const doc = dom.window.document;
      if (
        normalizeTitle(
          doc.querySelector(".page_header .text")?.textContent ?? "",
        ) !== normalizeTitle(expectedTitle)
      )
        throw new Error(
          "HTML-экспорт не соответствует известному названию группы montenegrobye.",
        );
      for (const element of doc.querySelectorAll(
        ".history > .message.default",
      )) {
        const id = /^message(\d+)$/.exec(element.id),
          body = element.querySelector(":scope > .body");
        if (!id || !body) continue;
        const time = body
          .querySelector(":scope > .date")
          ?.getAttribute("title");
        if (!time)
          throw new Error(`У сообщения ${id[1]} отсутствует исходная дата.`);
        const name = body.querySelector(":scope > .from_name");
        if (name)
          author = [...name.childNodes]
            .filter((node) => node.nodeType === 3)
            .map((node) => node.nodeValue)
            .join("")
            .trim();
        else if (!element.classList.contains("joined")) author = "";
        const textNode = body.querySelector(
          ":scope > .text, :scope > .forwarded.body > .text",
        );
        const text = textNode
          ? content(textNode)
              .replace(/[ \t]+\n/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim()
          : "";
        const photo =
          body.querySelector("a.photo_wrap[href]")?.getAttribute("href") ??
          undefined;
        messages.push({
          id: Number(id[1]),
          type: "message",
          date_unixtime: messageTime(time),
          from: author || null,
          // Grouping key only: HTML does not expose a reliable Telegram user ID.
          from_id: author
            ? `html-${createHash("sha256").update(author).digest("hex")}`
            : undefined,
          photo,
          text,
        });
      }
      const next = [...doc.querySelectorAll("a.pagination[href]")].filter(
        (anchor) => anchor.textContent?.trim() === "Next messages",
      );
      if (next.length > 1)
        throw new Error("Неоднозначная пагинация HTML-экспорта.");
      page = next[0]?.getAttribute("href") ?? "";
    } finally {
      dom.window.close();
    }
  }
  // The source is the user-identified folder, checked against the known group title.
  return { id: TELEGRAM_GROUP_ID, type: "public_supergroup", messages };
}
