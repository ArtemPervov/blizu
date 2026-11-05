import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  CATEGORIES,
  CITIES,
  STATUS_LABELS,
  type User,
  type Order,
  type OrderStatus,
  type ServiceRequest,
  type Offer,
  type Incident,
} from "../shared/types.js";
import { Store, now, seedDemo } from "./db.js";

const scryptAsync = promisify(scrypt);
const userSelect = "id,name,email,city,role,contact,rating,verified";
const listingsSelect = `SELECT l.*, u.name providerName,u.rating providerRating,u.verified providerVerified FROM listings l JOIN users u ON u.id=l.providerId`;
const requestsSelect = `SELECT r.*,u.name customerName,(SELECT COUNT(*) FROM offers o WHERE o.requestId=r.id) offerCount FROM requests r JOIN users u ON u.id=r.customerId`;
const offersSelect = `SELECT o.*,u.name providerName,u.rating providerRating FROM offers o JOIN users u ON u.id=o.providerId`;
const ordersSelect = `SELECT o.*,c.name customerName,p.name providerName,c.contact customerContact,p.contact providerContact FROM orders o JOIN users c ON c.id=o.customerId JOIN users p ON p.id=o.providerId`;
const incidentsSelect = `SELECT i.*,o.title,c.name customerName,p.name providerName FROM incidents i JOIN orders o ON o.id=i.orderId JOIN users c ON c.id=o.customerId JOIN users p ON p.id=o.providerId`;
const category = z.enum(
  CATEGORIES.filter((c) => c.id !== "all").map((c) => c.id),
);
const city = z.enum(CITIES);
const text = (min = 1, max = 3000) => z.string().trim().min(min).max(max);
const money = z.number().finite().positive().max(1000000);
const link = z
  .string()
  .url()
  .max(2000)
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "Используйте ссылку http или https",
  );
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type AuthRequest = Request & { user?: User };
export type AppOptions = {
  store?: Store;
  demo?: boolean;
  production?: boolean;
  origin?: string;
  dataDir?: string;
  staleHours?: number;
};

export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await scryptAsync(password, salt, 64)) as Buffer).toString("hex")}`;
}
async function passwordMatches(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const calculated = (await scryptAsync(password, salt, 64)) as Buffer;
  const original = Buffer.from(key, "hex");
  return (
    calculated.length === original.length &&
    timingSafeEqual(calculated, original)
  );
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function createApp(options: AppOptions = {}) {
  const dataDir = resolve(options.dataDir ?? "data");
  const store = options.store ?? new Store(resolve(dataDir, "blizu.sqlite"));
  const demo = options.demo ?? false;
  const production = options.production ?? false;
  if (
    production &&
    !demo &&
    store.get("SELECT id FROM users WHERE id=?", "demo-customer")
  )
    throw new Error(
      "A database with demo accounts cannot be used in production with ENABLE_DEMO=false. Use a clean production volume.",
    );
  if (demo) seedDemo(store);
  const uploadDir = resolve(dataDir, "uploads");
  mkdirSync(uploadDir, { recursive: true });
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", production ? 2 : 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Слишком много запросов. Попробуйте через минуту." },
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const expected = options.origin ?? "http://localhost:5173";
      const devOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
      if (
        req.get("sec-fetch-site") === "cross-site" ||
        (origin &&
          origin !== expected &&
          (production || !devOrigins.includes(origin)))
      )
        return next(new HttpError(403, "Запрос с другого сайта отклонён."));
      if (
        production &&
        !origin &&
        !req.is("application/json") &&
        req.method !== "GET"
      )
        return next(new HttpError(403, "Для этого запроса требуется Origin."));
    }
    next();
  });
  app.use("/api", (req: AuthRequest, _res, next) => {
    const token = req.cookies.blizu_session;
    if (typeof token === "string") {
      const user = store.get<User>(
        `SELECT ${userSelect
          .split(",")
          .map((c) => `u.${c}`)
          .join(
            ",",
          )} FROM sessions s JOIN users u ON u.id=s.userId WHERE s.token=? AND s.expiresAt>?`,
        digest(token),
        now(),
      );
      if (user) req.user = { ...user, verified: Boolean(user.verified) };
    }
    next();
  });
  const requireUser = (req: AuthRequest, _res: Response, next: NextFunction) =>
    req.user
      ? next()
      : next(new HttpError(401, "Войдите в аккаунт, чтобы продолжить."));
  const role =
    (required: string) =>
    (req: AuthRequest, _res: Response, next: NextFunction) =>
      req.user?.role === required
        ? next()
        : next(new HttpError(403, "Недостаточно прав для этого действия."));
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    message: { error: "Слишком много попыток. Попробуйте через 15 минут." },
  });
  function startSession(res: Response, userId: string) {
    const token = randomBytes(32).toString("hex");
    store.run("DELETE FROM sessions WHERE expiresAt<?", now());
    store.run(
      "INSERT INTO sessions VALUES (?,?,?)",
      digest(token),
      userId,
      new Date(Date.now() + 7 * 86400000).toISOString(),
    );
    res.cookie("blizu_session", token, {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      maxAge: 7 * 86400000,
      path: "/",
    });
    return store.get<User>(
      `SELECT ${userSelect} FROM users WHERE id=?`,
      userId,
    );
  }
  function accessibleOrder(id: string, user: User): Order {
    const order = store.get<Order>(`${ordersSelect} WHERE o.id=?`, id);
    if (!order) throw new HttpError(404, "Заказ не найден.");
    if (
      user.role !== "arbiter" &&
      order.customerId !== user.id &&
      order.providerId !== user.id
    )
      throw new HttpError(403, "У вас нет доступа к этому заказу.");
    return order;
  }
  function openIncident(order: Order, description: string, evidence = "") {
    if (store.get("SELECT id FROM incidents WHERE orderId=?", order.id))
      throw new HttpError(409, "Инцидент по этому заказу уже существует.");
    const id = randomUUID();
    store.run(
      "INSERT INTO incidents (id,orderId,description,evidence,previousStatus,createdAt) VALUES (?,?,?,?,?,?)",
      id,
      order.id,
      description,
      evidence,
      order.status,
      now(),
    );
    store.run(
      "UPDATE orders SET status=?,updatedAt=? WHERE id=?",
      "disputed",
      now(),
      order.id,
    );
    store.event(order.id, "disputed", description);
    for (const userId of new Set([
      order.customerId,
      order.providerId,
      ...store
        .all<{ id: string }>("SELECT id FROM users WHERE role='arbiter'")
        .map((u) => u.id),
    ]))
      store.notify(
        userId,
        `Открыт спор: ${order.title}`,
        `/orders/${order.id}`,
      );
    return id;
  }
  function checkStaleOrders() {
    const threshold = new Date(
      Date.now() - (options.staleHours ?? 72) * 3600000,
    ).toISOString();
    const stale = store.all<Order>(
      `${ordersSelect} WHERE o.kind='delivery' AND o.status IN ('in_progress','in_transit') AND o.updatedAt<? AND NOT EXISTS (SELECT 1 FROM incidents WHERE orderId=o.id)`,
      threshold,
    );
    for (const order of stale)
      store.transaction(() =>
        openIncident(
          order,
          "Статус доставки долго не обновлялся. Создан автоматический инцидент для проверки арбитром.",
        ),
      );
    return stale.length;
  }

  app.get("/api/health", (_req, res) => {
    store.get("SELECT 1");
    res.json({ status: "ok" });
  });
  app.get("/api/meta", (_req, res) =>
    res.json({
      demo,
      categories: CATEGORIES,
      cities: CITIES,
      stats: {
        listings: store.get<{ n: number }>("SELECT COUNT(*) n FROM listings")
          ?.n,
        providers: store.get<{ n: number }>(
          "SELECT COUNT(*) n FROM users WHERE role='provider'",
        )?.n,
        requests: store.get<{ n: number }>(
          "SELECT COUNT(*) n FROM requests WHERE status='open'",
        )?.n,
      },
    }),
  );
  app.get("/api/auth/me", (req: AuthRequest, res) =>
    res.json({ user: req.user ?? null }),
  );
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    const input = z
      .object({
        name: text(2, 80),
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(10).max(128),
        city,
        role: z.enum(["customer", "provider"]),
        contact: text(3, 150),
      })
      .parse(req.body);
    if (store.get("SELECT id FROM users WHERE email=?", input.email))
      throw new HttpError(409, "Этот email уже зарегистрирован.");
    const id = randomUUID();
    const password = await passwordHash(input.password);
    store.run(
      "INSERT INTO users (id,name,email,password,city,role,contact,createdAt) VALUES (?,?,?,?,?,?,?,?)",
      id,
      input.name,
      input.email,
      password,
      input.city,
      input.role,
      input.contact,
      now(),
    );
    res.status(201).json({ user: startSession(res, id) });
  });
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const input = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(128),
      })
      .parse(req.body);
    const user = store.get<User & { password: string }>(
      "SELECT * FROM users WHERE email=?",
      input.email,
    );
    // Run scrypt even for unknown emails to avoid a fast account enumeration path.
    const valid = await passwordMatches(
      input.password,
      user?.password ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    if (!user || !valid) throw new HttpError(401, "Неверный email или пароль.");
    res.json({ user: startSession(res, user.id) });
  });
  if (demo)
    app.post("/api/auth/demo", authLimiter, (req, res) => {
      const { role } = z
        .object({ role: z.enum(["customer", "provider", "arbiter"]) })
        .parse(req.body);
      res.json({ user: startSession(res, `demo-${role}`) });
    });
  app.post("/api/auth/logout", (req: AuthRequest, res) => {
    if (typeof req.cookies.blizu_session === "string")
      store.run(
        "DELETE FROM sessions WHERE token=?",
        digest(req.cookies.blizu_session),
      );
    res.clearCookie("blizu_session", {
      path: "/",
      httpOnly: true,
      secure: production,
      sameSite: "lax",
    });
    res.json({ ok: true });
  });

  app.get("/api/listings", (req, res) => {
    const input = z
      .object({
        q: z.string().max(200).optional(),
        category: z.string().max(40).optional(),
        city: z.string().max(80).optional(),
        sort: z
          .enum(["recommended", "newest", "price", "price_desc", "rating"])
          .default("recommended"),
        minPrice: z.coerce.number().min(0).max(1000000).optional(),
        maxPrice: z.coerce.number().min(0).max(1000000).optional(),
        minRating: z.coerce.number().min(0).max(5).optional(),
        verified: z.enum(["1"]).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(60),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .refine(
        (value) =>
          value.minPrice === undefined ||
          value.maxPrice === undefined ||
          value.minPrice <= value.maxPrice,
        { message: "Минимальная цена не должна быть выше максимальной" },
      )
      .parse(req.query);
    const where = ["1=1"];
    const params: (string | number)[] = [];
    if (input.category && input.category !== "all") {
      where.push("l.category=?");
      params.push(input.category);
    }
    if (input.city && input.city !== "Вся Черногория") {
      where.push("l.city=?");
      params.push(input.city);
    }
    if (input.q) {
      where.push(
        "instr(casefold(l.title || ' ' || l.description || ' ' || u.name),?)>0",
      );
      params.push(input.q.toLocaleLowerCase("ru"));
    }
    if (input.minPrice !== undefined) {
      where.push("l.price>=?");
      params.push(input.minPrice);
    }
    if (input.maxPrice !== undefined) {
      where.push("l.price<=?");
      params.push(input.maxPrice);
    }
    if (input.minRating !== undefined) {
      where.push("u.rating>=?");
      params.push(input.minRating);
    }
    if (input.verified) where.push("u.verified=1");
    const total =
      store.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM listings l JOIN users u ON u.id=l.providerId WHERE ${where.join(" AND ")}`,
        ...params,
      )?.count ?? 0;
    const ordering =
      input.sort === "price"
        ? "l.price ASC,l.id ASC"
        : input.sort === "price_desc"
          ? "l.price DESC,l.id ASC"
          : input.sort === "newest"
            ? "l.createdAt DESC,l.id ASC"
            : "u.rating DESC,l.reviewCount DESC,l.id ASC";
    let items: Record<string, unknown>[] = store
      .all<
        Record<string, unknown>
      >(`${listingsSelect} WHERE ${where.join(" AND ")} ORDER BY ${ordering} LIMIT ? OFFSET ?`, ...params, input.limit, input.offset)
      .map((l) => ({
        ...l,
        tags: JSON.parse(String(l.tags)),
        providerVerified: Boolean(l.providerVerified),
      }));
    res.json({ items, total });
  });
  app.get("/api/listings/:id", (req, res) => {
    const item = store.get<Record<string, unknown>>(
      `${listingsSelect} WHERE l.id=?`,
      String(req.params.id),
    );
    if (!item) throw new HttpError(404, "Предложение не найдено.");
    res.json({
      item: {
        ...item,
        tags: JSON.parse(String(item.tags)),
        providerVerified: Boolean(item.providerVerified),
      },
    });
  });
  app.post(
    "/api/listings",
    requireUser,
    role("provider"),
    (req: AuthRequest, res) => {
      const input = z
        .object({
          title: text(5, 120),
          description: text(20, 5000),
          category,
          city,
          price: money,
          unit: text(1, 40),
          image: z
            .enum([
              "repair",
              "food",
              "auto",
              "wellness",
              "business",
              "market",
              "delivery",
              "home",
            ])
            .default("home"),
        })
        .parse(req.body);
      const id = randomUUID();
      store.run(
        "INSERT INTO listings (id,providerId,title,description,category,city,price,unit,image,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
        id,
        req.user!.id,
        input.title,
        input.description,
        input.category,
        input.city,
        input.price,
        input.unit,
        `/images/${input.image}.jpg`,
        now(),
      );
      res.status(201).json({ id });
    },
  );
  app.get("/api/favorites", requireUser, (req: AuthRequest, res) =>
    res.json({
      ids: store
        .all<{
          listingId: string;
        }>("SELECT listingId FROM favorites WHERE userId=?", req.user!.id)
        .map((r) => r.listingId),
      items: store
        .all<
          Record<string, unknown>
        >(`${listingsSelect} JOIN favorites f ON f.listingId=l.id WHERE f.userId=? ORDER BY l.createdAt DESC`, req.user!.id)
        .map((l) => ({
          ...l,
          tags: JSON.parse(String(l.tags)),
          providerVerified: Boolean(l.providerVerified),
        })),
    }),
  );
  app.put("/api/favorites/:id", requireUser, (req: AuthRequest, res) => {
    const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
    if (!store.get("SELECT id FROM listings WHERE id=?", String(req.params.id)))
      throw new HttpError(404, "Предложение не найдено.");
    if (saved)
      store.run(
        "INSERT OR IGNORE INTO favorites VALUES (?,?)",
        req.user!.id,
        String(req.params.id),
      );
    else
      store.run(
        "DELETE FROM favorites WHERE userId=? AND listingId=?",
        req.user!.id,
        String(req.params.id),
      );
    res.json({ saved });
  });

  app.get("/api/requests", (req, res) => {
    const input = z
      .object({
        city: z.string().max(80).optional(),
        category: z.string().max(40).optional(),
        kind: z.enum(["service", "delivery"]).optional(),
      })
      .parse(req.query);
    const where = ["r.status='open'"];
    const params: string[] = [];
    if (input.city && input.city !== "Вся Черногория") {
      where.push("r.city=?");
      params.push(input.city);
    }
    if (input.category && input.category !== "all") {
      where.push("r.category=?");
      params.push(input.category);
    }
    if (input.kind) {
      where.push("r.kind=?");
      params.push(input.kind);
    }
    res.json({
      items: store.all(
        `${requestsSelect} WHERE ${where.join(" AND ")} ORDER BY r.createdAt DESC LIMIT 100`,
        ...params,
      ),
    });
  });
  app.post("/api/requests", requireUser, (req: AuthRequest, res) => {
    const input = z
      .object({
        title: text(5, 120),
        description: text(15, 5000),
        category,
        city,
        budget: z.number().finite().min(0).max(1000000),
        kind: z.enum(["service", "delivery"]),
        productUrl: z.union([link, z.literal("")]).default(""),
        origin: text(0, 80).default(""),
      })
      .refine(
        (v) =>
          v.kind !== "delivery" || (v.productUrl !== "" && v.origin.length > 0),
        {
          message: "Для доставки укажите ссылку на товар и страну отправления.",
        },
      )
      .parse(req.body);
    const id = randomUUID();
    store.transaction(() => {
      store.run(
        "INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        req.user!.id,
        input.title,
        input.description,
        input.kind === "delivery" ? "delivery" : input.category,
        input.city,
        input.budget,
        input.kind,
        input.productUrl,
        input.origin,
        "open",
        now(),
      );
      const providers = store.all<{ id: string }>(
        "SELECT DISTINCT u.id FROM users u JOIN listings l ON l.providerId=u.id WHERE u.role=? AND l.category=? AND (l.city=? OR ?=? OR ?=?) AND u.id<>?",
        "provider",
        input.kind === "delivery" ? "delivery" : input.category,
        input.city,
        input.city,
        "Вся Черногория",
        input.kind,
        "delivery",
        req.user!.id,
      );
      for (const p of providers)
        store.notify(p.id, `Новая заявка: ${input.title}`, `/requests/${id}`);
    });
    res.status(201).json({ id });
  });
  app.get("/api/requests/:id", (req: AuthRequest, res) => {
    const item = store.get<ServiceRequest>(
      `${requestsSelect} WHERE r.id=?`,
      String(req.params.id),
    );
    if (!item) throw new HttpError(404, "Заявка не найдена.");
    const canSeeAll =
      req.user?.id === item.customerId || req.user?.role === "arbiter";
    const offers = req.user
      ? store.all<Offer>(
          `${offersSelect} WHERE o.requestId=?${canSeeAll ? "" : " AND o.providerId=?"} ORDER BY o.createdAt DESC`,
          ...(canSeeAll ? [item.id] : [item.id, req.user.id]),
        )
      : [];
    res.json({ item, offers });
  });
  app.post(
    "/api/requests/:id/offers",
    requireUser,
    role("provider"),
    (req: AuthRequest, res) => {
      const input = z
        .object({ price: money, message: text(10, 2000), eta: text(3, 120) })
        .parse(req.body);
      const item = store.get<ServiceRequest>(
        "SELECT * FROM requests WHERE id=?",
        String(req.params.id),
      );
      if (!item) throw new HttpError(404, "Заявка не найдена.");
      if (item.status !== "open")
        throw new HttpError(409, "По этой заявке уже выбрали исполнителя.");
      if (item.customerId === req.user!.id)
        throw new HttpError(400, "Нельзя откликнуться на собственную заявку.");
      if (
        store.get(
          "SELECT id FROM offers WHERE requestId=? AND providerId=?",
          item.id,
          req.user!.id,
        )
      )
        throw new HttpError(409, "Вы уже откликнулись на эту заявку.");
      const id = randomUUID();
      store.transaction(() => {
        store.run(
          "INSERT INTO offers VALUES (?,?,?,?,?,?,?)",
          id,
          item.id,
          req.user!.id,
          input.price,
          input.message,
          input.eta,
          now(),
        );
        store.notify(
          item.customerId,
          `${req.user!.name} откликнулся на «${item.title}»`,
          `/requests/${item.id}`,
        );
      });
      res.status(201).json({ id });
    },
  );
  app.post("/api/offers/:id/accept", requireUser, (req: AuthRequest, res) => {
    const offer = store.get<Offer>(
      "SELECT * FROM offers WHERE id=?",
      String(req.params.id),
    );
    if (!offer) throw new HttpError(404, "Отклик не найден.");
    const item = store.get<ServiceRequest>(
      "SELECT * FROM requests WHERE id=?",
      offer.requestId,
    )!;
    if (item.customerId !== req.user!.id)
      throw new HttpError(
        403,
        "Выбрать исполнителя может только автор заявки.",
      );
    const id = randomUUID();
    store.transaction(() => {
      const changed = store.run(
        "UPDATE requests SET status='assigned' WHERE id=? AND status='open'",
        item.id,
      );
      if (!changed.changes) throw new HttpError(409, "Исполнитель уже выбран.");
      store.run(
        "INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        id,
        item.customerId,
        offer.providerId,
        item.id,
        item.title,
        item.kind,
        item.city,
        offer.price,
        "confirmed",
        now(),
        now(),
      );
      store.event(
        id,
        "confirmed",
        `Условия согласованы. ${offer.eta}. ${offer.message} Оплата между сторонами, наличными при встрече.`,
      );
      store.notify(
        offer.providerId,
        `Вас выбрали исполнителем: ${item.title}`,
        `/orders/${id}`,
      );
    });
    res.status(201).json({ id });
  });

  app.get("/api/dashboard", requireUser, (req: AuthRequest, res) => {
    const u = req.user!;
    res.json({
      orders: store.all(
        `${ordersSelect} WHERE o.customerId=? OR o.providerId=? ORDER BY o.updatedAt DESC`,
        u.id,
        u.id,
      ),
      requests: store.all(
        `${requestsSelect} WHERE r.customerId=? ORDER BY r.createdAt DESC`,
        u.id,
      ),
      listings: store
        .all(
          `${listingsSelect} WHERE l.providerId=? ORDER BY l.createdAt DESC`,
          u.id,
        )
        .map((l: any) => ({ ...l, tags: JSON.parse(l.tags) })),
      incidents:
        u.role === "arbiter"
          ? store.all(
              `${incidentsSelect} ORDER BY i.status DESC,i.createdAt DESC`,
            )
          : [],
    });
  });
  app.get("/api/orders/:id", requireUser, (req: AuthRequest, res) => {
    const order = accessibleOrder(String(req.params.id), req.user!);
    res.json({
      order,
      events: store.all(
        "SELECT * FROM events WHERE orderId=? ORDER BY createdAt,rowid",
        order.id,
      ),
      messages: store.all(
        "SELECT m.*,u.name authorName FROM messages m JOIN users u ON u.id=m.authorId WHERE orderId=? ORDER BY m.createdAt,m.rowid",
        order.id,
      ),
      incident:
        store.get(`${incidentsSelect} WHERE i.orderId=?`, order.id) ?? null,
    });
  });
  app.patch("/api/orders/:id/status", requireUser, (req: AuthRequest, res) => {
    const input = z
      .object({
        status: z.enum(["in_progress", "in_transit", "arrived", "completed"]),
        note: text(0, 1000).default(""),
      })
      .parse(req.body);
    const order = accessibleOrder(String(req.params.id), req.user!);
    const provider = order.providerId === req.user!.id;
    const customer = order.customerId === req.user!.id;
    const allowed: Partial<Record<OrderStatus, OrderStatus[]>> =
      order.kind === "delivery"
        ? {
            confirmed: ["in_progress"],
            in_progress: ["in_transit"],
            in_transit: ["arrived"],
            arrived: ["completed"],
          }
        : { confirmed: ["in_progress"], in_progress: ["completed"] };
    if (!allowed[order.status]?.includes(input.status))
      throw new HttpError(
        409,
        "Такой переход статуса недоступен. Обновите страницу.",
      );
    if (input.status === "completed" ? !customer : !provider)
      throw new HttpError(
        403,
        input.status === "completed"
          ? "Получение подтверждает заказчик."
          : "Этот статус обновляет исполнитель.",
      );
    store.transaction(() => {
      store.run(
        "UPDATE orders SET status=?,updatedAt=? WHERE id=?",
        input.status,
        now(),
        order.id,
      );
      store.event(
        order.id,
        input.status,
        input.note || STATUS_LABELS[input.status],
      );
      if (input.status === "completed" && order.requestId)
        store.run(
          "UPDATE requests SET status='closed' WHERE id=?",
          order.requestId,
        );
      store.notify(
        provider ? order.customerId : order.providerId,
        `${order.title}: ${STATUS_LABELS[input.status]}`,
        `/orders/${order.id}`,
      );
    });
    res.json({ ok: true });
  });
  app.post("/api/orders/:id/messages", requireUser, (req: AuthRequest, res) => {
    const { text: message } = z.object({ text: text(1, 2000) }).parse(req.body);
    const order = accessibleOrder(String(req.params.id), req.user!);
    const id = randomUUID();
    store.run(
      "INSERT INTO messages VALUES (?,?,?,?,?)",
      id,
      order.id,
      req.user!.id,
      message,
      now(),
    );
    res.status(201).json({ id });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3 },
  });
  app.post(
    "/api/orders/:id/incident",
    requireUser,
    upload.single("evidence"),
    (req: AuthRequest, res) => {
      const { description } = z
        .object({ description: text(15, 5000) })
        .parse(req.body);
      const order = accessibleOrder(String(req.params.id), req.user!);
      if (order.customerId !== req.user!.id)
        throw new HttpError(403, "Претензию открывает заказчик.");
      if (
        ![
          "confirmed",
          "in_progress",
          "in_transit",
          "arrived",
          "completed",
        ].includes(order.status)
      )
        throw new HttpError(409, "По этому заказу нельзя открыть новый спор.");
      let evidence = "";
      if (req.file) {
        const b = req.file.buffer;
        const extension = b
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "png"
          : b[0] === 255 && b[1] === 216 && b[2] === 255
            ? "jpg"
            : b.subarray(0, 4).toString() === "RIFF" &&
                b.subarray(8, 12).toString() === "WEBP"
              ? "webp"
              : null;
        if (!extension)
          throw new HttpError(
            400,
            "Прикрепите изображение JPG, PNG или WebP до 5 МБ.",
          );
        evidence = `${randomUUID()}.${extension}`;
        // A unique orderId prevents concurrent duplicate incident submissions.
        if (store.get("SELECT id FROM incidents WHERE orderId=?", order.id))
          throw new HttpError(409, "Инцидент уже существует.");
        writeFileSync(resolve(uploadDir, evidence), b);
      }
      const id = store.transaction(() =>
        openIncident(order, description, evidence),
      );
      res.status(201).json({ id });
    },
  );
  app.get(
    "/api/incidents/:id/evidence",
    requireUser,
    (req: AuthRequest, res) => {
      const incident = store.get<Incident>(
        "SELECT * FROM incidents WHERE id=?",
        String(req.params.id),
      );
      if (!incident || !incident.evidence)
        throw new HttpError(404, "Фото не найдено.");
      accessibleOrder(incident.orderId, req.user!);
      res.set("Cache-Control", "private, no-store");
      res.sendFile(resolve(uploadDir, incident.evidence));
    },
  );
  app.post(
    "/api/incidents/:id/resolve",
    requireUser,
    role("arbiter"),
    (req: AuthRequest, res) => {
      const input = z
        .object({
          decision: z.enum(["refund", "partial", "rejected"]),
          resolution: text(15, 3000),
          refundAmount: z.number().min(0).max(1000000),
          guilty: z.enum(["provider", "customer", "none"]),
        })
        .parse(req.body);
      const incident = store.get<Incident>(
        "SELECT * FROM incidents WHERE id=?",
        String(req.params.id),
      );
      if (!incident) throw new HttpError(404, "Инцидент не найден.");
      const order = accessibleOrder(incident.orderId, req.user!);
      if (incident.status !== "open")
        throw new HttpError(409, "По этому спору уже принято решение.");
      if (
        input.refundAmount > order.price ||
        (input.decision === "refund" && input.refundAmount !== order.price) ||
        (input.decision === "rejected" && input.refundAmount !== 0) ||
        (input.decision === "partial" &&
          (input.refundAmount <= 0 || input.refundAmount >= order.price))
      )
        throw new HttpError(
          400,
          "Сумма должна соответствовать решению и стоимости заказа.",
        );
      store.transaction(() => {
        store.run(
          "UPDATE incidents SET status='closed',resolution=?,decision=?,refundAmount=? WHERE id=?",
          input.resolution,
          input.decision,
          input.refundAmount,
          incident.id,
        );
        store.run(
          "UPDATE orders SET status='resolved',updatedAt=? WHERE id=?",
          now(),
          order.id,
        );
        if (order.requestId)
          store.run(
            "UPDATE requests SET status='closed' WHERE id=?",
            order.requestId,
          );
        store.event(
          order.id,
          "resolved",
          `${input.resolution} Согласован возврат: ${input.refundAmount} €. Возврат выполняется сторонами вне платформы.`,
        );
        if (input.guilty !== "none")
          store.run(
            "UPDATE users SET rating=MAX(1,ROUND(rating-0.2,1)) WHERE id=?",
            input.guilty === "provider" ? order.providerId : order.customerId,
          );
        for (const id of [order.customerId, order.providerId])
          store.notify(
            id,
            `Арбитр принял решение: ${order.title}`,
            `/orders/${order.id}`,
          );
      });
      res.json({ ok: true });
    },
  );
  app.get("/api/notifications", requireUser, (req: AuthRequest, res) =>
    res.json({
      items: store.all(
        "SELECT * FROM notifications WHERE userId=? ORDER BY createdAt DESC LIMIT 50",
        req.user!.id,
      ),
    }),
  );
  app.post("/api/notifications/read", requireUser, (req: AuthRequest, res) => {
    store.run("UPDATE notifications SET read=1 WHERE userId=?", req.user!.id);
    res.json({ ok: true });
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "Маршрут не найден.")),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
        return;
      }
      if (error instanceof multer.MulterError) {
        res.status(400).json({
          error: "Не удалось загрузить фото. Максимальный размер — 5 МБ.",
        });
        return;
      }
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError && "body" in error) {
        res.status(400).json({ error: "Некорректный JSON." });
        return;
      }
      console.error(
        "Request failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      res
        .status(500)
        .json({ error: "Не удалось выполнить запрос. Попробуйте ещё раз." });
    },
  );
  return { app, store, checkStaleOrders };
}
