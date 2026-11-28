import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

export function createListingPreviews(uploadDir: string) {
  const previewDir = resolve(uploadDir, "listing-previews");
  const pending = new Map<string, Promise<string>>();

  async function generate(file: string, preview: string) {
    await mkdir(previewDir, { recursive: true });
    const temporaryFile = `${preview}.${randomUUID()}.tmp`;
    try {
      await sharp(resolve(uploadDir, "listings", file), {
        limitInputPixels: 24_000_000,
      })
        .autoOrient()
        .resize(640, 640, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78, effort: 3 })
        .toFile(temporaryFile);
      await rename(temporaryFile, preview);
      return preview;
    } finally {
      await rm(temporaryFile, { force: true });
    }
  }

  return async (file: string) => {
    const preview = resolve(previewDir, `${file}.640.webp`);
    try {
      await access(preview);
      return preview;
    } catch {
      // Existing imports get their preview on the first request.
    }

    const existing = pending.get(file);
    if (existing) return existing;

    const task = generate(file, preview).finally(() => pending.delete(file));
    pending.set(file, task);
    return task;
  };
}
