import type { Express, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AuthRequest } from "./app.js";
import { HttpError } from "./errors.js";

const answerLimit = 2400;
const languages = {
  ru: "Russian",
  en: "English",
  me: "Montenegrin (Latin script)",
};
const chatInput = z.strictObject({
  language: z.enum(["ru", "en", "me"]),
  message: z.string().trim().min(1).max(1200),
  history: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(answerLimit),
      }),
    )
    .max(8)
    .default([])
    .refine(
      (history) =>
        history.length % 2 === 0 &&
        history.every(
          ({ role }, index) =>
            role === (index % 2 === 0 ? "user" : "assistant"),
        ),
      "Send complete user and assistant turns",
    ),
});

const modelReply = z.object({
  message: z.object({ content: z.string().trim().min(1) }),
});

const instructions = `You answer questions about using Blizu, a marketplace for goods and services in Montenegro. Keep answers short and based on the facts below. If the facts do not cover a question, say so. Never claim to have opened a page, searched live listings, handled a dispute, or published anything. Do not ask for passwords or verification codes.

- "Services & goods" is the catalog. Use the search bar and filters for categories, cities and prices.
- "Requests" contains tasks posted by people looking for help. An offer in the catalog describes what its author provides.
- To publish an offer, sign in and choose the offer tab in the creation form when it is available for your account. Fill the title, description, category, city and price, then publish.
- To contact the author, use the options available on the listing page. For an imported Telegram offer, use the link to the original post.
- "My orders" shows orders you participate in. Open an order to see its details or report an issue. Payment is arranged directly between the participants.
- To report a listing, use the report action on its page. Open your dashboard to manage your activity and find account settings available to you.`;

export type AssistantConfig = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

export function assistantConfig(
  env: NodeJS.ProcessEnv,
): AssistantConfig | undefined {
  if (env.LLM_ENABLED !== "true") return;

  const url = new URL(env.LLM_BASE_URL || "http://127.0.0.1:11434");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("LLM_BASE_URL must be an HTTP(S) origin");
  }
  const timeoutMs = Number(env.LLM_TIMEOUT_MS || 45000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 55000) {
    throw new Error("LLM_TIMEOUT_MS must be between 1000 and 55000");
  }
  return {
    baseUrl: url.origin,
    model: env.LLM_MODEL?.trim() || "qwen3:8b",
    timeoutMs,
  };
}

export function registerAssistant(
  app: Express,
  requireUser: RequestHandler,
  config: AssistantConfig,
) {
  const endpoint = new URL("/api/chat", config.baseUrl);
  const limit = rateLimit({
    windowMs: 60_000,
    limit: 12,
    keyGenerator: (req: AuthRequest) => req.user!.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Слишком много запросов к помощнику. Попробуйте через минуту.",
    },
  });
  let running = 0;
  app.post("/api/assistant/chat", requireUser, limit, async (req, res) => {
    const input = chatInput.parse(req.body);
    if (running >= 2) {
      throw new HttpError(429, "Помощник занят. Попробуйте чуть позже.");
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = AbortSignal.timeout(config.timeoutMs);
    res.once("close", abort);
    running++;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.any([controller.signal, timeout]),
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: "system",
              content: `${instructions}\nAnswer in ${languages[input.language]}.`,
            },
            ...input.history,
            { role: "user", content: input.message },
          ],
          stream: false,
          think: false,
          options: { num_ctx: 4096, num_predict: 500 },
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Ollama rejected request");
      }
      const { message } = modelReply.parse(await response.json());
      res.json({ answer: message.content.slice(0, answerLimit) });
    } catch {
      if (controller.signal.aborted) return;
      if (timeout.aborted) {
        throw new HttpError(
          504,
          "Модель не успела ответить. Попробуйте ещё раз.",
        );
      }
      throw new HttpError(503, "ИИ-помощник временно недоступен.");
    } finally {
      running--;
      res.off("close", abort);
    }
  });
}
