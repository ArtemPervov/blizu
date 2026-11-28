export const chatStreamType = "application/x-ndjson";

export type CatalogFilters = {
  category?: string;
  city?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "recommended" | "newest" | "price" | "price_desc" | "rating";
};

export const listingPriceUnits = [
  "услуга",
  "час",
  "порция",
  "товар",
  "кг",
  "консультация",
] as const;

export type ListingDraft = {
  title: string;
  description: string;
  category: string;
  city: string;
  price: number;
  unit: (typeof listingPriceUnits)[number];
};

export type RequestDraft = {
  title: string;
  description: string;
  category: string;
  city: string;
  budget: number;
};

export type DraftAction =
  | { kind: "listingDraft"; id: string; draft: ListingDraft }
  | { kind: "requestDraft"; id: string; draft: RequestDraft };

export type ChatAction =
  | {
      kind: "catalog";
      filters: CatalogFilters;
      total: number;
      listings: {
        id: string;
        title: string;
        city: string;
        price: number | null;
      }[];
    }
  | DraftAction;

export type ChatResult = { answer: string; action?: ChatAction };
export type ChatEvent =
  | { delta: string }
  | { result: ChatResult }
  | { done: true }
  | { error: string };

export async function* readJsonLines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = (pending + decoder.decode(value, { stream: true })).split(
        "\n",
      );
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as unknown;
      }
    }
    const remaining = pending + decoder.decode();
    if (remaining.trim()) yield JSON.parse(remaining) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
