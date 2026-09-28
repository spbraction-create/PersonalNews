/**
 * שכבת העריכה של היומי (README.md שלב 4). קורא data/daily-flood.json, מסווג כל כתבה
 * עם Gemini, בונה בריף+כרטיסים לכל טור.
 *
 * פריטי "עומק" לא נכנסים ליומי — הם נצברים (append, לא overwrite!) לשני קבצי תור
 * נפרדים, אחד לכל שער עתידי: data/weekly-queue.json (עכשווי → מוסף שישי) ו-
 * data/monthly-queue.json (אברגרין → ירחון). קוראים אותם ומאפסים אותם scripts/edit-weekly.js
 * ו-scripts/edit-monthly.js, כל אחד בזמנו. דה-דופ לפי link, כי daily-flood הוא חלון
 * נגלל של 24 שעות ואותה כתבה יכולה לכאורה להופיע גם במבול של יומיים רצופים.
 *
 * הרצה: npm run edit-daily   (חייב GEMINI_API_KEY זמין — הסקריפט טוען .env בעצמו)
 */
import { readFile, writeFile } from "node:fs/promises";
import { classifyColumnItems } from "../src/classify.js";
import { selectTopNews, writeDailyBrief } from "../src/dailyEdit.js";

const FLOOD_PATH = new URL("../data/daily-flood.json", import.meta.url);
const EDITION_PATH = new URL("../data/daily-edition.json", import.meta.url);
const WEEKLY_QUEUE_PATH = new URL("../data/weekly-queue.json", import.meta.url);
const MONTHLY_QUEUE_PATH = new URL("../data/monthly-queue.json", import.meta.url);

/** קורא תור צבירה קיים; אם הקובץ עדיין לא קיים (ריצה ראשונה) — מתחיל מרשימה ריקה. */
async function readQueue(path) {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(raw.items) ? raw.items : [];
  } catch {
    return [];
  }
}

/** מוסיף פריטים חדשים לתור קיים, בלי לשכפל link שכבר נמצא בו. */
function appendDeduped(existingItems, newItems) {
  const seenLinks = new Set(existingItems.map((item) => item.link));
  const toAdd = newItems.filter((item) => !seenLinks.has(item.link));
  return [...existingItems, ...toAdd];
}

async function writeQueue(path, items, gateName) {
  await writeFile(
    path,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: `תור מצטבר לשער ${gateName} — נצרך ומתאפס על ידי scripts/edit-${gateName === "מוסף שישי" ? "weekly" : "monthly"}.js.`,
        items,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

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
  const newWeeklyItems = [];
  const newMonthlyItems = [];

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
        const depthItem = { ...items[i], column: column.id };
        if (c.depthBucket === "אברגרין") {
          newMonthlyItems.push(depthItem);
        } else {
          newWeeklyItems.push(depthItem);
        }
      } else {
        newsItems.push(items[i]);
      }
    }
    console.log(`   ${newsItems.length} ידיעה → ליומי, ${items.length - newsItems.length} עומק → לתור מוסף/ירחון`);

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
        pubDate: item.pubDate, // מ-daily-flood.json, כבר ISO string — לתצוגת "לפני X שעות" בעמוד
      })),
    });
  }

  await writeFile(EDITION_PATH, `${JSON.stringify(edition, null, 2)}\n`, "utf8");

  const existingWeekly = await readQueue(WEEKLY_QUEUE_PATH);
  const existingMonthly = await readQueue(MONTHLY_QUEUE_PATH);
  const weeklyQueue = appendDeduped(existingWeekly, newWeeklyItems);
  const monthlyQueue = appendDeduped(existingMonthly, newMonthlyItems);
  await writeQueue(WEEKLY_QUEUE_PATH, weeklyQueue, "מוסף שישי");
  await writeQueue(MONTHLY_QUEUE_PATH, monthlyQueue, "ירחון");

  console.log(`\nנשמר: data/daily-edition.json (${edition.columns.length} טורים עם תוכן)`);
  console.log(
    `נשמר: data/weekly-queue.json (${newWeeklyItems.length} חדשים היום, ${weeklyQueue.length} מצטבר לשישי)`
  );
  console.log(
    `נשמר: data/monthly-queue.json (${newMonthlyItems.length} חדשים היום, ${monthlyQueue.length} מצטבר לירחון)`
  );
}

main().catch((err) => {
  console.error("שגיאה בעריכת היומי:", err);
  process.exitCode = 1;
});
