import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:http";
import { createApp, type AppOptions } from "./app.js";
import { assistantConfig, preloadAssistant } from "./assistant.js";
import { Store } from "./db.js";
import { chatStreamType, readJsonLines } from "../shared/assistant-stream.js";

test("catalog filters are applied before pagination and include a stable total", async () => {
  const f = fixture();
  try {
    const all = (await request(f.app).get("/api/listings").expect(200)).body;
    assert.equal(all.total, all.items.length);
    const cheap = (
      await request(f.app)
        .get("/api/listings?maxPrice=20&sort=price")
        .expect(200)
    ).body;
    assert.ok(cheap.items.length > 0);
    assert.ok(cheap.items.every((item: { price: number }) => item.price <= 20));
    assert.deepEqual(
      cheap.items.map((item: { price: number }) => item.price),
      cheap.items
        .map((item: { price: number }) => item.price)
        .sort((a: number, b: number) => a - b),
    );
    const trusted = (
      await request(f.app)
        .get("/api/listings?minRating=4.9&verified=1&minPrice=10")
        .expect(200)
    ).body;
    assert.ok(
      trusted.items.every(
        (item: {
          price: number;
          providerRating: number;
          providerVerified: boolean;
        }) =>
          item.price >= 10 &&
          item.providerRating >= 4.9 &&
          item.providerVerified,
      ),
    );
    const first = (
      await request(f.app)
        .get("/api/listings?limit=2&sort=price_desc")
        .expect(200)
    ).body;
    const next = (
      await request(f.app)
        .get("/api/listings?limit=2&offset=2&sort=price_desc")
        .expect(200)
    ).body;
    assert.equal(first.items.length, 2);
    assert.equal(next.items.length, 2);
    assert.equal(first.total, all.total);
    assert.equal(next.total, all.total);
    assert.ok(
      first.items.every(
        (item: { id: string }) =>
          !next.items.some((other: { id: string }) => other.id === item.id),
      ),
    );
    assert.ok(first.items[1].price >= next.items[0].price);
    await request(f.app)
      .get("/api/listings?minPrice=100&maxPrice=10")
      .expect(400);
    await request(f.app).get("/api/listings?minRating=6").expect(400);
    await request(f.app).get("/api/listings?verified=unknown").expect(400);
  } finally {
    f.cleanup();
  }
});

function fixture(
  demo = true,
  deliveryEnabled = true,
  assistant?: AppOptions["assistant"],
) {
  const dir = mkdtempSync(join(tmpdir(), "blizu-test-"));
  const store = new Store(":memory:");
  const result = createApp({
    store,
    demo,
    deliveryEnabled,
    assistant,
    dataDir: dir,
    origin: "https://blizu.test",
  });
  return {
    ...result,
    dataDir: dir,
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function login(app: ReturnType<typeof createApp>["app"], role: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/demo").send({ role }).expect(200);
  return agent;
}

test("Ollama chat works for guests, answers greetings locally and streams model text", async () => {
  const disabled = fixture();
  try {
    const client = request(disabled.app);
    assert.equal(
      (await client.get("/api/meta").expect(200)).body.assistantEnabled,
      false,
    );
    await client
      .post("/api/assistant/chat")
      .send({ language: "ru", message: "Вопрос" })
      .expect(404);
  } finally {
    disabled.cleanup();
  }

  const forwarded: { url?: string; payload: Record<string, unknown> }[] = [];
  let finishStream!: () => void;
  const waitForFirstEvent = new Promise<void>((resolve) => {
    finishStream = resolve;
  });
  const upstream = createServer(async (req, res) => {
    req.setEncoding("utf8");
    let raw = "";
    for await (const part of req) raw += part;
    const payload = JSON.parse(raw);
    forwarded.push({ url: req.url, payload });
    if (!payload.messages.length) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ done: true, done_reason: "load" }));
      return;
    }
    if (payload.stream) {
      res.setHeader("Content-Type", chatStreamType);
      res.write(
        JSON.stringify({ message: { content: "Откройте " }, done: false }) +
          "\n",
      );
      await waitForFirstEvent;
      res.end(
        JSON.stringify({
          message: { content: "раздел «Мои заказы»." },
          done: true,
        }) + "\n",
      );
      return;
    }
    res.setHeader("Content-Type", "application/json");
    if (forwarded.length === 1) {
      res.end(
        JSON.stringify({
          message: { content: "Откройте раздел «Мои заказы»." },
        }),
      );
    } else {
      res.writeHead(503).end();
    }
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  assert.ok(address && typeof address === "object");
  const options = {
    LLM_ENABLED: "true",
    LLM_BASE_URL: `http://127.0.0.1:${address.port}`,
    LLM_MODEL: "qwen3:8b",
    LLM_TIMEOUT_MS: "8000",
  };
  const config = assistantConfig(options)!;
  assert.equal(
    assistantConfig({ ...options, LLM_KEEP_WARM: "false" })?.keepWarm,
    false,
  );
  const enabled = fixture(true, false, config);
  const http = enabled.app.listen(0, "127.0.0.1");
  try {
    const guest = request(enabled.app);
    const chat = { language: "ru", message: "Где мои заказы?" };
    assert.equal(
      (await guest.get("/api/meta").expect(200)).body.assistantEnabled,
      true,
    );
    const endpoint = "/api/assistant/chat";
    await guest
      .post(endpoint)
      .set("Origin", "https://other.test")
      .send(chat)
      .expect(403);
    await guest
      .post(endpoint)
      .send({ ...chat, history: [{ role: "system", content: "Other" }] })
      .expect(400);
    await guest
      .post(endpoint)
      .send({ ...chat, message: "Привет!" })
      .expect(200, { answer: "Привет! Чем могу помочь в Blizu?" });
    assert.equal(forwarded.length, 0);
    await preloadAssistant(config);
    assert.deepEqual(forwarded.shift(), {
      url: "/api/chat",
      payload: {
        model: "qwen3:8b",
        messages: [],
        stream: false,
        keep_alive: -1,
        options: { num_ctx: 4096 },
      },
    });
    await guest
      .post(endpoint)
      .send(chat)
      .expect(200, { answer: "Откройте раздел «Мои заказы»." });
    assert.equal(forwarded[0].url, "/api/chat");
    assert.equal(forwarded[0].payload.model, "qwen3:8b");
    assert.equal(forwarded[0].payload.stream, false);
    assert.equal(forwarded[0].payload.keep_alive, -1);
    const messages = forwarded[0].payload.messages as {
      role: string;
      content: string;
    }[];
    assert.deepEqual(
      messages.map(({ role }) => role),
      ["system", "user"],
    );
    assert.equal(messages[1].content, chat.message);
    await guest.post(endpoint).send(chat).expect(503);

    const listenAddress = http.address();
    assert.ok(listenAddress && typeof listenAddress === "object");
    const response = await fetch(
      `http://127.0.0.1:${listenAddress.port}${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: chatStreamType },
        body: JSON.stringify(chat),
        signal: AbortSignal.timeout(5000),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Accel-Buffering"), "no");
    assert.ok(response.body);
    const events = readJsonLines(response.body);
    assert.deepEqual(await events.next(), {
      value: { delta: "Откройте " },
      done: false,
    });
    finishStream();
    assert.deepEqual(await events.next(), {
      value: { delta: "раздел «Мои заказы»." },
      done: false,
    });
    assert.deepEqual(await events.next(), {
      value: { done: true },
      done: false,
    });
    assert.equal((await events.next()).done, true);
    assert.equal(forwarded[2].payload.stream, true);
  } finally {
    finishStream();
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    enabled.cleanup();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test("assistant uses the public catalog and prepares a listing without publishing it", async () => {
  const calls: string[] = [];
  const draft = {
    title: "Городской велосипед",
    description: "Продаю городской велосипед в хорошем состоянии.",
    category: "goods",
    city: "Бар",
    price: 120,
    unit: "товар",
  };
  const upstream = createServer(async (req, res) => {
    req.setEncoding("utf8");
    let body = "";
    for await (const part of req) body += part;
    const { messages, tools, stream } = JSON.parse(body);
    assert.ok(tools.some((tool: { function: { name: string } }) => tool.function.name === "search_catalog"));
    const question = messages.at(-1).content as string;
    calls.push(question);
    const call = question.includes("велосипед")
      ? { name: "prepare_listing", arguments: draft }
      : { name: "search_catalog", arguments: { category: "auto", city: "Будва", q: "Skoda", maxPrice: 5000 } };
    const reply = { done: true, message: { content: "", tool_calls: [{ function: call }] } };
    res.setHeader("Content-Type", stream ? chatStreamType : "application/json");
    res.end(JSON.stringify(reply) + (stream ? "\n" : ""));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  assert.ok(address && typeof address === "object");
  const f = fixture(true, false, {
    baseUrl: `http://127.0.0.1:${address.port}`,
    model: "qwen3:8b",
    timeoutMs: 5000,
  });
  try {
    const author = await login(f.app, "provider");
    const offer = { ...draft, title: "Skoda Fabia", category: "auto", city: "Будва", price: 4600 };
    const published = await author.post("/api/listings").send(offer).expect(201);
    const overBudget = await author.post("/api/listings").send({ ...offer, price: 5100 }).expect(201);
    const guest = request(f.app);
    const send = (message: string) => guest.post("/api/assistant/chat").send({ language: "ru", message });
    const simple = (await send("найди объявление по авто").expect(200)).body.action;
    assert.equal(simple.kind, "catalog");
    assert.deepEqual(simple.filters, { category: "auto" });
    assert.equal(calls.length, 0);

    const found = (await send("Найди Skoda в Будве до 5000 €").expect(200)).body.action;
    assert.deepEqual(found.listings.map((item: { id: string }) => item.id), [published.body.id]);
    assert.ok(!found.listings.some((item: { id: string }) => item.id === overBudget.body.id));

    const prepared = await send("Размести городской велосипед в Баре за 120 €")
      .set("Accept", chatStreamType)
      .expect(200);
    const events = prepared.text.trim().split("\n").map((line: string) => JSON.parse(line));
    assert.equal(events[0].result.action.kind, "listingDraft");
    assert.deepEqual(events[0].result.action.draft, draft);
    assert.deepEqual(events[1], { done: true });
    assert.equal(f.store.get("SELECT id FROM listings WHERE title=?", draft.title), undefined);
    await guest.post("/api/listings").send(draft).expect(401);
  } finally {
    f.cleanup();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test("MVP keeps local order help, excludes new international delivery, and seeds demos once", async () => {
  const f = fixture(true, false);
  try {
    const client = request(f.app);
    assert.equal(
      (await client.get("/api/meta").expect(200)).body.deliveryEnabled,
      false,
    );
    const demos = (await client.get("/api/listings?source=demo").expect(200))
      .body;
    assert.equal(demos.total, 19);
    assert.ok(
      demos.items.every((item: { providerId: string }) =>
        item.providerId.startsWith("demo-"),
      ),
    );
    assert.ok(
      demos.items.some(
        (item: { category: string }) => item.category === "delivery",
      ),
    );
    const second = createApp({
      store: f.store,
      demo: true,
      dataDir: f.dataDir,
    });
    assert.equal(
      (await request(second.app).get("/api/listings?source=demo").expect(200))
        .body.total,
      19,
    );
    assert.deepEqual(
      (await client.get("/api/requests?kind=delivery").expect(200)).body.items,
      [],
    );

    const customer = await login(f.app, "customer");
    const input = {
      title: "Нужна помощь с покупкой",
      description: "Помогите разобраться с оформлением заказа.",
      category: "delivery",
      city: "Будва",
      budget: 20,
    };
    await customer
      .post("/api/requests")
      .send({
        ...input,
        kind: "delivery",
        productUrl: "https://example.com/product",
        origin: "Европа",
      })
      .expect(403);
    await customer
      .post("/api/requests")
      .send({ ...input, kind: "service" })
      .expect(201);
  } finally {
    f.cleanup();
  }
});

test("registration, persistent session, logout and protection against role escalation", async () => {
  const f = fixture(false);
  try {
    const agent = request.agent(f.app);
    await agent
      .post("/api/auth/register")
      .send({
        name: "Тест",
        email: "test@example.com",
        password: "long-password-2026",
        city: "Будва",
        role: "arbiter",
        contact: "@test",
      })
      .expect(400);
    const r = await agent
      .post("/api/auth/register")
      .send({
        name: "Тест",
        email: "test@example.com",
        password: "long-password-2026",
        city: "Будва",
        role: "customer",
        contact: "@test",
      })
      .expect(201);
    assert.equal(r.body.user.role, "customer");
    assert.equal("password" in r.body.user, false);
    const session = await agent.get("/api/auth/me").expect(200);
    assert.equal(session.body.user.email, "test@example.com");
    await agent.post("/api/auth/logout").expect(200);
    assert.equal((await agent.get("/api/auth/me")).body.user, null);
    await agent.get("/api/dashboard").expect(401);
    await agent
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "wrong" })
      .expect(401);
    await agent
      .post("/api/auth/login")
      .send({ email: "TEST@example.com", password: "long-password-2026" })
      .expect(200);
    await agent.post("/api/listings").send({}).expect(403);
    await request(f.app)
      .post("/api/auth/demo")
      .send({ role: "arbiter" })
      .expect(404);
  } finally {
    f.cleanup();
  }
});

test("listing details publish only contacts explicitly supplied by a provider", async () => {
  const f = fixture();
  try {
    const guest = request(f.app);
    const provider = await login(f.app, "provider");
    const input = {
      title: "Ремонт бытовой техники",
      description: "Диагностика и ремонт бытовой техники на дому.",
      category: "repair",
      city: "Бар",
      price: 30,
      unit: "услуга",
    };
    const privateListing = await provider
      .post("/api/listings")
      .send(input)
      .expect(201);
    const privateDetail = await guest
      .get(`/api/listings/${privateListing.body.id}`)
      .expect(200);
    assert.equal(privateDetail.body.item.publicContact, undefined);

    await provider
      .post("/api/listings")
      .send({ ...input, telegram: "https://example.test" })
      .expect(400);
    const published = await provider
      .post("/api/listings")
      .send({
        ...input,
        telegram: "@blizu_example",
        viber: "+382 (67) 555-010",
      })
      .expect(201);
    const detail = await guest
      .get(`/api/listings/${published.body.id}`)
      .expect(200);
    assert.deepEqual(detail.body.item.publicContact, {
      telegram: "blizu_example",
      viber: "+38267555010",
    });
    const search = await guest
      .get("/api/listings")
      .query({ q: input.title })
      .expect(200);
    assert.equal(search.body.items.length, 2);
    assert.ok(
      search.body.items.every(
        (item: { publicContact?: unknown }) => !item.publicContact,
      ),
    );
  } finally {
    f.cleanup();
  }
});

test("catalog search uses Russian case folding, combined filters and safe parameterized queries", async () => {
  const f = fixture();
  try {
    const r = await request(f.app)
      .get("/api/listings")
      .query({ q: "КОНДИЦИОНЕР", category: "repair", city: "Бар" })
      .expect(200);
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].id, "l-repair");
    assert.ok(Array.isArray(r.body.items[0].tags));
    const injected = await request(f.app)
      .get("/api/listings")
      .query({ category: "repair' OR 1=1--" })
      .expect(200);
    assert.equal(injected.body.items.length, 0);
    await request(f.app).get("/api/listings?limit=100000").expect(400);
    const customer = await login(f.app, "customer");
    await customer
      .put("/api/favorites/l-repair")
      .send({ saved: true })
      .expect(200);
    assert.deepEqual((await customer.get("/api/favorites")).body.ids, [
      "l-repair",
    ]);
    await customer
      .put("/api/favorites/l-repair")
      .send({ saved: false })
      .expect(200);
    assert.deepEqual((await customer.get("/api/favorites")).body.ids, []);
  } finally {
    f.cleanup();
  }
});

test("request → private offer → atomic selection → order, contacts and service completion", async () => {
  const f = fixture();
  try {
    const customer = await login(f.app, "customer");
    const provider = await login(f.app, "provider");
    const arbiter = await login(f.app, "arbiter");
    const created = await customer
      .post("/api/requests")
      .send({
        title: "Нужен ремонт сантехники",
        description: "Нужно заменить смеситель на кухне, подскажите время.",
        category: "repair",
        city: "Бар",
        budget: 100,
        kind: "service",
      })
      .expect(201);
    const id = created.body.id;
    const submitted = await provider
      .post(`/api/requests/${id}/offers`)
      .send({
        price: 60,
        message: "Заменю смеситель, инструменты привезу с собой.",
        eta: "Завтра с 12 до 14",
      })
      .expect(201);
    const offerId = submitted.body.id;
    await provider
      .post(`/api/requests/${id}/offers`)
      .send({
        price: 70,
        message: "Повторный отклик, не должен сохраниться.",
        eta: "Завтра",
      })
      .expect(409);
    assert.equal(
      (await request(f.app).get(`/api/requests/${id}`)).body.offers.length,
      0,
    );
    assert.equal(
      (await customer.get(`/api/requests/${id}`)).body.offers.length,
      1,
    );
    await provider.post(`/api/offers/${offerId}/accept`).send({}).expect(403);
    const accepted = await customer
      .post(`/api/offers/${offerId}/accept`)
      .send({})
      .expect(201);
    const orderId = accepted.body.id;
    await customer.post(`/api/offers/${offerId}/accept`).send({}).expect(409);
    const detail = await customer.get(`/api/orders/${orderId}`).expect(200);
    assert.equal(detail.body.order.price, 60);
    assert.equal(detail.body.order.providerContact, "@sergey_demo");
    assert.equal(detail.body.events.length, 1);
    await request(f.app).get(`/api/orders/${orderId}`).expect(401);
    await customer
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: "in_progress" })
      .expect(403);
    await provider
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: "in_progress" })
      .expect(200);
    await provider
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: "completed" })
      .expect(403);
    await customer
      .post(`/api/orders/${orderId}/messages`)
      .send({ text: "Спасибо, буду ждать мастера к 12." })
      .expect(201);
    assert.equal(
      (await arbiter.get(`/api/orders/${orderId}`)).body.messages[0].text,
      "Спасибо, буду ждать мастера к 12.",
    );
    await customer
      .patch(`/api/orders/${orderId}/status`)
      .send({ status: "completed" })
      .expect(200);
    assert.equal(
      (await customer.get(`/api/requests/${id}`)).body.item.status,
      "closed",
    );
    assert.equal(
      (await customer.get(`/api/orders/${orderId}`)).body.events.length,
      3,
    );
    const unrelated = request.agent(f.app);
    await unrelated
      .post("/api/auth/register")
      .send({
        name: "Другой",
        email: "other@example.com",
        password: "long-password-2026",
        city: "Бар",
        role: "customer",
        contact: "@other",
      })
      .expect(201);
    await unrelated.get(`/api/orders/${orderId}`).expect(403);
    await unrelated
      .post(`/api/orders/${orderId}/messages`)
      .send({ text: "Нет доступа" })
      .expect(403);
  } finally {
    f.cleanup();
  }
});

test("photo evidence is private, invalid photos rejected, arbiter resolution is validated and final", async () => {
  const f = fixture();
  try {
    const customer = await login(f.app, "customer");
    const provider = await login(f.app, "provider");
    const arbiter = await login(f.app, "arbiter");
    await provider
      .post("/api/orders/order-demo/incident")
      .field("description", "Повреждён товар, открывает не та сторона.")
      .expect(403);
    await customer
      .post("/api/orders/order-demo/incident")
      .field("description", "Коробка пришла повреждённой, товар разбит.")
      .attach("evidence", Buffer.from("<script>bad</script>"), "bad.png")
      .expect(400);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3e0AAAAASUVORK5CYII=",
      "base64",
    );
    const created = await customer
      .post("/api/orders/order-demo/incident")
      .field("description", "Коробка пришла повреждённой, товар разбит.")
      .attach("evidence", png, "photo.png")
      .expect(201);
    const id = created.body.id;
    assert.equal(
      (await customer.get("/api/orders/order-demo")).body.order.status,
      "disputed",
    );
    await request(f.app).get(`/api/incidents/${id}/evidence`).expect(401);
    await customer
      .get(`/api/incidents/${id}/evidence`)
      .expect("Content-Type", /image\/png/)
      .expect(200);
    const body = {
      decision: "refund",
      refundAmount: 48,
      resolution:
        "Подтверждено повреждение, исполнитель возвращает полную стоимость.",
      guilty: "provider",
    };
    await customer.post(`/api/incidents/${id}/resolve`).send(body).expect(403);
    await arbiter
      .post(`/api/incidents/${id}/resolve`)
      .send({ ...body, refundAmount: 100 })
      .expect(400);
    await arbiter.post(`/api/incidents/${id}/resolve`).send(body).expect(200);
    await arbiter.post(`/api/incidents/${id}/resolve`).send(body).expect(409);
    const detail = (await customer.get("/api/orders/order-demo")).body;
    assert.equal(detail.order.status, "resolved");
    assert.equal(detail.incident.refundAmount, 48);
    assert.equal(detail.incident.status, "closed");
    assert.equal(
      f.store.get<{ rating: number }>(
        "SELECT rating FROM users WHERE id=?",
        "demo-logistic",
      )?.rating,
      4.7,
    );
  } finally {
    f.cleanup();
  }
});

test("delivery statuses are ordered; customer confirms receipt; watchdog opens one incident only", async () => {
  const f = fixture();
  try {
    const customer = await login(f.app, "customer");
    await customer
      .patch("/api/orders/order-demo/status")
      .send({ status: "completed" })
      .expect(409);
    f.store.run(
      "UPDATE orders SET updatedAt=? WHERE id=?",
      new Date(Date.now() - 96 * 3600000).toISOString(),
      "order-demo",
    );
    assert.equal(f.checkStaleOrders(), 1);
    assert.equal(f.checkStaleOrders(), 0);
    assert.equal(
      (await customer.get("/api/orders/order-demo")).body.order.status,
      "disputed",
    );
    assert.equal(
      f.store.get<{ n: number }>(
        "SELECT COUNT(*) n FROM incidents WHERE orderId=?",
        "order-demo",
      )?.n,
      1,
    );
    const delivery = await customer
      .post("/api/requests")
      .send({
        title: "Доставить ноутбук",
        description: "Новая покупка, вес около двух килограммов.",
        category: "delivery",
        city: "Будва",
        budget: 80,
        kind: "delivery",
        origin: "Европа",
        productUrl: "javascript:alert(1)",
      })
      .expect(400);
    assert.ok(delivery.body.error);
  } finally {
    f.cleanup();
  }
});

test("a delivery follows the whole route and only its customer confirms receipt", async () => {
  const f = fixture();
  try {
    const customer = await login(f.app, "customer");
    const provider = await login(f.app, "provider");
    const item = await customer
      .post("/api/requests")
      .send({
        title: "Доставить кофемашину в Будву",
        description: "Новая кофемашина из магазина в Европе, примерно 4 кг.",
        category: "delivery",
        city: "Будва",
        budget: 90,
        kind: "delivery",
        origin: "Европа",
        productUrl: "https://example.com/product",
      })
      .expect(201);
    const offer = await provider
      .post(`/api/requests/${item.body.id}/offers`)
      .send({
        price: 75,
        message: "Сюда входит получение и доставка до Будвы.",
        eta: "В течение 14 дней",
      })
      .expect(201);
    const accepted = await customer
      .post(`/api/offers/${offer.body.id}/accept`)
      .send({})
      .expect(201);
    const id = accepted.body.id;
    await provider
      .patch(`/api/orders/${id}/status`)
      .send({ status: "arrived" })
      .expect(409);
    for (const status of ["in_progress", "in_transit", "arrived"])
      await provider
        .patch(`/api/orders/${id}/status`)
        .send({ status, note: `Этап: ${status}` })
        .expect(200);
    await provider
      .patch(`/api/orders/${id}/status`)
      .send({ status: "completed" })
      .expect(403);
    await customer
      .patch(`/api/orders/${id}/status`)
      .send({ status: "completed" })
      .expect(200);
    const detail = (await customer.get(`/api/orders/${id}`)).body;
    assert.equal(detail.order.status, "completed");
    assert.equal(detail.events.length, 5);
    assert.equal(f.checkStaleOrders(), 0);
  } finally {
    f.cleanup();
  }
});

test("records and server sessions survive reopening a file-backed SQLite database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "blizu-persistence-"));
  const path = join(dir, "blizu.sqlite");
  let store = new Store(path);
  try {
    const first = createApp({ store, demo: true, dataDir: dir });
    const r = await request(first.app)
      .post("/api/auth/demo")
      .send({ role: "customer" })
      .expect(200);
    const cookie = r.headers["set-cookie"][0].split(";")[0];
    await request(first.app)
      .put("/api/favorites/l-repair")
      .set("Cookie", cookie)
      .send({ saved: true })
      .expect(200);
    store.close();
    store = new Store(path);
    const second = createApp({ store, demo: false, dataDir: dir });
    assert.equal(
      (await request(second.app).get("/api/auth/me").set("Cookie", cookie)).body
        .user.id,
      "demo-customer",
    );
    assert.deepEqual(
      (await request(second.app).get("/api/favorites").set("Cookie", cookie))
        .body.ids,
      ["l-repair"],
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cross-site writes are blocked and all API responses disable caching", async () => {
  const f = fixture();
  try {
    await request(f.app)
      .post("/api/auth/demo")
      .set("Origin", "https://evil.example")
      .send({ role: "customer" })
      .expect(403);
    await request(f.app)
      .post("/api/auth/demo")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ role: "customer" })
      .expect(403);
    await request(f.app)
      .get("/api/health")
      .expect("Cache-Control", "no-store")
      .expect(200);
  } finally {
    f.cleanup();
  }
});
