import { test as nodeTest, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import request from "supertest";
import { createApp } from "../server/app";
import { Store } from "../server/db";
const test = (name: string, fn: () => Promise<void>) =>
  nodeTest(name, { timeout: 20000 }, fn);

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://blizu.test",
});
after(() => dom.window.close());
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLDialogElement",
  "HTMLCanvasElement",
  "Element",
  "Node",
  "MutationObserver",
  "localStorage",
  "sessionStorage",
  "FormData",
] as const)
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
  });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  writable: true,
});
const media = (query: string) => ({
  matches: query.includes("prefers-reduced-motion"),
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
});
Object.defineProperty(window, "matchMedia", { value: media });
Object.defineProperty(globalThis, "matchMedia", { value: media });
class VisibilityObserver {
  constructor(private callback: (entries: unknown[]) => void) {}
  observe(target: unknown) {
    this.callback([{ isIntersecting: true, target }]);
  }
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "IntersectionObserver", {
  value: VisibilityObserver,
});
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
HTMLCanvasElement.prototype.getContext = (() =>
  null) as typeof HTMLCanvasElement.prototype.getContext;

const React = await import("react");
const { render, screen, within, fireEvent, waitFor, cleanup, configure } =
  await import("@testing-library/react");
configure({ asyncUtilTimeout: 5000 });
const { MemoryRouter } = await import("react-router-dom");
const { QueryClient, QueryClientProvider } = await import(
  "@tanstack/react-query"
);
const { AuthProvider, ToastProvider, I18nProvider } = await import(
  "../src/lib"
);
const { MarketProvider } = await import("../src/market-state");
const { default: App } = await import("../src/App");
let fixture: ReturnType<typeof createApp>,
  dir: string,
  agent: ReturnType<typeof request.agent>,
  client: InstanceType<typeof QueryClient>;
const inflight = new Set<Promise<unknown>>();
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  dir = mkdtempSync(join(tmpdir(), "blizu-ux-"));
  fixture = createApp({
    store: new Store(":memory:"),
    demo: true,
    dataDir: dir,
    origin: "http://blizu.test",
  });
  agent = request.agent(fixture.app);
  client = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
    },
  });
  globalThis.fetch = (input, init = {}) => {
    const url = new URL(String(input), "http://blizu.test");
    const method = (init.method || "GET").toLowerCase() as
      | "get"
      | "post"
      | "put"
      | "patch";
    let operation = agent[method](url.pathname + url.search).set(
      "Origin",
      "http://blizu.test",
    );
    if (init.body) operation = operation.send(JSON.parse(String(init.body)));
    const promise = operation.then((response) => {
      return new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    });
    inflight.add(promise);
    promise.finally(() => inflight.delete(promise));
    return promise;
  };
});
afterEach(async () => {
  cleanup();
  client.clear();
  await Promise.allSettled([...inflight]);
  fixture.store.close();
  rmSync(dir, { recursive: true, force: true });
});
function mount(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <I18nProvider>
          <ToastProvider>
            <AuthProvider>
              <MarketProvider>
                <App />
              </MarketProvider>
            </AuthProvider>
          </ToastProvider>
        </I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
async function cards() {
  await waitFor(() => assert.equal(screen.getAllByRole("article").length, 8));
  return screen.getAllByRole("article");
}
function header() {
  return within(screen.getByRole("banner"));
}

test("catalog applies bookmarked search, city and budget through the real API", async () => {
  mount("/?q=Кондиционер&city=Бар&maxPrice=40&sort=price");
  await waitFor(() => assert.equal(screen.getAllByRole("article").length, 1));
  assert.equal(
    (screen.getByLabelText("Что вы ищете?") as HTMLInputElement).value,
    "Кондиционер",
  );
  assert.equal(
    (screen.getByLabelText("Город поиска") as HTMLSelectElement).value,
    "Бар",
  );
  assert.equal(
    (screen.getByLabelText("Максимальная цена") as HTMLInputElement).value,
    "40",
  );
  assert.match(
    screen.getAllByRole("article")[0].textContent || "",
    /Кондиционер/,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Убрать фильтр: до 40 €" }),
  );
  await waitFor(() =>
    assert.equal(
      (screen.getByLabelText("Максимальная цена") as HTMLInputElement).value,
      "",
    ),
  );
});

test("search history and real price validation help refine or recover a search", async () => {
  mount();
  await cards();
  fireEvent.change(screen.getByLabelText("Что вы ищете?"), {
    target: { value: "кондиционер" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Найти предложения" }));
  await waitFor(() => assert.equal(screen.getAllByRole("article").length, 1));
  assert.deepEqual(JSON.parse(localStorage.getItem("blizu.search-history")!), [
    "кондиционер",
  ]);
  fireEvent.change(screen.getByLabelText("Минимальная цена"), {
    target: { value: "100" },
  });
  fireEvent.change(screen.getByLabelText("Максимальная цена"), {
    target: { value: "10" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Применить фильтры" }));
  assert.ok(
    screen.getByRole("alert").textContent?.includes("не должна быть больше"),
  );
  assert.equal(screen.getAllByRole("article").length, 1);
  fireEvent.click(
    screen.getByRole("button", { name: "Сбросить всё", exact: true }),
  );
  await cards();
  assert.equal(
    (screen.getByLabelText("Минимальная цена") as HTMLInputElement).value,
    "",
  );
  assert.equal(
    (screen.getByLabelText("Максимальная цена") as HTMLInputElement).value,
    "",
  );
});

test("mobile filter dialog applies real results and changing a city resets pagination", async () => {
  const expected = (
    await agent.get("/api/listings?city=Бар&maxPrice=20").expect(200)
  ).body.items;
  mount("/?page=2");
  fireEvent.change(screen.getByLabelText("Город поиска"), {
    target: { value: "Бар" },
  });
  await waitFor(() => assert.ok(screen.getAllByRole("article").length > 0));
  fireEvent.click(screen.getByRole("button", { name: /^Фильтры/ }));
  const dialog = within(
    screen.getByRole("dialog", { name: "Фильтры предложений" }),
  );
  fireEvent.change(dialog.getByLabelText("Максимальная цена"), {
    target: { value: "20" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Применить фильтры" }));
  await waitFor(() => {
    if (screen.queryByRole("dialog")) throw new Error("Dialog is still open");
  });
  await waitFor(() =>
    assert.equal(screen.getAllByRole("article").length, expected.length),
  );
});

test("guest favorites survive navigation and malformed storage does not break discovery", async () => {
  localStorage.setItem("blizu.guest-saved.v1", '[{}, {"id":"broken"}]');
  mount();
  const items = await cards();
  const title = within(items[0]).getAllByRole("link")[0].textContent;
  fireEvent.click(
    within(items[0]).getByRole("button", { name: "В избранное" }),
  );
  assert.equal(
    JSON.parse(localStorage.getItem("blizu.guest-saved.v1")!).length,
    1,
  );
  fireEvent.click(header().getByRole("link", { name: "Избранное" }));
  await waitFor(() => assert.equal(screen.getAllByRole("article").length, 1));
  assert.ok(screen.getByText(/сохранено на этом устройстве/));
  assert.ok(screen.getAllByRole("article")[0].textContent?.includes(title!));
});

test("comparison keeps selections across routes and recent views return on discovery", async () => {
  mount();
  const items = await cards();
  for (const item of items.slice(0, 2))
    fireEvent.click(within(item).getByRole("button", { name: /^Сравнить:/ }));
  const tray = within(
    screen.getByRole("complementary", { name: "Предложения для сравнения" }),
  );
  fireEvent.click(tray.getByRole("button", { name: "Сравнить", exact: true }));
  const dialog = within(
    screen.getByRole("dialog", { name: "Выбирайте с уверенностью" }),
  );
  assert.ok(dialog.getByRole("table"));
  assert.ok(dialog.getByText(/разные единицы/));
  fireEvent.click(dialog.getByRole("button", { name: "Закрыть", exact: true }));
  const titleLink = within(items[0])
    .getAllByRole("link")
    .find((link) => link.classList.contains("listing-title"))!;
  fireEvent.click(titleLink);
  await waitFor(() =>
    assert.equal(
      JSON.parse(localStorage.getItem("blizu.recent.v1") || "[]").length,
      1,
    ),
  );
  assert.ok(
    screen.getByRole("complementary", { name: "Предложения для сравнения" }),
  );
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Основная навигация" }),
    ).getByRole("link", { name: "Услуги и товары" }),
  );
  assert.ok(
    await screen.findByRole("heading", { name: "Вы недавно смотрели" }),
  );
});

test("a request draft survives closing and disappears only after successful publication", async () => {
  await agent.post("/api/auth/demo").send({ role: "customer" }).expect(200);
  mount();
  await cards();
  fireEvent.click(
    header().getByRole("button", { name: "Создать заявку", exact: true }),
  );
  let dialog = within(
    screen.getByRole("dialog", { name: "Что нужно сделать?" }),
  );
  fireEvent.change(dialog.getByLabelText("Коротко о задаче"), {
    target: { value: "Нужна помощь с квартирой" },
  });
  fireEvent.change(dialog.getByLabelText("Подробности"), {
    target: {
      value: "Нужно подготовить квартиру к заселению на следующей неделе.",
    },
  });
  fireEvent.change(dialog.getByLabelText("Категория"), {
    target: { value: "repair" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Закрыть", exact: true }));
  fireEvent.click(
    header().getByRole("button", { name: "Создать заявку", exact: true }),
  );
  dialog = within(screen.getByRole("dialog", { name: "Что нужно сделать?" }));
  assert.equal(
    (dialog.getByLabelText("Коротко о задаче") as HTMLInputElement).value,
    "Нужна помощь с квартирой",
  );
  assert.ok(
    (
      dialog.getByLabelText("Подробности") as HTMLTextAreaElement
    ).value.includes("следующей неделе"),
  );
  fireEvent.click(
    dialog.getByRole("button", { name: "Создать заявку", exact: true }),
  );
  await waitFor(() => {
    if (screen.queryByRole("dialog")) throw new Error("Dialog is still open");
  });
  assert.ok(
    await screen.findByRole("heading", {
      name: "Нужна помощь с квартирой",
      level: 1,
    }),
  );
  const key = Object.keys(sessionStorage).find((key) =>
    key.startsWith("blizu.draft."),
  )!;
  assert.equal(JSON.parse(sessionStorage.getItem(key)!).request, undefined);
});

test("guest favorites transfer into an account only after explicit action", async () => {
  mount();
  const items = await cards();
  fireEvent.click(
    within(items[0]).getByRole("button", { name: "В избранное" }),
  );
  const saved = JSON.parse(localStorage.getItem("blizu.guest-saved.v1")!);
  cleanup();
  client.clear();
  await Promise.allSettled([...inflight]);
  await agent.post("/api/auth/demo").send({ role: "customer" }).expect(200);
  mount("/favorites");
  fireEvent.click(
    await screen.findByRole("button", { name: "Перенести избранное" }),
  );
  await waitFor(() =>
    assert.deepEqual(
      JSON.parse(localStorage.getItem("blizu.guest-saved.v1")!),
      [],
    ),
  );
  await screen.findByRole("link", { name: saved[0].title, exact: true });
  const response = await agent.get("/api/favorites").expect(200);
  assert.ok(response.body.ids.includes(saved[0].id));
});

test("delivery keeps the product link and origin through guest sign-in without publishing a request", async () => {
  mount("/delivery");
  const form = within(screen.getByRole("form", { name: "Заявка на доставку" }));
  const productUrl = "https://shop.example/product?id=2";
  fireEvent.change(form.getByLabelText("Ссылка на покупку"), {
    target: { value: productUrl },
  });
  fireEvent.change(form.getByLabelText("Страна отправления"), {
    target: { value: "Китай" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Заявка на доставку" }));
  const auth = within(
    await screen.findByRole("dialog", { name: "С возвращением" }),
  );
  fireEvent.click(
    await auth.findByRole("button", { name: "Заказчик", exact: true }),
  );
  const create = within(
    await screen.findByRole("dialog", { name: "Доставим то, чего не хватает" }),
  );
  assert.equal(
    (create.getByLabelText("Ссылка на товар") as HTMLInputElement).value,
    productUrl,
  );
  assert.equal(
    (create.getByLabelText("Откуда доставить") as HTMLSelectElement).value,
    "Китай",
  );
  const dashboard = await agent.get("/api/dashboard").expect(200);
  assert.ok(
    !dashboard.body.requests.some(
      (r: { productUrl: string }) => r.productUrl === productUrl,
    ),
  );
  fireEvent.click(create.getByRole("button", { name: "Закрыть", exact: true }));
  assert.equal(
    (form.getByLabelText("Ссылка на покупку") as HTMLInputElement).value,
    productUrl,
  );
});

test("orders restore filters from a link, search real orders, sort prices and recover from an empty result", async () => {
  await agent.post("/api/auth/demo").send({ role: "customer" }).expect(200);
  for (const [id, title, amount, status] of [
    ["finished-order", "Уборка квартиры", 30, "completed"],
    ["disputed-order", "Ремонт техники", 90, "disputed"],
  ]) {
    fixture.store.run(
      "INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      id,
      "demo-customer",
      "demo-provider",
      null,
      title,
      "service",
      "Бар",
      amount,
      status,
      "2026-01-01T10:00:00.000Z",
      "2026-01-02T10:00:00.000Z",
    );
  }
  mount("/orders?kind=delivery&phase=active");
  let list = within(
    await screen.findByRole("list", { name: "Список заказов" }),
  );
  assert.equal(list.getAllByRole("listitem").length, 1);
  assert.ok(list.getByRole("heading", { name: "Посылка из Европы в Будву" }));
  assert.ok(list.getByRole("img", { name: "Доставка: В пути. Этап 3 из 5." }));
  const phases = within(
    screen.getByRole("group", { name: "Состояние заказов" }),
  );
  assert.equal(
    phases
      .getByRole("button", { name: /^Активные/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
  await waitFor(() =>
    assert.equal(
      within(screen.getByRole("list", { name: "Список заказов" })).getAllByRole(
        "listitem",
      ).length,
      3,
    ),
  );
  fireEvent.change(screen.getByLabelText("Сортировка заказов"), {
    target: { value: "price" },
  });
  list = within(screen.getByRole("list", { name: "Список заказов" }));
  assert.ok(
    within(list.getAllByRole("listitem")[0]).getByRole("heading", {
      name: "Уборка квартиры",
    }),
  );
  fireEvent.click(phases.getByRole("button", { name: /^Споры/ }));
  assert.ok(
    !within(screen.getByRole("list", { name: "Список заказов" })).queryByRole(
      "img",
    ),
  );
  assert.ok(
    within(screen.getByRole("list", { name: "Список заказов" })).getByRole(
      "heading",
      { name: "Ремонт техники" },
    ),
  );
  fireEvent.change(screen.getByLabelText("Поиск по заказам"), {
    target: { value: "несуществующий" },
  });
  assert.ok(screen.getByRole("heading", { name: "Таких заказов пока нет" }));
  fireEvent.click(screen.getByRole("button", { name: "Показать все заказы" }));
  fireEvent.click(phases.getByRole("button", { name: /^Завершённые/ }));
  assert.equal(
    within(screen.getByRole("list", { name: "Список заказов" })).getAllByRole(
      "listitem",
    ).length,
    1,
  );
  assert.ok(screen.getByRole("heading", { name: "Уборка квартиры" }));
  assert.ok(
    screen.getByRole("img", { name: "Услуга: Завершён. Этап 3 из 3." }),
  );
});

test("delivery progress follows receipt confirmation and never gives the customer provider actions", async () => {
  await agent.post("/api/auth/demo").send({ role: "customer" }).expect(200);
  fixture.store.run("UPDATE orders SET status='arrived' WHERE id='order-demo'");
  fixture.store.event(
    "order-demo",
    "arrived",
    "Посылка прибыла в пункт выдачи.",
  );
  mount("/orders/order-demo");
  let stages = await screen.findByRole("list", { name: "Этапы заказа" });
  assert.equal(within(stages).getAllByRole("listitem").length, 5);
  assert.ok(
    stages
      .querySelector('[aria-current="step"]')
      ?.textContent?.includes("Прибыло"),
  );
  assert.ok(!screen.queryByRole("button", { name: "Посылка отправлена" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Подтвердить получение" }),
  );
  await waitFor(() => {
    if (
      !screen
        .getByRole("list", { name: "Этапы заказа" })
        .querySelector('[aria-current="step"]')
        ?.textContent?.includes("Получено")
    )
      throw new Error(
        "Receipt confirmation is not reflected in the progress yet",
      );
  });
  stages = screen.getByRole("list", { name: "Этапы заказа" });
  assert.ok(
    stages
      .querySelector('[aria-current="step"]')
      ?.textContent?.includes("Получено"),
  );
  const response = await agent.get("/api/orders/order-demo").expect(200);
  assert.equal(response.body.order.status, "completed");
});

test("workspace next steps come from real offers and a delivery awaiting the customer's confirmation", async () => {
  await agent.post("/api/auth/demo").send({ role: "customer" }).expect(200);
  fixture.store.run("UPDATE orders SET status='arrived' WHERE id='order-demo'");
  mount("/dashboard");
  const attention = within(
    await screen.findByRole("region", { name: "С чего продолжить" }),
  );
  const confirm = attention.getByRole("link", {
    name: /Подтвердить получение/,
  });
  assert.equal(confirm.getAttribute("href"), "/orders/order-demo");
  assert.ok(attention.getByRole("link", { name: /Сравнить 1 отклик/ }));
  assert.ok(!attention.queryByText("Посылка отправлена"));
  fireEvent.click(confirm);
  assert.ok(
    await screen.findByRole("button", { name: "Подтвердить получение" }),
  );
});

test("delivery answers expose their expanded state and closing a save notification keeps the favorite", async () => {
  mount("/delivery");
  const question = screen.getByRole("button", {
    name: "Как узнать стоимость?",
  });
  const content = document.getElementById(
    question.getAttribute("aria-controls")!,
  )!;
  assert.equal(question.getAttribute("aria-expanded"), "false");
  assert.equal(content.getAttribute("aria-hidden"), "true");
  assert.ok(content.hasAttribute("inert"));
  fireEvent.click(question);
  assert.equal(question.getAttribute("aria-expanded"), "true");
  assert.equal(content.getAttribute("aria-hidden"), "false");
  assert.ok(!content.hasAttribute("inert"));
  fireEvent.click(question);
  assert.equal(content.getAttribute("aria-hidden"), "true");
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Основная навигация" }),
    ).getByRole("link", { name: "Услуги и товары" }),
  );
  const items = await cards();
  fireEvent.click(
    within(items[0]).getByRole("button", { name: "В избранное" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Закрыть уведомление" }));
  assert.ok(!screen.queryByRole("button", { name: "Закрыть уведомление" }));
  assert.equal(
    within(items[0])
      .getByRole("button", { name: "Убрать из избранного" })
      .getAttribute("aria-pressed"),
    "true",
  );
});

test("personal workspace links to the order list and preserves provider-only listings", async () => {
  await agent.post("/api/auth/demo").send({ role: "provider" }).expect(200);
  mount("/dashboard");
  await screen.findByRole("heading", { name: "Последние заказы" });
  const tabs = within(
    screen.getByRole("navigation", { name: "Разделы кабинета" }),
  );
  assert.ok(!tabs.queryByRole("button", { name: /^Споры/ }));
  fireEvent.click(tabs.getByRole("button", { name: /^Предложения/ }));
  const collection = within(
    await screen.findByRole("region", { name: "Мои предложения" }),
  );
  const response = await agent.get("/api/dashboard").expect(200);
  assert.equal(
    collection.getAllByRole("article").length,
    response.body.listings.length,
  );
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Личное пространство" }),
    ).getByRole("link", { name: "Мои заказы" }),
  );
  assert.ok(
    await screen.findByRole("heading", { level: 1, name: "Мои заказы." }),
  );
});

test("private orders require sign-in and arbiter workspace exposes disputes", async () => {
  mount("/orders");
  assert.ok(await screen.findByRole("button", { name: "Войти в аккаунт" }));
  assert.ok(!screen.queryByRole("list", { name: "Список заказов" }));
  cleanup();
  client.clear();
  await Promise.allSettled([...inflight]);
  await agent.post("/api/auth/demo").send({ role: "arbiter" }).expect(200);
  mount("/dashboard?tab=incidents");
  const tabs = within(
    await screen.findByRole("navigation", { name: "Разделы кабинета" }),
  );
  assert.ok(!tabs.queryByRole("button", { name: /^Предложения/ }));
  assert.equal(
    tabs.getByRole("button", { name: /^Споры/ }).getAttribute("aria-pressed"),
    "true",
  );
  assert.ok(await screen.findByRole("region", { name: "Споры" }));
});
