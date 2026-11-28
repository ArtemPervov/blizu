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
  isMarketplaceUser,
  type AccountProfile,
  type User,
  type Listing,
  type Order,
  type OrderStatus,
  type ServiceRequest,
  type Offer,
  type Incident,
} from "../shared/types.js";
import { Store, now, seedDemo, seedDemoOperator } from "./db.js";
import { seedDemoCatalog } from "./demo-catalog.js";
import { HttpError } from "./errors.js";
export { HttpError } from "./errors.js";
import {
  isBlocked,
  operatorAccessSql,
  VISIBLE_LISTING_SQL,
} from "./moderation.js";
import { registerOperatorRoutes } from "./operator.js";
import { attachListingSources } from "./listing-sources.js";
import { createListingPreviews } from "./listing-previews.js";
import { registerConversationRoutes } from "./listing-conversations.js";
import { registerAssistant, type AssistantConfig } from "./assistant.js";

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
const cityList = z
  .string()
  .max(240)
  .transform((value) => [...new Set(value.split(",").filter(Boolean))])
  .pipe(
    z
      .array(city)
      .max(CITIES.length)
      .refine((items) => !items.includes("Вся Черногория")),
  )
  .optional();
const text = (min = 1, max = 3000) => z.string().trim().min(min).max(max);
const money = z.number().finite().positive().max(1000000);
const telegramUsername = z
  .string()
  .trim()
  .max(64)
  .regex(
    /^(?:(?:@|(?:https?:\/\/)?t\.me\/)?[a-z][a-z0-9_]{3,31}\/?)?$/i,
    "Укажите имя пользователя Telegram, например @username.",
  )
  .transform((value) =>
    value.replace(/^(?:@|(?:https?:\/\/)?t\.me\/)|\/$/gi, ""),
  );
const viberNumber = z
  .string()
  .trim()
  .max(32)
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+[1-9]\d{7,14})?$/,
        "Укажите номер Viber с кодом страны, например +382…",
      ),
  );
const accountProfile = z.strictObject({
  name: text(2, 80),
  city,
  contact: text(0, 150),
  bio: text(0, 500),
  telegram: telegramUsername,
  viber: viberNumber,
  showListingContacts: z.boolean(),
});
type ProfileDetails = Pick<AccountProfile, "bio" | "telegram" | "viber"> & {
  showListingContacts: number;
};
const link = z
  .string()
  .url()
  .max(2000)
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "Используйте ссылку http или https",
  );
export type AuthRequest = Request & { user?: User };
export type AppOptions = {
  store?: Store;
  demo?: boolean;
  production?: boolean;
  origin?: string;
  dataDir?: string;
  staleHours?: number;
  deliveryEnabled?: boolean;
  assistant?: AssistantConfig;
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
  const deliveryEnabled = options.deliveryEnabled ?? false;
  const publicListings = deliveryEnabled
    ? VISIBLE_LISTING_SQL
    : `${VISIBLE_LISTING_SQL} AND NOT (l.id='l-delivery' AND u.id='demo-logistic')`;
  if (
    production &&
    !demo &&
    store.get("SELECT id FROM users WHERE id LIKE 'demo-%'")
  )
    throw new Error(
      "A database with demo accounts cannot be used in production with ENABLE_DEMO=false. Use a clean production volume.",
    );
  if (demo) {
    seedDemo(store);
    seedDemoCatalog(store);
    seedDemoOperator(store);
  }
  const uploadDir = resolve(dataDir, "uploads");
  mkdirSync(uploadDir, { recursive: true });
  const listingPreview = createListingPreviews(uploadDir);
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
          )},${operatorAccessSql("u")} isOperator FROM sessions s JOIN users u ON u.id=s.userId WHERE s.token=? AND s.expiresAt>? AND NOT EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.userId=u.id)`,
        digest(token),
        now(),
      );
      if (user)
        req.user = {
          ...user,
          verified: Boolean(user.verified),
          isOperator: Boolean(user.isOperator),
        };
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
  const requireMarketplaceUser = (
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
  ) =>
    isMarketplaceUser(req.user?.role)
      ? next()
      : next(new HttpError(403, "Недостаточно прав для этого действия."));
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    message: { error: "Слишком много попыток. Попробуйте через 15 минут." },
  });
  function startSession(res: Response, userId: string) {
    if (isBlocked(store, userId))
      throw new HttpError(
        403,
        "Аккаунт заблокирован. Обратитесь в поддержку сервиса.",
      );
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
    const user = store.get<User>(
      `SELECT ${userSelect},${operatorAccessSql("users")} isOperator FROM users WHERE id=?`,
      userId,
    )!;
    return {
      ...user,
      verified: Boolean(user.verified),
      isOperator: Boolean(user.isOperator),
    };
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
      deliveryEnabled,
      assistantEnabled: !!options.assistant,
      categories: CATEGORIES,
      cities: CITIES,
      stats: {
        imported:
          store.get<{ n: number }>(
            `SELECT COUNT(*) n FROM listing_sources ls JOIN listings l ON l.id=ls.listingId JOIN users u ON u.id=l.providerId WHERE ${VISIBLE_LISTING_SQL}`,
          )?.n ?? 0,
        listings: store.get<{ n: number }>(
          `SELECT COUNT(*) n FROM listings l JOIN users u ON u.id=l.providerId WHERE ${publicListings}`,
        )?.n,
        providers: store.get<{ n: number }>(
          "SELECT COUNT(*) n FROM users u WHERE (u.role='provider' OR EXISTS(SELECT 1 FROM listings l WHERE l.providerId=u.id)) AND u.id NOT LIKE 'source-%' AND u.id NOT IN (SELECT userId FROM account_restrictions)",
        )?.n,
        requests: store.get<{ n: number }>(
          `SELECT COUNT(*) n FROM requests WHERE status='open' AND customerId NOT IN (SELECT userId FROM account_restrictions)${deliveryEnabled ? "" : " AND kind='service'"}`,
        )?.n,
      },
    }),
  );
  app.get("/api/auth/me", (req: AuthRequest, res) =>
    res.json({ user: req.user ?? null }),
  );
  const profileDetails = (userId: string) =>
    store.get<ProfileDetails>(
      "SELECT bio,telegram,viber,showListingContacts FROM user_profiles WHERE userId=?",
      userId,
    );
  app.get("/api/profile", requireUser, (req: AuthRequest, res) => {
    const { id, name, city, contact } = req.user!;
    const details = profileDetails(id);
    const profile: AccountProfile = {
      name,
      city,
      contact,
      bio: details?.bio ?? "",
      telegram: details?.telegram ?? "",
      viber: details?.viber ?? "",
      showListingContacts: !!details?.showListingContacts,
    };
    res.json({ profile });
  });
  app.patch("/api/profile", requireUser, (req: AuthRequest, res) => {
    const profile = accountProfile.parse(req.body);
    const user = req.user!;
    store.transaction(() => {
      store.run(
        "UPDATE users SET name=?,city=?,contact=? WHERE id=?",
        profile.name,
        profile.city,
        profile.contact,
        user.id,
      );
      store.run(
        `INSERT INTO user_profiles(userId,bio,telegram,viber,showListingContacts)
        VALUES (?,?,?,?,?)
        ON CONFLICT(userId) DO UPDATE SET bio=excluded.bio,telegram=excluded.telegram,
          viber=excluded.viber,showListingContacts=excluded.showListingContacts`,
        user.id,
        profile.bio,
        profile.telegram,
        profile.viber,
        Number(profile.showListingContacts),
      );
    });
    res.json({
      profile,
      user: {
        ...user,
        name: profile.name,
        city: profile.city,
        contact: profile.contact,
      },
    });
  });
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
        role: z.enum(["customer", "provider"]).default("customer"),
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
        .object({
          role: z.enum(["customer", "provider", "arbiter", "operator"]),
        })
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
  registerConversationRoutes(app, store, requireUser, publicListings);

  function findListings(query: unknown) {
    const input = z
      .object({
        q: z.string().max(200).optional(),
        ids: z.string().max(11000).optional(),
        source: z.enum(["telegram", "demo"]).optional(),
        category: z.string().max(40).optional(),
        city: z.string().max(80).optional(),
        cities: cityList,
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
      .parse(query);
    const where = [publicListings];
    const params: (string | number)[] = [];
    if (input.source === "telegram")
      where.push(
        "EXISTS (SELECT 1 FROM listing_sources ls WHERE ls.listingId=l.id)",
      );
    if (input.source === "demo")
      where.push(demo ? "u.id LIKE 'demo-%'" : "0=1");
    if (input.ids !== undefined) {
      const ids = z
        .array(z.string().min(1).max(100))
        .min(1)
        .max(100)
        .parse(input.ids.split(","));
      where.push(`l.id IN (${ids.map(() => "?").join(",")})`);
      params.push(...ids);
    }
    if (input.category && input.category !== "all") {
      where.push("l.category=?");
      params.push(input.category);
    }
    if (input.cities?.length) {
      where.push(`l.city IN (${input.cities.map(() => "?").join(",")})`);
      params.push(...input.cities);
    } else if (input.city && input.city !== "Вся Черногория") {
      where.push("l.city=?");
      params.push(input.city);
    }
    const search = input.q?.trim();
    if (search) {
      where.push(
        "catalog_match(l.title || ' ' || l.description || ' ' || u.name || ' ' || COALESCE((SELECT ls.authorName FROM listing_sources ls WHERE ls.listingId=l.id),''),?)>0",
      );
      params.push(search);
    }
    if (input.minPrice !== undefined) {
      where.push(
        "NOT EXISTS (SELECT 1 FROM listing_sources ls WHERE ls.listingId=l.id AND ls.priceKnown=0)",
      );
      where.push("l.price>=?");
      params.push(input.minPrice);
    }
    if (input.maxPrice !== undefined) {
      where.push(
        "NOT EXISTS (SELECT 1 FROM listing_sources ls WHERE ls.listingId=l.id AND ls.priceKnown=0)",
      );
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
    const titleSearch = search && input.sort === "recommended" ? search : undefined;
    const relevance = titleSearch ? "catalog_match(l.title,?) DESC," : "";
    const ordering =
      input.sort === "price"
        ? "EXISTS(SELECT 1 FROM listing_sources ls WHERE ls.listingId=l.id AND ls.priceKnown=0) ASC,l.price ASC,l.id ASC"
        : input.sort === "price_desc"
          ? "EXISTS(SELECT 1 FROM listing_sources ls WHERE ls.listingId=l.id AND ls.priceKnown=0) ASC,l.price DESC,l.id ASC"
          : input.sort === "newest"
            ? "l.createdAt DESC,COALESCE((SELECT ls.messageId FROM listing_sources ls WHERE ls.listingId=l.id),0) DESC,l.id ASC"
            : input.sort === "rating"
              ? "u.rating DESC,l.reviewCount DESC,l.id ASC"
              : `${demo ? "CASE WHEN u.id LIKE 'demo-%' THEN 1 ELSE 0 END ASC," : ""}u.rating DESC,l.reviewCount DESC,l.createdAt DESC,l.id ASC`;
    const items = store
      .all<
        Omit<Listing, "tags" | "providerVerified"> & {
          tags: string;
          providerVerified: number;
        }
      >(
        `${listingsSelect} WHERE ${where.join(" AND ")} ORDER BY ${relevance}${ordering} LIMIT ? OFFSET ?`,
        ...params,
        ...(titleSearch ? [titleSearch] : []),
        input.limit,
        input.offset,
      )
      .map((l) => ({
        ...l,
        tags: JSON.parse(String(l.tags)),
        providerVerified: Boolean(l.providerVerified),
      }));
    return { items: attachListingSources(store, items), total };
  }
  if (options.assistant) registerAssistant(app, options.assistant, findListings);
  app.get("/api/listings", (req, res) => {
    res.json(findListings(req.query));
  });
  app.get("/api/listings/:id", (req: AuthRequest, res) => {
    const item = store.get<Record<string, unknown>>(
      `${listingsSelect} WHERE l.id=?`,
      String(req.params.id),
    );
    if (!item) throw new HttpError(404, "Предложение не найдено.");
    const hidden = store.get<{ reason: string }>(
      "SELECT reason FROM listing_moderation WHERE listingId=?",
      String(item.id),
    );
    const ownerBlocked = isBlocked(store, String(item.providerId));
    if (
      (hidden || ownerBlocked) &&
      req.user?.id !== item.providerId &&
      !req.user?.isOperator
    )
      throw new HttpError(404, "Предложение не найдено.");
    const listingContact =
      !hidden && !ownerBlocked
        ? store.get<{ telegram: string; viber: string }>(
            "SELECT telegram,viber FROM listing_contacts WHERE listingId=?",
            String(item.id),
          )
        : undefined;
    const providerProfile =
      !hidden && !ownerBlocked
        ? profileDetails(String(item.providerId))
        : undefined;
    const publicContact =
      listingContact ??
      (providerProfile?.showListingContacts &&
      (providerProfile.telegram || providerProfile.viber)
        ? { telegram: providerProfile.telegram, viber: providerProfile.viber }
        : undefined);
    res.json({
      item: attachListingSources(store, [
        {
          ...item,
          ...(publicContact && { publicContact }),
          ...(providerProfile?.bio && { providerBio: providerProfile.bio }),
          tags: JSON.parse(String(item.tags)),
          providerVerified: Boolean(item.providerVerified),
          ...(req.user?.id === item.providerId || req.user?.isOperator
            ? {
                hidden: !!hidden,
                ownerBlocked,
                moderationReason: hidden?.reason ?? "",
              }
            : {}),
        },
      ])[0],
    });
  });
  app.get("/api/providers/:id", (req, res) => {
    const id = String(req.params.id);
    const provider = store.get<{
      id: string;
      name: string;
      city: string;
      verified: number;
      bio: string;
    }>(
      `SELECT u.id,u.name,u.city,u.verified,COALESCE(p.bio,'') bio FROM users u
       LEFT JOIN user_profiles p ON p.userId=u.id
       WHERE u.id=? AND u.id NOT LIKE 'source-%'
       AND EXISTS(SELECT 1 FROM listings l WHERE l.providerId=u.id AND ${publicListings})
       AND NOT EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.userId=u.id)`,
      id,
    );
    if (!provider) throw new HttpError(404, "Профиль не найден.");
    const items = store
      .all<
        Record<string, unknown>
      >(`${listingsSelect} WHERE l.providerId=? AND ${publicListings} ORDER BY l.createdAt DESC,l.id DESC LIMIT 100`, id)
      .map((item) => ({
        ...item,
        tags: JSON.parse(String(item.tags)),
        providerVerified: Boolean(item.providerVerified),
      }));
    res.json({
      provider: { ...provider, verified: Boolean(provider.verified) },
      items: attachListingSources(store, items),
    });
  });
  app.get("/api/listing-images/:id/:file", async (req: AuthRequest, res) => {
    const id = String(req.params.id),
      file = String(req.params.file);
    if (!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(file))
      throw new HttpError(404, "Фото не найдено.");
    const item = store.get<{
      providerId: string;
      photos: string;
      visible: number;
    }>(
      `SELECT l.providerId,ls.photos,(${VISIBLE_LISTING_SQL}) visible FROM listing_sources ls JOIN listings l ON l.id=ls.listingId JOIN users u ON u.id=l.providerId WHERE l.id=?`,
      id,
    );
    if (
      !item ||
      (!item.visible &&
        !req.user?.isOperator &&
        req.user?.id !== item.providerId) ||
      !(JSON.parse(item.photos) as string[]).includes(
        `/api/listing-images/${id}/${file}`,
      )
    )
      throw new HttpError(404, "Фото не найдено.");
    const preview =
      req.query.variant === "card"
        ? await listingPreview(file).catch(() => null)
        : null;
    if (preview && item.visible) res.set("Cache-Control", "private, no-cache");
    res.sendFile(preview ?? resolve(uploadDir, "listings", file));
  });
  app.post(
    "/api/listings",
    requireUser,
    (req: AuthRequest, res) => {
      const input = z
        .object({
          title: text(5, 120),
          description: text(20, 5000),
          category,
          city,
          price: money,
          unit: text(1, 40),
          telegram: telegramUsername.default(""),
          viber: viberNumber.default(""),
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
      store.transaction(() => {
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
        if (input.telegram || input.viber) {
          store.run(
            "INSERT INTO listing_contacts (listingId,telegram,viber) VALUES (?,?,?)",
            id,
            input.telegram,
            input.viber,
          );
        }
      });
      res.status(201).json({ id });
    },
  );
  app.get("/api/favorites", requireUser, (req: AuthRequest, res) =>
    res.json({
      ids: store
        .all<{
          listingId: string;
        }>(
          `SELECT f.listingId FROM favorites f JOIN listings l ON l.id=f.listingId JOIN users u ON u.id=l.providerId WHERE f.userId=? AND ${VISIBLE_LISTING_SQL}`,
          req.user!.id,
        )
        .map((r) => r.listingId),
      items: attachListingSources(
        store,
        store
          .all<
            Record<string, unknown>
          >(`${listingsSelect} JOIN favorites f ON f.listingId=l.id WHERE f.userId=? AND ${VISIBLE_LISTING_SQL} ORDER BY l.createdAt DESC`, req.user!.id)
          .map((l) => ({
            ...l,
            tags: JSON.parse(String(l.tags)),
            providerVerified: Boolean(l.providerVerified),
          })),
      ),
    }),
  );
  app.put("/api/favorites/:id", requireUser, (req: AuthRequest, res) => {
    const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
    if (!store.get("SELECT id FROM listings WHERE id=?", String(req.params.id)))
      throw new HttpError(404, "Предложение не найдено.");
    if (
      saved &&
      !store.get(
        `SELECT l.id FROM listings l JOIN users u ON u.id=l.providerId WHERE l.id=? AND ${VISIBLE_LISTING_SQL}`,
        String(req.params.id),
      )
    )
      throw new HttpError(404, "Предложение недоступно.");
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
        cities: cityList,
        q: z.string().trim().max(200).optional(),
        category: z.string().max(40).optional(),
        kind: z.enum(["service", "delivery"]).optional(),
      })
      .parse(req.query);
    const where = [
      "r.status='open'",
      "NOT EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.userId=r.customerId)",
    ];
    if (!deliveryEnabled) where.push("r.kind='service'");
    const params: string[] = [];
    if (input.cities?.length) {
      where.push(`r.city IN (${input.cities.map(() => "?").join(",")})`);
      params.push(...input.cities);
    } else if (input.city && input.city !== "Вся Черногория") {
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
    if (input.q) {
      where.push("instr(casefold(r.title || ' ' || r.description),?)>0");
      params.push(input.q.toLocaleLowerCase("ru"));
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
    if (!deliveryEnabled && input.kind === "delivery") {
      throw new HttpError(
        403,
        "В каталоге доступна помощь с заказами. Заявки на международную доставку отключены.",
      );
    }
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
        `SELECT DISTINCT u.id FROM users u JOIN listings l ON l.providerId=u.id WHERE u.role IN ('customer','provider') AND u.id NOT LIKE 'source-%' AND l.category=? AND (l.city=? OR ?=? OR ?=?) AND u.id<>? AND ${VISIBLE_LISTING_SQL}`,
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
    if (
      isBlocked(store, item.customerId) &&
      req.user?.role !== "arbiter" &&
      !req.user?.isOperator
    )
      throw new HttpError(404, "Заявка недоступна.");
    const canSeeAll =
      req.user?.id === item.customerId || req.user?.role === "arbiter";
    const offers = req.user
      ? store.all<Offer>(
          `${offersSelect} WHERE o.requestId=?${canSeeAll ? "" : " AND o.providerId=?"}${req.user.role === "arbiter" ? "" : " AND NOT EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.userId=o.providerId)"} ORDER BY o.createdAt DESC`,
          ...(canSeeAll ? [item.id] : [item.id, req.user.id]),
        )
      : [];
    res.json({ item, offers });
  });
  app.post(
    "/api/requests/:id/offers",
    requireUser,
    requireMarketplaceUser,
    (req: AuthRequest, res) => {
      const input = z
        .object({ price: money, message: text(10, 2000), eta: text(3, 120) })
        .parse(req.body);
      const item = store.get<ServiceRequest>(
        "SELECT * FROM requests WHERE id=?",
        String(req.params.id),
      );
      if (!item) throw new HttpError(404, "Заявка не найдена.");
      if (isBlocked(store, item.customerId))
        throw new HttpError(
          409,
          "Автор заявки недоступен. Отклик отправить нельзя.",
        );
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
      if (isBlocked(store, offer.providerId))
        throw new HttpError(
          409,
          "Исполнитель недоступен. Выберите другой отклик.",
        );
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
          `SELECT l.*,u.name providerName,u.rating providerRating,u.verified providerVerified,EXISTS(SELECT 1 FROM listing_moderation lm WHERE lm.listingId=l.id) hidden,COALESCE((SELECT reason FROM listing_moderation lm WHERE lm.listingId=l.id),'') moderationReason FROM listings l JOIN users u ON u.id=l.providerId WHERE l.providerId=? ORDER BY l.createdAt DESC`,
          u.id,
        )
        .map((l: any) => ({
          ...l,
          tags: JSON.parse(l.tags),
          hidden: !!l.hidden,
          providerVerified: !!l.providerVerified,
        })),
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
  app.delete("/api/notifications", requireUser, (req: AuthRequest, res) => {
    store.run("DELETE FROM notifications WHERE userId=?", req.user!.id);
    res.json({ ok: true });
  });
  registerOperatorRoutes(app, store, requireUser);
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
