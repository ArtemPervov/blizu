import { randomUUID } from "node:crypto";
import { Store, now } from "./db.js";
import { HttpError } from "./errors.js";

export const VISIBLE_LISTING_SQL =
  "NOT EXISTS (SELECT 1 FROM listing_moderation lm WHERE lm.listingId=l.id) AND NOT EXISTS (SELECT 1 FROM account_restrictions ar WHERE ar.userId=u.id)";
export const operatorAccessSql = (alias: string) =>
  `EXISTS (SELECT 1 FROM operator_access oa WHERE oa.userId=${alias}.id)`;
export function isBlocked(store: Store, userId: string) {
  return !!store.get(
    "SELECT userId FROM account_restrictions WHERE userId=?",
    userId,
  );
}
export function audit(
  store: Store,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  targetLabel: string,
  reason: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  store.run(
    "INSERT INTO operator_audit VALUES (?,?,?,?,?,?,?,?,?,?)",
    randomUUID(),
    actorId,
    action,
    targetType,
    targetId,
    targetLabel,
    reason,
    JSON.stringify(before),
    JSON.stringify(after),
    now(),
  );
}
export function moderateUser(
  store: Store,
  actorId: string,
  id: string,
  action: "block" | "unblock" | "verify" | "unverify",
  reason: string,
) {
  const user = store.get<{
    id: string;
    name: string;
    role: string;
    verified: number;
    isOperator: number;
  }>(
    `SELECT id,name,role,verified,${operatorAccessSql("users")} isOperator FROM users WHERE id=?`,
    id,
  );
  if (!user) throw new HttpError(404, "Пользователь не найден.");
  const blocked = isBlocked(store, id);
  if (action === "block" || action === "unblock") {
    if (user.isOperator || actorId === id)
      throw new HttpError(
        403,
        "Блокировка учётных записей операторов через панель запрещена.",
      );
    const next = action === "block";
    if (blocked === next)
      throw new HttpError(
        409,
        "Состояние аккаунта уже изменено. Обновите список.",
      );
    if (next) {
      store.run(
        "INSERT INTO account_restrictions VALUES (?,?,?,?)",
        id,
        actorId,
        reason,
        now(),
      );
      store.run("DELETE FROM sessions WHERE userId=?", id);
    } else store.run("DELETE FROM account_restrictions WHERE userId=?", id);
    audit(
      store,
      actorId,
      `user.${action}`,
      "user",
      id,
      user.name,
      reason,
      { blocked },
      { blocked: next },
    );
  } else {
    if (user.role !== "provider")
      throw new HttpError(
        400,
        "Отметка доступна только профилям исполнителей.",
      );
    const next = action === "verify";
    if (!!user.verified === next)
      throw new HttpError(
        409,
        "Отметка профиля уже изменена. Обновите список.",
      );
    store.run("UPDATE users SET verified=? WHERE id=?", Number(next), id);
    audit(
      store,
      actorId,
      `user.${action}`,
      "user",
      id,
      user.name,
      reason,
      { verified: !!user.verified },
      { verified: next },
    );
  }
}
export function moderateListing(
  store: Store,
  actorId: string,
  id: string,
  action: "hide" | "restore",
  reason: string,
) {
  const listing = store.get<{ title: string; providerId: string }>(
    "SELECT title,providerId FROM listings WHERE id=?",
    id,
  );
  if (!listing) throw new HttpError(404, "Предложение не найдено.");
  const hidden = !!store.get(
    "SELECT listingId FROM listing_moderation WHERE listingId=?",
    id,
  );
  const next = action === "hide";
  if (hidden === next)
    throw new HttpError(409, "Видимость уже изменена. Обновите список.");
  if (next)
    store.run(
      "INSERT INTO listing_moderation VALUES (?,?,?,?)",
      id,
      actorId,
      reason,
      now(),
    );
  else store.run("DELETE FROM listing_moderation WHERE listingId=?", id);
  audit(
    store,
    actorId,
    `listing.${action}`,
    "listing",
    id,
    listing.title,
    reason,
    { hidden },
    { hidden: next },
  );
  store.notify(
    listing.providerId,
    next
      ? `Предложение «${listing.title}» скрыто оператором: ${reason}`
      : `Скрытие предложения «${listing.title}» снято оператором.`,
    "/dashboard?tab=listings",
  );
}
