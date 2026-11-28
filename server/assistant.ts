import type { Express, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  chatStreamType,
  readJsonLines,
  type ChatEvent,
  type ChatResult,
} from "../shared/assistant-stream.js";
import {
  assistantTools,
  catalogResult,
  draftKindIn,
  runAssistantTool,
  type FindCatalogListings,
} from "./assistant-actions.js";
import {
  catalogFiltersIn,
  isBareCatalogQuery,
  isCatalogCommand,
} from "./assistant-search.js";
import type { AuthRequest } from "./app.js";
import { HttpError } from "./errors.js";

const answerLimit = 2400;
const contextSize = 4096;
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
  message: z
    .object({
      content: z.string().optional(),
      tool_calls: z
        .array(
          z.object({
            function: z.object({ name: z.string(), arguments: z.unknown() }),
          }),
        )
        .optional(),
    })
    .optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
});

const greeting =
  /^(привет|здравствуйте|здравствуй|добрый день|доброе утро|добрый вечер|hi|hello|hey|ćao|cao|zdravo|dobar dan)[!.\s]*$/iu;
const greetings = {
  ru: "Привет! Чем могу помочь в Blizu?",
  en: "Hello! How can I help you with Blizu?",
  me: "Zdravo! Kako mogu da vam pomognem u Blizu?",
};

const instructions = `You assist people on Blizu, a marketplace for goods and services in Montenegro. When asked to find or open listings, call search_catalog. A request is for someone else to do work. For a request ('заявка'), collect the task and city and call prepare_request. A listing is what the user is offering or selling. For a listing ('объявление' or 'предложение'), collect the listing details and call prepare_listing. Do not announce results before using a tool. The user confirms publication in the interface. Keep guidance short and based on the facts below. Do not ask for passwords or verification codes.

- "Services & goods" is the catalog. Use the search bar and filters for categories, cities and prices.
- "Requests" contains tasks posted by people looking for help. An offer in the catalog describes what its author provides.
- Any signed-in user can publish a listing. Open the listing form and fill in the title, description, category, city and price, then publish.
- To contact the author, use the options available on the listing page. For an imported Telegram offer, use the link to the original post.
- "My orders" shows orders you participate in. Open an order to see its details or report an issue. Payment is arranged directly between the participants.
- To report a listing, use the report action on its page. Open your dashboard to manage your activity and find account settings available to you.`;

export type AssistantConfig = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  keepWarm?: boolean;
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
    keepWarm: (env.LLM_KEEP_WARM ?? "true") === "true",
  };
}

export async function preloadAssistant(config: AssistantConfig) {
  const response = await fetch(new URL("/api/chat", config.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: config.model,
      messages: [],
      stream: false,
      keep_alive: -1,
      options: { num_ctx: contextSize },
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Ollama preload returned HTTP ${response.status}`);
  }
  await response.json();
}

function writeEvent(res: Response, event: ChatEvent) {
  if (!res.headersSent) {
    res.set({
      "Content-Type": `${chatStreamType}; charset=utf-8`,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    });
  }
  res.write(JSON.stringify(event) + "\n");
}

function sendResult(res: Response, streaming: boolean, result: ChatResult) {
  if (streaming) {
    writeEvent(res, { result });
    writeEvent(res, { done: true });
    res.end();
  } else {
    res.json(result);
  }
}

export function registerAssistant(
  app: Express,
  config: AssistantConfig,
  findListings: FindCatalogListings,
) {
  const endpoint = new URL("/api/chat", config.baseUrl);
  const limit = rateLimit({
    windowMs: 60_000,
    limit: 12,
    keyGenerator: (req: AuthRequest) =>
      req.user
        ? `user:${req.user.id}`
        : `ip:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "")}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Слишком много запросов к ассистенту. Попробуйте через минуту.",
    },
  });
  let running = 0;
  app.post("/api/assistant/chat", limit, async (req, res) => {
    const input = chatInput.parse(req.body);
    const streaming = req.accepts(["json", chatStreamType]) === chatStreamType;
    if (greeting.test(input.message)) {
      const answer = greetings[input.language];
      if (streaming) {
        writeEvent(res, { delta: answer });
        writeEvent(res, { done: true });
        res.end();
      } else {
        res.json({ answer });
      }
      return;
    }
    const filters = catalogFiltersIn(input.message);
    const explicitDraft = draftKindIn(input.message);
    if (!explicitDraft && isCatalogCommand(input.message)) {
      sendResult(
        res,
        streaming,
        catalogResult(findListings, filters, input.language),
      );
      return;
    }
    if (!explicitDraft && isBareCatalogQuery(input.message)) {
      const result = catalogResult(findListings, filters, input.language);
      if (result.action?.kind === "catalog" && result.action.total) {
        sendResult(res, streaming, result);
        return;
      }
    }
    if (running >= 2) {
      throw new HttpError(429, "Ассистент занят. Попробуйте чуть позже.");
    }
    const previousQuestion = input.history.at(-2)?.content;
    const draftKind =
      explicitDraft ?? (previousQuestion ? draftKindIn(previousQuestion) : undefined);
    const tools = draftKind
      ? assistantTools.filter(
          ({ function: { name } }) => name === `prepare_${draftKind}`,
        )
      : assistantTools;
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
          stream: streaming,
          tools,
          think: false,
          keep_alive: config.keepWarm ? -1 : "15m",
          options: { num_ctx: contextSize, num_predict: 500 },
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Ollama rejected request");
      }
      if (!streaming) {
        const { message, error } = modelReply.parse(await response.json());
        if (error) throw new Error("Ollama response failed");
        for (const call of message?.tool_calls ?? []) {
          const result = runAssistantTool(
            call.function,
            findListings,
            input.language,
            filters,
            draftKind,
          );
          if (result) {
            sendResult(res, streaming, result);
            return;
          }
        }
        if (!message?.content?.trim()) throw new Error("Empty model response");
        res.json({ answer: message.content.trim().slice(0, answerLimit) });
        return;
      }
      if (!response.body) throw new Error("Missing model response stream");
      let answer = "";
      let done = false;
      for await (const value of readJsonLines(response.body)) {
        const chunk = modelReply.parse(value);
        if (chunk.error) throw new Error("Ollama stream failed");
        for (const call of chunk.message?.tool_calls ?? []) {
          const result = runAssistantTool(
            call.function,
            findListings,
            input.language,
            filters,
            draftKind,
          );
          if (result) {
            sendResult(res, streaming, result);
            return;
          }
        }
        const delta = chunk.message?.content?.slice(
          0,
          answerLimit - answer.length,
        );
        if (delta) {
          answer += delta;
          writeEvent(res, { delta });
        }
        if (chunk.done || answer.length >= answerLimit) {
          done = true;
          break;
        }
      }
      if (!done || !answer.trim()) throw new Error("Incomplete model response");
      writeEvent(res, { done: true });
      res.end();
    } catch {
      if (controller.signal.aborted) return;
      const error = timeout.aborted
        ? new HttpError(504, "Модель не успела ответить. Попробуйте ещё раз.")
        : new HttpError(503, "AI ассистент временно недоступен.");
      if (res.headersSent) {
        writeEvent(res, { error: error.message });
        res.end();
        return;
      }
      throw error;
    } finally {
      running--;
      res.off("close", abort);
    }
  });
}
