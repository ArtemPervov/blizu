import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db.function("casefold", { deterministic: true }, (value) =>
      String(value ?? "").toLocaleLowerCase("ru"),
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password TEXT NOT NULL, city TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','provider','arbiter')),
        contact TEXT NOT NULL DEFAULT '', rating REAL NOT NULL DEFAULT 5, verified INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY, providerId TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL,
        category TEXT NOT NULL, city TEXT NOT NULL, price REAL NOT NULL CHECK(price>=0), unit TEXT NOT NULL,
        image TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', reviewCount INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL,
        category TEXT NOT NULL, city TEXT NOT NULL, budget REAL NOT NULL CHECK(budget>=0), kind TEXT NOT NULL,
        productUrl TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY, requestId TEXT NOT NULL REFERENCES requests(id), providerId TEXT NOT NULL REFERENCES users(id),
        price REAL NOT NULL CHECK(price>0), message TEXT NOT NULL, eta TEXT NOT NULL, createdAt TEXT NOT NULL,
        UNIQUE(requestId, providerId)
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES users(id), providerId TEXT NOT NULL REFERENCES users(id),
        requestId TEXT UNIQUE REFERENCES requests(id), title TEXT NOT NULL, kind TEXT NOT NULL, city TEXT NOT NULL,
        price REAL NOT NULL CHECK(price>0), status TEXT NOT NULL DEFAULT 'confirmed', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES orders(id), status TEXT NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES orders(id), authorId TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY, orderId TEXT NOT NULL UNIQUE REFERENCES orders(id), description TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '',
        previousStatus TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolution TEXT NOT NULL DEFAULT '',
        decision TEXT NOT NULL DEFAULT '', refundAmount REAL NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS favorites (userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE, PRIMARY KEY(userId,listingId));
      CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, href TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS listings_filter ON listings(category,city);
      CREATE INDEX IF NOT EXISTS requests_filter ON requests(status,city);
      CREATE INDEX IF NOT EXISTS orders_parties ON orders(customerId,providerId);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expiresAt);
      PRAGMA user_version=1;
    `);
  }
  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  run(sql: string, ...params: SQLInputValue[]) {
    return this.db.prepare(sql).run(...params);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  notify(userId: string, text: string, href: string) {
    this.run(
      "INSERT INTO notifications VALUES (?,?,?,?,0,?)",
      randomUUID(),
      userId,
      text,
      href,
      now(),
    );
  }
  event(orderId: string, status: string, note: string) {
    this.run(
      "INSERT INTO events VALUES (?,?,?,?,?)",
      randomUUID(),
      orderId,
      status,
      note,
      now(),
    );
  }
  close() {
    this.db.close();
  }
}
export const now = () => new Date().toISOString();
export function hashPasswordSync(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function seedDemo(store: Store) {
  if (store.get("SELECT id FROM users WHERE id=?", "demo-customer")) return;
  const password = hashPasswordSync("demo-blizu-2026");
  const users = [
    [
      "demo-customer",
      "Анастасия",
      "customer@demo.blizu.local",
      "Будва",
      "customer",
      "@anastasia_demo",
      5,
      0,
    ],
    [
      "demo-provider",
      "Сергей М.",
      "provider@demo.blizu.local",
      "Бар",
      "provider",
      "@sergey_demo",
      4.9,
      1,
    ],
    [
      "demo-arbiter",
      "Команда заботы blizu",
      "arbiter@demo.blizu.local",
      "Будва",
      "arbiter",
      "@blizu_demo",
      5,
      1,
    ],
    [
      "demo-elena",
      "Елена К.",
      "elena@demo.blizu.local",
      "Будва",
      "provider",
      "@elena_demo",
      4.9,
      1,
    ],
    [
      "demo-alex",
      "Александр П.",
      "alex@demo.blizu.local",
      "Тиват",
      "provider",
      "@alex_demo",
      4.8,
      1,
    ],
    [
      "demo-marina",
      "Марина В.",
      "marina@demo.blizu.local",
      "Будва",
      "provider",
      "@marina_demo",
      5,
      1,
    ],
    [
      "demo-legal",
      "Adriatic Consulting",
      "legal@demo.blizu.local",
      "Подгорица",
      "provider",
      "@adriatic_demo",
      4.9,
      1,
    ],
    [
      "demo-market",
      "MaxMarkt",
      "market@demo.blizu.local",
      "Бар",
      "provider",
      "@maxmarkt_demo",
      4.8,
      1,
    ],
    [
      "demo-logistic",
      "Balkan Express",
      "logistic@demo.blizu.local",
      "Бар",
      "provider",
      "@balkan_demo",
      4.9,
      1,
    ],
  ];
  store.transaction(() => {
    for (const [
      id,
      name,
      email,
      city,
      role,
      contact,
      rating,
      verified,
    ] of users)
      store.run(
        "INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?)",
        id,
        name,
        email,
        password,
        city,
        role,
        contact,
        rating,
        verified,
        now(),
      );
    const listings = [
      [
        "l-repair",
        "demo-provider",
        "Кондиционер снова как новый",
        "Чистка, диагностика и ремонт кондиционеров. Приезжаю со своим инструментом. Сначала согласуем стоимость, затем приступаю к работе. Работаю в Баре, Шушани и Сутоморе.",
        "repair",
        "Бар",
        35,
        "услуга",
        "repair.jpg",
        ["Выезд на дом", "Говорю по-русски"],
        38,
      ],
      [
        "l-food",
        "demo-elena",
        "Домашняя еда с заботой о вас",
        "Пельмени ручной лепки, сырники и домашние обеды из свежих продуктов. Готовлю под заказ. Состав и аллергены уточняйте перед заказом. Доставка по Будве и Бечичи.",
        "food",
        "Будва",
        12,
        "порция",
        "food.jpg",
        ["Под заказ", "Доставка"],
        56,
      ],
      [
        "l-auto",
        "demo-alex",
        "Ваш автомобиль в надёжных руках",
        "Диагностика, замена масла и расходников, помощь с подбором запчастей. Обсудим вашу задачу и договоримся об удобном времени.",
        "auto",
        "Тиват",
        25,
        "услуга",
        "auto.jpg",
        ["Диагностика", "Без выходных"],
        24,
      ],
      [
        "l-beauty",
        "demo-marina",
        "Время позаботиться о себе",
        "Расслабляющий массаж в уютной студии в Будве. Индивидуальный подход и спокойная атмосфера. Перед записью сообщите о противопоказаниях.",
        "beauty",
        "Будва",
        40,
        "сеанс",
        "wellness.jpg",
        ["Уютная студия", "По записи"],
        42,
      ],
      [
        "l-legal",
        "demo-legal",
        "Документы без лишних хлопот",
        "Бухгалтерское сопровождение компаний, подготовка документов для ВНЖ и консультации по открытию бизнеса. Условия обсуждаем на первой встрече.",
        "business",
        "Подгорица",
        50,
        "консультация",
        "business.jpg",
        ["Бухгалтерия", "ВНЖ"],
        19,
      ],
      [
        "l-market",
        "demo-market",
        "Знакомые продукты рядом",
        "Продукты и товары для дома в MaxMarkt. Поможем собрать заказ и организуем доставку по Бару. Наличие и итоговую стоимость подтверждаем перед покупкой.",
        "goods",
        "Бар",
        5,
        "товар",
        "market.jpg",
        ["Продукты", "Доставка"],
        31,
      ],
      [
        "l-delivery",
        "demo-logistic",
        "Из-за границы — прямо к вам",
        "Доставка покупок из Европы, РФ и Китая. До подтверждения заказа предоставим расчёт товара, перевозки и сроков. Статусы посылки — в личном кабинете.",
        "delivery",
        "Бар",
        15,
        "кг",
        "delivery.jpg",
        ["РФ · Китай · Европа", "Отслеживание"],
        27,
      ],
      [
        "l-plumber",
        "demo-provider",
        "Мастер для вашего дома",
        "Сантехника, мелкий ремонт, установка техники и сборка мебели. Помогу решить бытовые задачи аккуратно и в согласованное время.",
        "repair",
        "Будва",
        30,
        "час",
        "home.jpg",
        ["Свой инструмент", "Сантехника"],
        38,
      ],
    ];
    for (const [
      id,
      provider,
      title,
      description,
      category,
      city,
      price,
      unit,
      image,
      tags,
      reviews,
    ] of listings)
      store.run(
        "INSERT INTO listings VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        String(id),
        String(provider),
        String(title),
        String(description),
        String(category),
        String(city),
        Number(price),
        String(unit),
        `/images/${image}`,
        JSON.stringify(tags),
        Number(reviews),
        now(),
      );
    const requests = [
      [
        "r-ac",
        "Починить кондиционер в Шушани",
        "Кондиционер включается, но не охлаждает. Нужны диагностика и ремонт, желательно на этой неделе.",
        "repair",
        "Бар",
        60,
        "service",
        "",
        "",
      ],
      [
        "r-food",
        "Домашние обеды на рабочую неделю",
        "Ищу человека, который готовит вкусные домашние обеды на двоих. Обсудим меню и доставку.",
        "food",
        "Будва",
        80,
        "service",
        "",
        "",
      ],
      [
        "r-parcel",
        "Доставить посылку из Москвы в Будву",
        "Небольшая коробка с личными вещами, около 4 кг. Нужен расчёт и ориентировочный срок.",
        "delivery",
        "Будва",
        70,
        "delivery",
        "https://example.com/product",
        "Россия",
      ],
    ];
    for (const [
      id,
      title,
      description,
      category,
      city,
      budget,
      kind,
      url,
      origin,
    ] of requests)
      store.run(
        "INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        "demo-customer",
        title,
        description,
        category,
        city,
        budget,
        kind,
        url,
        origin,
        "open",
        now(),
      );
    store.run(
      "INSERT INTO offers VALUES (?,?,?,?,?,?,?)",
      "offer-demo",
      "r-ac",
      "demo-provider",
      45,
      "Проведу диагностику и чистку. Если нужны запчасти, согласуем их стоимость отдельно.",
      "Завтра, после 14:00",
      now(),
    );
    store.run(
      "INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      "order-demo",
      "demo-customer",
      "demo-logistic",
      null,
      "Посылка из Европы в Будву",
      "delivery",
      "Будва",
      48,
      "in_transit",
      now(),
      now(),
    );
    store.event(
      "order-demo",
      "confirmed",
      "Согласовали доставку до Будвы. Оплата наличными при встрече.",
    );
    store.event(
      "order-demo",
      "in_progress",
      "Покупка получена на складе отправления.",
    );
    store.event(
      "order-demo",
      "in_transit",
      "Посылка отправилась в Черногорию. Ориентировочный срок — 5–7 дней.",
    );
    store.notify(
      "demo-customer",
      "Ваша посылка уже в пути. Следите за доставкой в заказе.",
      "/orders/order-demo",
    );
  });
}
