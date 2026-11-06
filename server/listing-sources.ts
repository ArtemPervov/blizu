import type { ListingSource } from "../shared/types.js";
import { Store } from "./db.js";

type SourceRow = Omit<ListingSource, "kind" | "photos" | "priceKnown"> & {
  listingId: string;
  photos: string;
  priceKnown: number;
};
export function attachListingSources<T extends Record<string, unknown>>(
  store: Store,
  items: T[],
): (T & { source?: ListingSource })[] {
  if (!items.length) return [];
  const sources = new Map(
    store
      .all<SourceRow>(
        `SELECT * FROM listing_sources WHERE listingId IN (${items.map(() => "?").join(",")})`,
        ...items.map((item) => String(item.id)),
      )
      .map(({ listingId, ...row }) => [
        listingId,
        {
          kind: "telegram" as const,
          channel: row.channel,
          messageId: row.messageId,
          authorName: row.authorName,
          postedAt: row.postedAt,
          importedAt: row.importedAt,
          url: row.url,
          priceLabel: row.priceLabel,
          priceKnown: Boolean(row.priceKnown),
          photos: JSON.parse(row.photos) as string[],
        },
      ]),
  );
  return items.map((item) => ({
    ...item,
    ...(sources.has(String(item.id))
      ? { source: sources.get(String(item.id)) }
      : {}),
  }));
}
