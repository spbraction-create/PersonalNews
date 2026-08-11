/**
 * מריץ את רכיב גילוי-הפיד (src/feedDiscovery.js) על כל הרשימה ב-data/sources.json.
 * מפיק דוח קריא ב-reports/, ומעדכן את data/sources.json עם מה שנמצא בפועל
 * (README.md שלב 2: "הרצה על כל הרשימה → דוח... עדכון עם כתובות הפיד שנמצאו").
 *
 * הרצה: npm run discover
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { discoverFeed } from "../src/feedDiscovery.js";

const SOURCES_PATH = new URL("../data/sources.json", import.meta.url);
const REPORTS_DIR = new URL("../reports/", import.meta.url);
const CONCURRENCY = 5;

/** מריץ worker על items עם מגבלת מקביליות, בלי תלות חיצונית. */
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}

function buildReport(results, checkedAt) {
  const working = results.filter((r) => r.discovery.ok);
  const failing = results.filter((r) => !r.discovery.ok);

  const lines = [
    `# דוח גילוי-פיד — ${checkedAt}`,
    "",
    `נבדקו ${results.length} מקורות מתוך data/sources.json. עובדים: ${working.length}. לא נמצא פיד: ${failing.length}.`,
    "",
    "## עובדים",
    "",
  ];

  for (const { source, discovery } of working) {
    lines.push(
      `- **${source.name}** (טור/ים: ${source.columns.join(", ")}) — ${discovery.feedUrl} ` +
        `— ${discovery.itemCount} פריטים, שיטה: ${discovery.method}`
    );
  }

  lines.push("", "## לא נמצא פיד אוטומטית", "");
  for (const { source, discovery } of failing) {
    lines.push(`- **${source.name}** (${source.url}) — ${discovery.error}`);
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const raw = await readFile(SOURCES_PATH, "utf8");
  const data = JSON.parse(raw);

  console.log(`מריץ גילוי-פיד על ${data.sources.length} מקורות...\n`);

  const results = await runPool(
    data.sources,
    async (source) => {
      const discovery = await discoverFeed(source.url);
      const icon = discovery.ok ? "✅" : "❌";
      console.log(`${icon} ${source.name} — ${discovery.ok ? discovery.feedUrl : discovery.error}`);
      return { source, discovery };
    },
    CONCURRENCY
  );

  const checkedAt = new Date().toISOString();
  for (const { source, discovery } of results) {
    source.discovered = discovery.ok
      ? {
          feedUrl: discovery.feedUrl,
          itemCount: discovery.itemCount,
          method: discovery.method,
          checkedAt,
        }
      : {
          error: discovery.error,
          candidatesTried: discovery.candidatesTried,
          checkedAt,
        };
  }

  await writeFile(SOURCES_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  await mkdir(REPORTS_DIR, { recursive: true });
  const reportUrl = new URL(`feed-discovery-${checkedAt.slice(0, 10)}.md`, REPORTS_DIR);
  await writeFile(reportUrl, buildReport(results, checkedAt), "utf8");

  const workingCount = results.filter((r) => r.discovery.ok).length;
  console.log(`\nסיכום: ${workingCount}/${results.length} מקורות עם פיד מאומת.`);
  console.log(`דוח נשמר ב: ${fileURLToPath(reportUrl)}`);
  console.log(`data/sources.json עודכן עם התוצאות.`);
}

main().catch((err) => {
  console.error("שגיאה בהרצת גילוי-הפיד:", err);
  process.exitCode = 1;
});
