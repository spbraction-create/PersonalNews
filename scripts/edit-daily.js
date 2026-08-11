/**
 * שכבת העריכה של היומי (README.md שלב 4, "בריף יומי בלבד" לפי סדר עדיפויות ה-MVP).
 * קורא data/daily-flood.json, מסווג כל כתבה עם Gemini, בונה בריף+כרטיסים לכל טור.
 * פריטי "עומק" רק נשמרים בצד ל-data/depth-queue.json — עוד אין תור מוסף/ירחון אמיתי (זה יבוא בשלב מאוחר יותר).
 *
 * הרצה: npm run edit-daily   (חייב GEMINI_API_KEY זמין — הסקריפט טוען .env בעצמו)
 */
import { readFile, writeFile } from "node:fs/promises";
import { classifyColumnItems } from "../src/classify.js";
import { selectTopNews, writeDailyBrief } from "../src/dailyEdit.js";

const FLOOD_PATH = new URL("../data/daily-flood.json", import.meta.url);
const EDITION_PATH = new URL("../data/daily-edition.json", import.meta.url);
const DEPTH_QUEUE_PATH = new URL("../data/depth-queue.json", import.meta.url);

// EDITORIAL.md §1
const COLUMNS = [
  { id: 1, name: "חדשות / אקטואליה" },
  { id: 2, name: "כלכלה / עסקים" },
  { id: 3, name: "שיווק / פרסום" },
  { id: 4, name: "טק / טכנולוגיה" },
  { id: 5, name: "ספורט" },
];

async function main() {
  const flood = JSON.parse(await readFile(FLOOD_PATH, "utf8"));

  const edition = { generatedAt: new Date().toISOString(), columns: [] };
  const depthQueue = [];

  for (const column of COLUMNS) {
    const items = flood.items.filter((item) => item.columns.includes(column.id));
    if (items.length === 0) {
      console.log(`⏭️  ${column.name} — אין כתבות (אין עדיין מקור מחובר/עובד לטור הזה)`);
      continue;
    }

    console.log(`\n📂 ${column.name} — ${items.length} כתבות, מסווג...`);

    let classifications;
    try {
      classifications = await classifyColumnItems(items, column);
    } catch (err) {
      console.log(`   ❌ סיווג נכשל: ${err.message} — מדלג על הטור הזה היום`);
      continue;
    }

    const newsItems = [];
    for (let i = 0; i < items.length; i++) {
      const c = classifications[i];
      if (c.type === "עומק") {
        depthQueue.push({ ...items[i], column: column.id, depthBucket: c.depthBucket });
      } else {
        newsItems.push(items[i]);
      }
    }
    console.log(`   ${newsItems.length} ידיעה → ליומי, ${items.length - newsItems.length} עומק → לתור`);

    if (newsItems.length === 0) {
      console.log(`   אין ידיעות ליומי בטור הזה היום.`);
      continue;
    }

    let selected;
    try {
      selected = await selectTopNews(newsItems, column);
    } catch (err) {
      console.log(`   ⚠️  שלב הבחירה נכשל (${err.message}) — לוקח את 10 הראשונות כברירת מחדל`);
      selected = newsItems.slice(0, 10);
    }
    if (selected.length < newsItems.length) {
      console.log(`   נבחרו ${selected.length} מתוך ${newsItems.length} (הופעל שלב בחירה, יותר מ-10)`);
    }

    let brief;
    try {
      brief = await writeDailyBrief(selected, column);
    } catch (err) {
      console.log(`   ❌ כתיבת הבריף נכשלה: ${err.message} — מדלג על הטור הזה היום`);
      continue;
    }
    console.log(`   ✅ בריף נכתב (${brief.split(/\s+/).length} מילים בערך), ${selected.length} כרטיסים`);

    edition.columns.push({
      column: column.id,
      name: column.name,
      brief,
      cards: selected.map((item) => ({
        title: item.title,
        summary: item.summary,
        image: item.image,
        link: item.link,
        source: item.source,
      })),
    });
  }

  await writeFile(EDITION_PATH, `${JSON.stringify(edition, null, 2)}\n`, "utf8");
  await writeFile(
    DEPTH_QUEUE_PATH,
    `${JSON.stringify(
      {
        generatedAt: edition.generatedAt,
        note: "עדיין לא מחובר לשום תור אמיתי (KV) — ימתין לשלב שבו נבנה את תור מוסף/ירחון.",
        items: depthQueue,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`\nנשמר: data/daily-edition.json (${edition.columns.length} טורים עם תוכן)`);
  console.log(`נשמר: data/depth-queue.json (${depthQueue.length} פריטי עומק, ממתינים לשלב הבא)`);
}

main().catch((err) => {
  console.error("שגיאה בעריכת היומי:", err);
  process.exitCode = 1;
});
