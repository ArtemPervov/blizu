import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Store, now } from "./db.js";
import {
  selectTelegramAds,
  TELEGRAM_CHANNEL,
  type ImportedAd,
  type TelegramExport,
} from "./telegram-export.js";

function inside(root: string, path: string) {
  const rel = relative(root, path);
  return (
    rel !== ".." &&
    !rel.startsWith("..\\") &&
    !rel.startsWith("../") &&
    !isAbsolute(rel)
  );
}
function imageData(exportDir: string, photo: string) {
  if (!/^photos[\\/]/.test(photo))
    throw new Error("Фотография должна находиться в photos/.");
  const root = realpathSync(exportDir),
    path = realpathSync(resolve(root, photo));
  if (!inside(root, path))
    throw new Error("Фотография находится вне папки экспорта.");
  const size = statSync(path).size;
  if (size < 12 || size > 10 * 1024 * 1024)
    throw new Error("Недопустимый размер фотографии.");
  const data = readFileSync(path);
  const ext =
    data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      ? "jpg"
      : data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "png"
        : data.toString("ascii", 0, 4) === "RIFF" &&
            data.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
  if (!ext) throw new Error("Ожидается фотография JPEG, PNG или WebP.");
  const filename = `${createHash("sha256").update(data).digest("hex")}.${ext}`;
  return { data, filename };
}
export function importTelegramAds(
  store: Store,
  ads: ImportedAd[],
  exportDir: string,
  dataDir: string,
) {
  const providerId = "source-telegram-montenegrobye";
  const ready = ads.filter(
    (ad) =>
      !store.get(
        "SELECT listingId FROM listing_sources WHERE url=? OR (channel=? AND contentHash=?)",
        `https://t.me/${TELEGRAM_CHANNEL}/${ad.messageId}`,
        TELEGRAM_CHANNEL,
        ad.contentHash,
      ),
  );
  // Validate every referenced image before changing the catalogue.
  const files = new Map<string, Buffer>();
  const prepared = ready.map((ad) => ({
    ...ad,
    files: ad.photos.map((photo) => {
      const image = imageData(exportDir, photo);
      files.set(image.filename, image.data);
      return image.filename;
    }),
  }));
  const imageDir = resolve(dataDir, "uploads", "listings");
  mkdirSync(imageDir, { recursive: true });
  for (const [filename, data] of files)
    if (!existsSync(resolve(imageDir, filename)))
      writeFileSync(resolve(imageDir, filename), data, { flag: "wx" });
  const importedAt = now();
  store.transaction(() => {
    if (
      ready.length &&
      !store.get("SELECT id FROM users WHERE id=?", providerId)
    )
      store.run(
        "INSERT INTO users (id,name,email,password,city,role,contact,rating,verified,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
        providerId,
        "Объявления из Telegram",
        "montenegrobye@imports.blizu.invalid",
        "external-source-no-login",
        "Вся Черногория",
        "provider",
        "",
        0,
        0,
        importedAt,
      );
    for (const ad of prepared) {
      const id = `tg-${TELEGRAM_CHANNEL}-${ad.messageId}`;
      const photos = ad.files.map(
        (filename) => `/api/listing-images/${id}/${filename}`,
      );
      store.run(
        "INSERT INTO listings (id,providerId,title,description,category,city,price,unit,image,tags,reviewCount,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        providerId,
        ad.title,
        ad.description,
        ad.category,
        ad.city,
        ad.price,
        "объявление",
        photos[0] ?? "/images/telegram-placeholder.svg",
        JSON.stringify(["Из Telegram"]),
        0,
        ad.postedAt,
      );
      store.run(
        "INSERT INTO listing_sources (listingId,channel,messageId,authorName,postedAt,importedAt,url,priceLabel,priceKnown,photos,contentHash) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        id,
        TELEGRAM_CHANNEL,
        ad.messageId,
        ad.authorName,
        ad.postedAt,
        importedAt,
        `https://t.me/${TELEGRAM_CHANNEL}/${ad.messageId}`,
        ad.priceLabel,
        Number(ad.priceKnown),
        JSON.stringify(photos),
        ad.contentHash,
      );
    }
  });
  return {
    selected: ads.length,
    imported: ready.length,
    skipped: ads.length - ready.length,
    images: files.size,
  };
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "Этот импорт предназначен только для локальной dev-версии.",
    );
  const args = process.argv.slice(2);
  const exportAt = args.indexOf("--export");
  if (exportAt < 0 || !args[exportAt + 1])
    throw new Error(
      "Укажите --export <папка Telegram Desktop>. По умолчанию выполняется только предпросмотр; --apply записывает данные.",
    );
  const exportDir = resolve(args[exportAt + 1]),
    file = resolve(exportDir, "result.json");
  const htmlFile = resolve(exportDir, "messages.html");
  const format = existsSync(file) ? "json" : "html";
  if (!existsSync(file) && !existsSync(htmlFile))
    throw new Error(
      "В папке нет result.json или messages.html. Выберите папку экспорта Telegram Desktop.",
    );
  const apply = args.includes("--apply"),
    watch = args.includes("--wait");
  const deadline = Date.now() + 12 * 60 * 60 * 1000;
  let data: TelegramExport | undefined;
  let lastLog = 0;
  while (!data) {
    const before = statSync(format === "json" ? file : htmlFile);
    try {
      if (format === "html") {
        const { readTelegramHtml } = await import("./telegram-html.js");
        data = readTelegramHtml(exportDir);
      } else {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as TelegramExport;
        const after = statSync(file);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
          throw new SyntaxError("Export is changing");
        data = parsed;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      if (!watch || Date.now() >= deadline)
        throw new Error(
          "Экспорт ещё не завершён или повреждён. Дождитесь окончания экспорта в Telegram Desktop.",
        );
      if (Date.now() - lastLog > 60_000) {
        console.log(
          `${now()} — ожидаем завершения ${format.toUpperCase()}-экспорта.`,
        );
        lastLog = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  const ads = selectTelegramAds(data, 100);
  if (ads.length !== 100)
    throw new Error(
      `Найдено только ${ads.length} подходящих объявлений. Импорт не выполнялся.`,
    );
  mkdirSync(resolve(".context"), { recursive: true });
  const report = resolve(".context", "telegram-import-report.json");
  writeFileSync(
    report,
    JSON.stringify(
      {
        generatedAt: now(),
        exportDir,
        format,
        messages: data.messages.length,
        ads,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      selected: ads.length,
      latest: ads[0].postedAt,
      earliest: ads.at(-1)!.postedAt,
      report,
      apply,
    }),
  );
  if (!apply) return;
  // Intentionally ignores DATA_DIR: a local import must never target a deployed volume.
  const dataDir = resolve("data"),
    dbPath = resolve(dataDir, "blizu.sqlite");
  if (!existsSync(dbPath))
    throw new Error(
      "Сначала запустите локальную dev-версию: база data/blizu.sqlite не найдена.",
    );
  const store = new Store(dbPath);
  try {
    if (!store.get("SELECT id FROM users WHERE id='demo-customer'"))
      throw new Error(
        "Импорт разрешён только в локальную базу с демо-данными.",
      );
    const backupDir = resolve("backups");
    mkdirSync(backupDir, { recursive: true });
    const backup = resolve(backupDir, `before-telegram-${Date.now()}.sqlite`);
    store.run("VACUUM INTO ?", backup);
    const result = importTelegramAds(store, ads, exportDir, dataDir);
    writeFileSync(
      resolve(".context", "telegram-import-result.json"),
      JSON.stringify({ ...result, finishedAt: now(), backup, report }, null, 2),
    );
    console.log(JSON.stringify({ ...result, backup }));
  } finally {
    store.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Импорт не выполнен.",
    );
    process.exitCode = 1;
  });
