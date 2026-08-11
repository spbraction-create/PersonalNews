/**
 * מריץ את צינור הקציר (src/harvest.js) על המקורות המאושרים והמאומתים ב-data/sources.json,
 * וכותב את "מבול היום" ל-data/daily-flood.json (README.md שלב 3).
 *
 * הרצה: npm run harvest
 */
import { readFile, writeFile } from "node:fs/promises";
import { harvestSources } from "../src/harvest.js";

const SOURCES_PATH = new URL("../data/sources.json", import.meta.url);
const OUTPUT_PATH = new URL("../data/daily-flood.json", import.meta.url);

async function main() {
  const raw = await readFile(SOURCES_PATH, "utf8");
  const data = JSON.parse(raw);

  const workingApproved = data.sources
    .filter((source) => source.status === "approved" && source.discovered?.feedUrl)
    .map((source) => ({
      name: source.name,
      feedUrl: source.discovered.feedUrl,
      url: source.url,
      columns: source.columns,
    }));

  console.log(`קוצר ${workingApproved.length} מקורות מאושרים עם פיד מאומת...\n`);

  const result = await harvestSources(workingApproved);

  for (const s of result.perSource) {
    if (s.error) {
      console.log(`❌ ${s.name} — שגיאה: ${s.error}`);
    } else {
      console.log(
        `✅ ${s.name} — ${s.itemsInWindow}/${s.totalItems} כתבות בחלון 24 השעות` +
          (s.itemsWithoutDate ? ` (${s.itemsWithoutDate} בלי תאריך תקין, לא נכללו)` : "")
      );
    }
  }

  const output = {
    generatedAt: result.generatedAt,
    windowHours: result.windowHours,
    droppedDuplicates: result.droppedDuplicates,
    items: result.items.map((item) => ({ ...item, pubDate: item.pubDate.toISOString() })),
    perSource: result.perSource,
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    `\nסה"כ ${result.items.length} כתבות ב-24 השעות האחרונות ` +
      `(אחרי ניקוי ${result.droppedDuplicates} כפילויות).`
  );
  console.log("נשמר: data/daily-flood.json");
}

main().catch((err) => {
  console.error("שגיאה בהרצת הקציר:", err);
  process.exitCode = 1;
});
