import { randomUUID } from "node:crypto";
import type { Express, NextFunction, Response } from "express";
import { z } from "zod";
import type { ListingConversation, ListingMessage } from "../shared/types.js";
import type { AuthRequest } from "./app.js";
import { now, type Store } from "./db.js";
import { HttpError } from "./errors.js";
import { isBlocked } from "./moderation.js";

type Thread = ListingConversation & { customerId: string; providerId: string };
const message = z.object({ text: z.string().trim().min(1).max(2000) });
const threads = `SELECT c.*,l.title listingTitle,
  CASE WHEN c.customerId=? THEN p.name ELSE b.name END participantName
  FROM listing_conversations c JOIN listings l ON l.id=c.listingId
  JOIN users b ON b.id=c.customerId JOIN users p ON p.id=c.providerId`;
const participant = "(c.customerId=? OR c.providerId=?)";

export function registerConversationRoutes(
  app: Express,
  store: Store,
  requireUser: (req: AuthRequest, res: Response, next: NextFunction) => void,
  publicListings: string,
) {
  const getThread = (id: string, userId: string) => {
    const thread = store.get<Thread>(
      `${threads} WHERE c.id=? AND ${participant}`,
      userId,
      id,
      userId,
      userId,
    );
    if (!thread) throw new HttpError(404, "Диалог не найден.");
    return thread;
  };
  const writeMessage = (thread: Thread, userId: string, text: string) => {
    const recipient =
      thread.customerId === userId ? thread.providerId : thread.customerId;
    if (isBlocked(store, recipient))
      throw new HttpError(409, "Участник диалога недоступен.");
    const at = now();
    store.run(
      "INSERT INTO listing_messages VALUES (?,?,?,?,?)",
      randomUUID(),
      thread.id,
      userId,
      text,
      at,
    );
    store.run(
      "UPDATE listing_conversations SET updatedAt=? WHERE id=?",
      at,
      thread.id,
    );
    store.notify(
      recipient,
      `Новое сообщение: ${thread.listingTitle}`,
      `/dashboard/messages/${thread.id}`,
    );
  };
  app.post(
    "/api/listings/:id/conversations",
    requireUser,
    (req: AuthRequest, res) => {
      const { text } = message.parse(req.body);
      const userId = req.user!.id;
      const listing = store.get<{ id: string; providerId: string }>(
        `SELECT l.id,l.providerId FROM listings l JOIN users u ON u.id=l.providerId
       WHERE l.id=? AND ${publicListings} AND NOT EXISTS(SELECT 1 FROM listing_sources WHERE listingId=l.id)`,
        String(req.params.id),
      );
      if (!listing) throw new HttpError(404, "Предложение не найдено.");
      if (listing.providerId === userId)
        throw new HttpError(400, "Это ваше объявление.");
      const id = store.transaction(() => {
        const existing = store.get<{ id: string }>(
          "SELECT id FROM listing_conversations WHERE listingId=? AND customerId=?",
          listing.id,
          userId,
        );
        const id = existing?.id ?? randomUUID();
        if (!existing)
          store.run(
            "INSERT INTO listing_conversations VALUES (?,?,?,?,?)",
            id,
            listing.id,
            userId,
            listing.providerId,
            now(),
          );
        writeMessage(getThread(id, userId), userId, text);
        return id;
      });
      res.status(201).json({ id });
    },
  );
  app.get("/api/conversations", requireUser, (req: AuthRequest, res) => {
    const id = req.user!.id;
    res.json({
      items: store.all<ListingConversation>(
        `${threads} WHERE ${participant} ORDER BY c.updatedAt DESC,c.id DESC LIMIT 100`,
        id,
        id,
        id,
      ),
    });
  });
  app.get("/api/conversations/:id", requireUser, (req: AuthRequest, res) => {
    const thread = getThread(String(req.params.id), req.user!.id);
    const messages = store
      .all<ListingMessage>(
        `SELECT m.id,m.authorId,u.name authorName,m.text,m.createdAt
       FROM listing_messages m JOIN users u ON u.id=m.authorId
       WHERE m.conversationId=? ORDER BY m.createdAt DESC,m.rowid DESC LIMIT 150`,
        thread.id,
      )
      .reverse();
    res.json({ thread, messages });
  });
  app.post(
    "/api/conversations/:id/messages",
    requireUser,
    (req: AuthRequest, res) => {
      const { text } = message.parse(req.body);
      const id = req.user!.id;
      store.transaction(() =>
        writeMessage(getThread(String(req.params.id), id), id, text),
      );
      res.status(201).json({ ok: true });
    },
  );
}
