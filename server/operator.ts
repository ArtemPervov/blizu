import { Router, type Express, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthRequest } from "./app.js";
import { Store, now } from "./db.js";
import { HttpError } from "./errors.js";
import {
  audit,
  isBlocked,
  moderateListing,
  moderateUser,
  operatorAccessSql,
  VISIBLE_LISTING_SQL,
} from "./moderation.js";
import { AUDIT_ACTIONS, REPORT_CATEGORIES } from "../shared/operator.js";
import { attachListingSources } from "./listing-sources.js";

const reason = z
  .string()
  .trim()
  .min(10, "Опишите причину: не менее 10 символов.")
  .max(2000);
const pageQuery = z.object({
  q: z.string().trim().max(200).default(""),
  state: z.string().max(30).default("all"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const usersSql = `SELECT u.id,u.name,u.email,u.city,u.role,u.contact,u.rating,u.verified,u.createdAt,${operatorAccessSql("u")} isOperator,
  EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.userId=u.id) blocked,
  COALESCE((SELECT reason FROM account_restrictions ar WHERE ar.userId=u.id),'') blockReason,
  (SELECT COUNT(*) FROM listings l WHERE l.providerId=u.id) listingCount,
  (SELECT COUNT(*) FROM orders o WHERE o.customerId=u.id OR o.providerId=u.id) orderCount FROM users u`;
const listingsSql = `SELECT l.*,u.name providerName,u.rating providerRating,u.verified providerVerified,
  EXISTS(SELECT 1 FROM listing_moderation lm WHERE lm.listingId=l.id) hidden,
  COALESCE((SELECT reason FROM listing_moderation lm WHERE lm.listingId=l.id),'') moderationReason,
  EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.userId=u.id) ownerBlocked FROM listings l JOIN users u ON u.id=l.providerId`;
const reportsSql = `SELECT r.*,u.name reporterName,op.name resolvedByName,
  CASE WHEN r.targetType='listing' THEN l.title ELSE target.name END targetLabel
  FROM reports r JOIN users u ON u.id=r.reporterId LEFT JOIN users op ON op.id=r.resolvedBy
  LEFT JOIN listings l ON r.targetType='listing' AND l.id=r.targetId LEFT JOIN users target ON r.targetType='user' AND target.id=r.targetId`;

export function registerOperatorRoutes(
  app: Express,
  store: Store,
  requireUser: RequestHandler,
) {
  const reportsLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 12,
    keyGenerator: (req) => (req as AuthRequest).user!.id,
    message: { error: "Слишком много обращений. Попробуйте позже." },
  });
  app.post(
    "/api/reports",
    requireUser,
    reportsLimiter,
    (req: AuthRequest, res) => {
      const input = z
        .object({
          targetType: z.enum(["listing", "user"]),
          targetId: z.string().min(1).max(100),
          category: z.enum(
            Object.keys(REPORT_CATEGORIES) as [
              keyof typeof REPORT_CATEGORIES,
              ...Array<keyof typeof REPORT_CATEGORIES>,
            ],
          ),
          description: reason,
        })
        .strict()
        .parse(req.body);
      const target =
        input.targetType === "listing"
          ? store.get<{ ownerId: string }>(
              `SELECT l.providerId ownerId FROM listings l JOIN users u ON u.id=l.providerId WHERE l.id=? AND ${VISIBLE_LISTING_SQL}`,
              input.targetId,
            )
          : store.get<{ ownerId: string }>(
              "SELECT id ownerId FROM users WHERE id=?",
              input.targetId,
            );
      if (!target || isBlocked(store, target.ownerId))
        throw new HttpError(404, "Объект обращения не найден.");
      if (target.ownerId === req.user!.id)
        throw new HttpError(
          400,
          "Нельзя отправить жалобу на себя или своё предложение.",
        );
      const id = randomUUID();
      store.transaction(() => {
        if (
          store.get(
            "SELECT id FROM reports WHERE reporterId=? AND targetType=? AND targetId=? AND status='open'",
            req.user!.id,
            input.targetType,
            input.targetId,
          )
        )
          throw new HttpError(
            409,
            "Вы уже отправили жалобу на этот объект. Дождитесь ответа оператора.",
          );
        store.run(
          "INSERT INTO reports (id,targetType,targetId,reporterId,category,description,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)",
          id,
          input.targetType,
          input.targetId,
          req.user!.id,
          input.category,
          input.description,
          now(),
          now(),
        );
        for (const operator of store.all<{ userId: string }>(
          "SELECT userId FROM operator_access WHERE userId NOT IN (SELECT userId FROM account_restrictions)",
        ))
          store.notify(
            operator.userId,
            "Новое обращение в очереди оператора",
            "/operator?tab=reports",
          );
      });
      res.status(201).json({ id });
    },
  );
  const router = Router();
  app.use(
    "/api/operator",
    requireUser,
    (req: AuthRequest, _res, next) =>
      req.user?.isOperator
        ? next()
        : next(
            new HttpError(403, "Панель доступна только операторам сервиса."),
          ),
    router,
  );
  const count = (sql: string, params: (string | number)[] = []) =>
    store.get<{ total: number }>(sql, ...params)?.total ?? 0;
  router.get("/summary", (_req, res) =>
    res.json({
      users: count("SELECT COUNT(*) total FROM users"),
      blockedUsers: count("SELECT COUNT(*) total FROM account_restrictions"),
      publishedListings: count(
        `SELECT COUNT(*) total FROM listings l JOIN users u ON u.id=l.providerId WHERE ${VISIBLE_LISTING_SQL}`,
      ),
      hiddenListings: count("SELECT COUNT(*) total FROM listing_moderation"),
      openReports: count(
        "SELECT COUNT(*) total FROM reports WHERE status='open'",
      ),
      totalReports: count("SELECT COUNT(*) total FROM reports"),
    }),
  );
  router.get("/users", (req, res) => {
    const input = pageQuery
      .extend({
        state: z.enum(["all", "active", "blocked", "verified"]).default("all"),
      })
      .parse(req.query);
    const clauses = ["1=1"];
    const params: (string | number)[] = [];
    if (input.q) {
      clauses.push(
        "instr(casefold(u.name || ' ' || u.email || ' ' || u.city || ' ' || u.id),?)>0",
      );
      params.push(input.q.toLocaleLowerCase("ru"));
    }
    if (input.state === "blocked" || input.state === "active")
      clauses.push(
        `${input.state === "active" ? "NOT " : ""}EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.userId=u.id)`,
      );
    if (input.state === "verified") clauses.push("u.verified=1");
    const where = ` WHERE ${clauses.join(" AND ")}`;
    const total = count(`SELECT COUNT(*) total FROM users u${where}`, params);
    const items = store
      .all<
        Record<string, unknown>
      >(`${usersSql}${where} ORDER BY u.createdAt DESC,u.id LIMIT ? OFFSET ?`, ...params, input.pageSize, (input.page - 1) * input.pageSize)
      .map((u) => ({
        ...u,
        blocked: !!u.blocked,
        verified: !!u.verified,
        isOperator: !!u.isOperator,
      }));
    res.json({ items, total, page: input.page, pageSize: input.pageSize });
  });
  router.patch("/users/:id", (req: AuthRequest, res) => {
    const input = z
      .object({
        action: z.enum(["block", "unblock", "verify", "unverify"]),
        reason,
      })
      .strict()
      .parse(req.body);
    store.transaction(() =>
      moderateUser(
        store,
        req.user!.id,
        String(req.params.id),
        input.action,
        input.reason,
      ),
    );
    res.json({ ok: true });
  });
  router.get("/listings", (req, res) => {
    const input = pageQuery
      .extend({
        state: z
          .enum(["all", "published", "hidden", "owner_blocked"])
          .default("all"),
      })
      .parse(req.query);
    const clauses = ["1=1"];
    const params: (string | number)[] = [];
    if (input.q) {
      clauses.push(
        "instr(casefold(l.title || ' ' || u.name || ' ' || l.city || ' ' || l.id),?)>0",
      );
      params.push(input.q.toLocaleLowerCase("ru"));
    }
    if (input.state === "published") clauses.push(VISIBLE_LISTING_SQL);
    if (input.state === "hidden")
      clauses.push(
        "EXISTS(SELECT 1 FROM listing_moderation lm WHERE lm.listingId=l.id)",
      );
    if (input.state === "owner_blocked")
      clauses.push(
        "EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.userId=u.id)",
      );
    const where = ` WHERE ${clauses.join(" AND ")}`;
    const total = count(
      `SELECT COUNT(*) total FROM listings l JOIN users u ON u.id=l.providerId${where}`,
      params,
    );
    const items = store
      .all<
        Record<string, unknown>
      >(`${listingsSql}${where} ORDER BY l.createdAt DESC,l.id LIMIT ? OFFSET ?`, ...params, input.pageSize, (input.page - 1) * input.pageSize)
      .map((l) => ({
        ...l,
        tags: JSON.parse(String(l.tags)),
        providerVerified: !!l.providerVerified,
        hidden: !!l.hidden,
        ownerBlocked: !!l.ownerBlocked,
      }));
    res.json({
      items: attachListingSources(store, items),
      total,
      page: input.page,
      pageSize: input.pageSize,
    });
  });
  router.patch("/listings/:id", (req: AuthRequest, res) => {
    const input = z
      .object({ action: z.enum(["hide", "restore"]), reason })
      .strict()
      .parse(req.body);
    store.transaction(() =>
      moderateListing(
        store,
        req.user!.id,
        String(req.params.id),
        input.action,
        input.reason,
      ),
    );
    res.json({ ok: true });
  });
  router.get("/reports", (req, res) => {
    const input = pageQuery
      .extend({
        state: z.enum(["all", "open", "resolved", "dismissed"]).default("all"),
      })
      .parse(req.query);
    const clauses = ["1=1"];
    const params: (string | number)[] = [];
    if (input.q) {
      clauses.push(
        "instr(casefold(r.description || ' ' || u.name || ' ' || COALESCE(l.title,target.name,'') || ' ' || r.id),?)>0",
      );
      params.push(input.q.toLocaleLowerCase("ru"));
    }
    if (input.state !== "all") {
      clauses.push("r.status=?");
      params.push(input.state);
    }
    const where = ` WHERE ${clauses.join(" AND ")}`;
    const total = count(
      `SELECT COUNT(*) total FROM (${reportsSql}${where})`,
      params,
    );
    const items = store.all(
      `${reportsSql}${where} ORDER BY r.createdAt DESC,r.id LIMIT ? OFFSET ?`,
      ...params,
      input.pageSize,
      (input.page - 1) * input.pageSize,
    );
    res.json({ items, total, page: input.page, pageSize: input.pageSize });
  });
  router.patch("/reports/:id", (req: AuthRequest, res) => {
    const input = z
      .object({
        status: z.enum(["resolved", "dismissed"]),
        resolution: reason,
        action: z.enum(["none", "hide", "block"]).default("none"),
      })
      .strict()
      .refine((v) => v.status !== "dismissed" || v.action === "none", {
        message: "При отклонении жалобы действие над объектом недоступно.",
      })
      .parse(req.body);
    store.transaction(() => {
      const item = store.get<{
        targetType: string;
        targetId: string;
        reporterId: string;
        status: string;
      }>("SELECT * FROM reports WHERE id=?", String(req.params.id));
      if (!item) throw new HttpError(404, "Жалоба не найдена.");
      if (item.status !== "open")
        throw new HttpError(
          409,
          "Жалоба уже рассмотрена другим оператором. Обновите список.",
        );
      if (input.action === "hide") {
        if (item.targetType !== "listing")
          throw new HttpError(400, "Скрыть можно только предложение.");
        if (
          !store.get(
            "SELECT listingId FROM listing_moderation WHERE listingId=?",
            item.targetId,
          )
        )
          moderateListing(
            store,
            req.user!.id,
            item.targetId,
            "hide",
            input.resolution,
          );
      }
      if (input.action === "block") {
        if (item.targetType !== "user")
          throw new HttpError(400, "Заблокировать можно только аккаунт.");
        if (!isBlocked(store, item.targetId))
          moderateUser(
            store,
            req.user!.id,
            item.targetId,
            "block",
            input.resolution,
          );
      }
      store.run(
        "UPDATE reports SET status=?,resolution=?,resolvedBy=?,updatedAt=? WHERE id=?",
        input.status,
        input.resolution,
        req.user!.id,
        now(),
        String(req.params.id),
      );
      const target =
        item.targetType === "listing"
          ? store.get<{ label: string }>(
              "SELECT title label FROM listings WHERE id=?",
              item.targetId,
            )
          : store.get<{ label: string }>(
              "SELECT name label FROM users WHERE id=?",
              item.targetId,
            );
      audit(
        store,
        req.user!.id,
        `report.${input.status}`,
        "report",
        String(req.params.id),
        `Обращение: ${target?.label ?? item.targetId}`,
        input.resolution,
        { status: "open" },
        { status: input.status, action: input.action },
      );
      store.notify(
        item.reporterId,
        input.status === "resolved"
          ? `Ваша жалоба рассмотрена: ${input.resolution}`
          : `По вашей жалобе принято решение: ${input.resolution}`,
        "/dashboard",
      );
    });
    res.json({ ok: true });
  });
  router.get("/audit", (req, res) => {
    const input = pageQuery.parse(req.query);
    const params: (string | number)[] = [];
    let where = "";
    if (input.q) {
      const normalized = input.q.toLocaleLowerCase("ru");
      const matchingActions = Object.entries(AUDIT_ACTIONS)
        .filter(([, label]) =>
          label.toLocaleLowerCase("ru").includes(normalized),
        )
        .map(([action]) => action);
      where =
        " WHERE (instr(casefold(a.reason || ' ' || a.action || ' ' || a.targetLabel || ' ' || CASE WHEN a.action LIKE 'operator.%' THEN 'Сервер' ELSE u.name END),?)>0";
      params.push(normalized);
      if (matchingActions.length) {
        where += ` OR a.action IN (${matchingActions.map(() => "?").join(",")})`;
        params.push(...matchingActions);
      }
      where += ")";
    }
    const total = count(
      `SELECT COUNT(*) total FROM operator_audit a JOIN users u ON u.id=a.actorId${where}`,
      params,
    );
    const items = store
      .all<
        Record<string, unknown>
      >(`SELECT a.*,CASE WHEN a.action LIKE 'operator.%' THEN 'Сервер' ELSE u.name END actorName FROM operator_audit a JOIN users u ON u.id=a.actorId${where} ORDER BY a.createdAt DESC,a.rowid DESC LIMIT ? OFFSET ?`, ...params, input.pageSize, (input.page - 1) * input.pageSize)
      .map((a) => ({
        ...a,
        before: JSON.parse(String(a.before)),
        after: JSON.parse(String(a.after)),
      }));
    res.json({ items, total, page: input.page, pageSize: input.pageSize });
  });
}
