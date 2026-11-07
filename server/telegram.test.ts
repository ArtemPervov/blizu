import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { Store } from "./db.js";
import { createApp } from "./app.js";
import { importTelegramAds } from "./import-telegram.js";
import { readTelegramHtml, IncompleteHtmlExport } from "./telegram-html.js";
import {
  adPrice,
  selectTelegramAds,
  TELEGRAM_GROUP_ID,
  type TelegramMessage,
} from "./telegram-export.js";

const at = 1793966400;
const msg = (
  id: number,
  text: TelegramMessage["text"],
  extra: Partial<TelegramMessage> = {},
): TelegramMessage => ({
  id,
  type: "message",
  date_unixtime: String(at + id * 10),
  from: "Автор из экспорта",
  from_id: "user-synthetic",
  text,
  ...extra,
});
const exported = (messages: TelegramMessage[]) => ({
  id: TELEGRAM_GROUP_ID,
  type: "public_supergroup",
  messages,
});

const htmlPage = (
  body: string,
  next = "",
  title = "Барахолка Черногория | Объявления| Скупка | Продам | Отдам | Куплю | Обмен | Будва | Бар | Тиват | Подгорица | Котор",
) =>
  `<!doctype html><html><body><div class="page_header"><div class="text">${title}</div></div><div class="history">${body}${next ? `<a class="pagination block_link" href="${next}">Next messages</a>` : ""}</div></body></html>`;
const htmlMessage = (
  id: number,
  text: string,
  options: { joined?: boolean; photo?: string; forwarded?: boolean } = {},
) =>
  `<div class="message default clearfix${options.joined ? " joined" : ""}" id="message${id}"><div class="body"><div class="pull_right date details" title="06.11.2026 12:30:00 GMT+03:00">12:30</div>${options.joined ? "" : '<div class="from_name">Автор HTML</div>'}${options.forwarded ? '<div class="forwarded body"><div class="from_name">Источник пересылки <span class="date" title="01.01.2020 12:00:00 GMT+03:00">2020</span></div>' : ""}${options.photo ? `<a class="photo_wrap" href="${options.photo}"><img src="thumbnail.jpg"></a>` : ""}${text ? `<div class="text">${text}</div>` : ""}${options.forwarded ? "</div>" : ""}</div></div>`;

test("HTML export follows pages, preserves text and album authors, and uses posting time rather than forwarded time", () => {
  const dir = mkdtempSync(join(tmpdir(), "blizu-telegram-html-"));
  try {
    writeFileSync(
      join(dir, "messages.html"),
      htmlPage(
        htmlMessage(
          100,
          '#продам<br>#Будва<br>Продам красивый стол.<br>Цена 25 евро.<br><a href="https://example.com/details">Описание</a>',
          { photo: "photos/a.jpg" },
        ),
        "messages2.html",
      ),
    );
    writeFileSync(
      join(dir, "messages2.html"),
      htmlPage(
        htmlMessage(101, "", { joined: true, photo: "photos/b.jpg" }) +
          htmlMessage(102, "Продаю настольную лампу, 15 евро.", {
            forwarded: true,
          }),
      ),
    );
    const data = readTelegramHtml(dir);
    assert.equal(data.messages.length, 3);
    assert.equal(data.messages[1].from, "Автор HTML");
    assert.equal(
      data.messages[2].date_unixtime,
      String(Date.parse("2026-11-06T09:30:00Z") / 1000),
    );
    const ads = selectTelegramAds(data);
    assert.equal(ads.length, 2);
    assert.deepEqual(ads[1].photos, ["photos/a.jpg", "photos/b.jpg"]);
    assert.equal(ads[1].title, "Продам красивый стол.");
    assert.ok(
      ads[1].description.includes("Описание (https://example.com/details)"),
    );
    assert.ok(!ads[0].description.includes("2020"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HTML export refuses incomplete pages, a different group and pagination outside the export", () => {
  const dir = mkdtempSync(join(tmpdir(), "blizu-telegram-html-guard-"));
  try {
    writeFileSync(
      join(dir, "messages.html"),
      htmlPage(htmlMessage(1, "Продам стол, 25 евро"), "messages2.html"),
    );
    assert.throws(() => readTelegramHtml(dir), IncompleteHtmlExport);
    writeFileSync(join(dir, "messages2.html"), "<!doctype html><html>");
    assert.throws(() => readTelegramHtml(dir), IncompleteHtmlExport);
    writeFileSync(join(dir, "messages.html"), htmlPage("", "../outside.html"));
    assert.throws(() => readTelegramHtml(dir), /цепочка/);
    writeFileSync(
      join(dir, "messages.html"),
      htmlPage("", "", "Другая группа"),
    );
    assert.throws(() => readTelegramHtml(dir), /названию группы/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Telegram selection takes the latest 100 unique ads, joins adjacent album images and preserves rich text", () => {
  const messages = Array.from({ length: 105 }, (_, i) =>
    msg(i + 1, `Продам вещь номер ${i + 1}. Будва. Цена 15 евро.`),
  );
  messages.push(
    msg(106, [{ text: "Продам хороший стол в Тивате. " }, "Цена 70 €."], {
      photo: "photos/a.jpg",
    }),
  );
  messages.push(
    msg(107, "", { photo: "photos/b.jpg", date_unixtime: String(at + 1060) }),
  );
  messages.push(msg(108, messages[104].text));
  messages.push(msg(109, "Спасибо!"));
  messages.push(msg(110, "ПРОДАНО. Красивый стол, Будва, 20 евро."));
  messages.push(
    msg(111, "Продам служебную запись 100 евро", { type: "service" }),
  );
  const ads = selectTelegramAds(exported(messages));
  assert.equal(ads.length, 100);
  assert.equal(ads[0].messageId, 108);
  assert.equal(ads[1].messageId, 106);
  assert.deepEqual(ads[1].photos, ["photos/a.jpg", "photos/b.jpg"]);
  assert.equal(ads[1].city, "Тиват");
  assert.equal(ads[1].description, "Продам хороший стол в Тивате. Цена 70 €.");
  assert.ok(!ads.some((ad) => [105, 109, 110, 111].includes(ad.messageId)));
  assert.throws(
    () => selectTelegramAds({ ...exported(messages), id: 42 }),
    /montenegrobye/,
  );
});

test("Telegram price parsing distinguishes known, multiple, missing and free prices without inventing location", () => {
  assert.deepEqual(adPrice("Цена 1 250,50 евро"), {
    price: 1250.5,
    priceKnown: true,
    priceLabel: "1 250,5 €",
  });
  assert.equal(adPrice("Стол 25€, стул 10€").priceKnown, false);
  assert.equal(
    adPrice("Новый стоил 100 евро. Продам за 50 евро.").priceKnown,
    false,
  );
  assert.equal(adPrice("Цена 100 долларов, 95 €").priceKnown, false);
  assert.equal(adPrice("Цена 100 $, 95 €").priceKnown, false);
  assert.equal(adPrice("Кроссовки, €40. Будва").price, 40);
  assert.equal(adPrice("Рубашка новая, XS/S, 25€").price, 25);
  assert.equal(adPrice("Куртка в хорошем состоянии, 40 euro").price, 40);
  assert.equal(
    adPrice("Цена 100 долларов. Доставка бесплатно.").priceKnown,
    false,
  );
  assert.equal(
    adPrice("Доставка бесплатно, цена в личных сообщениях.").priceKnown,
    false,
  );
  assert.equal(adPrice("Условия в личных сообщениях").priceKnown, false);
  assert.deepEqual(adPrice("Отдам бесплатно детские вещи"), {
    price: 0,
    priceKnown: true,
    priceLabel: "Бесплатно",
  });
  const [ad] = selectTelegramAds(
    exported([msg(1, "Продам стол, который хорошо сохранился, цена 25 евро")]),
  );
  assert.equal(ad.city, "Вся Черногория");
});

test("Telegram import classifies the product rather than incidental delivery or repair details", () => {
  const cases = [
    ["Фильтр-кувшин для воды. Цена 25 евро. Доставка бесплатная.", "goods"],
    ["MacBook 12 2017, 250 евро. Подходит для работы с документами.", "goods"],
    ["Отдам вещи на обмен. Мышки в ремонт и другие аксессуары.", "goods"],
    ["Психолог онлайн, консультации при жизненных трудностях.", "beauty"],
    ["Я Юлия парикмахер-универсал. Стрижки и укладки в Будве.", "beauty"],
    ["Домашнее оливковое масло, свежий урожай, 20 евро.", "food"],
  ];
  for (const [text, category] of cases)
    assert.equal(
      selectTelegramAds(
        exported([msg(1, text, { photo: "photos/product.jpg" })]),
      )[0].category,
      category,
    );
});

test("reposts with a changed explicit price retain the latest version from the same author", () => {
  const description =
    "Продаю iPhone 14 Pro 512 GB в хорошем состоянии. Телефон полностью рабочий, использовался бережно, в комплекте зарядный кабель. Тиват. Цена ";
  const ads = selectTelegramAds(
    exported([msg(1, description + "550€"), msg(2, description + "500€")]),
  );
  assert.equal(ads.length, 1);
  assert.equal(ads[0].messageId, 2);
  assert.equal(ads[0].price, 500);
});

test("Telegram import is idempotent, images and source metadata survive API/favorites and moderation hides both", async () => {
  const dir = mkdtempSync(join(tmpdir(), "blizu-telegram-"));
  const store = new Store(":memory:");
  const f = createApp({ store, demo: true, dataDir: dir });
  try {
    mkdirSync(join(dir, "photos"));
    const photo = Buffer.from([0xff, 0xd8, 0xff, ...Array(50).fill(0)]);
    writeFileSync(join(dir, "photos", "a.jpg"), photo);
    const ads = selectTelegramAds(
      exported([
        msg(1, "Продам стол, 25 евро, Будва", { photo: "photos/a.jpg" }),
        msg(
          2,
          "Продам несколько предметов: стол 35 евро и стул 15 евро. Тиват.",
        ),
      ]),
    );
    assert.equal(importTelegramAds(store, ads, dir, dir).imported, 2);
    assert.deepEqual(importTelegramAds(store, ads, dir, dir), {
      selected: 2,
      imported: 0,
      skipped: 2,
      images: 0,
    });
    const results = (
      await request(f.app)
        .get("/api/listings?source=telegram&sort=newest")
        .expect(200)
    ).body;
    assert.equal(results.total, 2);
    assert.equal(results.items[0].source.messageId, 2);
    assert.equal(results.items[0].source.priceKnown, false);
    assert.equal(results.items[0].providerVerified, false);
    assert.equal(results.items[0].reviewCount, 0);
    const item = results.items[1];
    assert.equal(
      (await request(f.app).get("/api/listings?limit=1").expect(200)).body
        .items[0].source.kind,
      "telegram",
    );
    assert.equal(item.source.authorName, "Автор из экспорта");
    assert.equal(item.source.url, "https://t.me/montenegrobye/1");
    assert.ok(!JSON.stringify(item).includes("user-synthetic"));
    assert.equal(
      (
        await request(f.app)
          .get("/api/listings?source=telegram&maxPrice=100")
          .expect(200)
      ).body.total,
      1,
    );
    assert.deepEqual(
      (await request(f.app).get(item.image).expect(200)).body,
      photo,
    );
    const customer = request.agent(f.app);
    await customer
      .post("/api/auth/demo")
      .send({ role: "customer" })
      .expect(200);
    await customer
      .put(`/api/favorites/${item.id}`)
      .send({ saved: true })
      .expect(200);
    assert.equal(
      (await customer.get("/api/favorites").expect(200)).body.items[0].source
        .url,
      item.source.url,
    );
    const op = request.agent(f.app);
    await op.post("/api/auth/demo").send({ role: "operator" }).expect(200);
    await op
      .patch(`/api/operator/listings/${item.id}`)
      .send({
        action: "hide",
        reason: "Предложение скрыто после проверки команды.",
      })
      .expect(200);
    await request(f.app).get(item.image).expect(404);
    await request(f.app).get(`/api/listings/${item.id}`).expect(404);
    await op.get(item.image).expect(200);
    assert.equal(
      (await request(f.app).get("/api/meta").expect(200)).body.stats.imported,
      1,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Telegram import rejects missing, disguised and out-of-folder images before creating any listings", () => {
  const dir = mkdtempSync(join(tmpdir(), "blizu-telegram-files-"));
  const store = new Store(":memory:");
  try {
    mkdirSync(join(dir, "photos"));
    writeFileSync(join(dir, "secret.txt"), "secret outside photo folder");
    writeFileSync(
      join(dir, "photos", "bad.jpg"),
      "<html>this is not a photograph</html>",
    );
    for (const photo of [
      "photos/missing.jpg",
      "photos/bad.jpg",
      "photos/../../outside.jpg",
      "secret.txt",
    ])
      assert.throws(() =>
        importTelegramAds(
          store,
          selectTelegramAds(
            exported([msg(1, "Продам стол, 20 евро", { photo })]),
          ),
          dir,
          dir,
        ),
      );
    assert.equal(
      store.get<{ n: number }>("SELECT COUNT(*) n FROM listings")!.n,
      0,
    );
    assert.equal(
      store.get<{ n: number }>("SELECT COUNT(*) n FROM listing_sources")!.n,
      0,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
