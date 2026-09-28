/**
 * המוסף השבועי (EDITORIAL.md §1, §4) — שער "מוסף שישי", בנוסף ליומי.
 * קורא data/weekly-queue.json (פריטי עומק "עכשווי" שנצברו במשך השבוע ע"י edit-daily.js),
 * מפעיל את "העורך הראשי" (src/depthEdit.js) בנפרד לכל טור, כותב data/weekly-edition.json,
 * ואז מאפס את התור (הפריטים שנבחרו *וגם* שלא נבחרו — גיליון חדש כל שבוע, לא נגרר קדימה).
 *
 * שער בזמן: רץ רק אם היום יום שישי בישראל (src/israelTime.js). בכל יום אחר — no-op
 * מכוון (exit 0, לא שגיאה) כדי שאפשר יהיה לקרוא לו כל בוקר בלי תזמון cron נפרד.
 * לבדיקה ידנית בלי להמתין לשישי: FORCE_WEEKLY=1 node scripts/edit-weekly.js
 *
 * הרצה: node scripts/edit-weekly.js   (חייב GEMINI_API_KEY זמין)
 */
import { readFile, writeFile } from "node:fs/promises";
import { isFridayInIsrael } from "../src/israelTime.js";
import { selectDepthItems } from "../src/depthEdit.js";

const QUEUE_PATH = new URL("../data/weekly-queue.json", import.meta.url);
const EDITION_PATH = new URL("../data/weekly-edition.json", import.meta.url);
const GATE_LABEL = "מוסף שישי";

// EDITORIAL.md §1
const COLUMNS = [
  { id: 1, name: "חדשות / אקטואליה" },
  { id: 2, name: "כלכלה / עסקים" },
  { id: 3, name: "שיווק / פרסום" },
  { id: 4, name: "טק / טכנולוגיה" },
  { id: 5, name: "ספורט" },
];

async function main() {
  if (!isFridayInIsrael()) {
    console.log("⏭️  לא יום שישי בישראל — מדלג על המוסף השבועי (FORCE_WEEKLY=1 לבדיקה ידנית).");
    return;
  }

  const queue = JSON.parse(await readFile(QUEUE_PATH, "utf8"));
  const edition = { generatedAt: new Date().toISOString(), gate: GATE_LABEL, columns: [] };
  // רק טורים שבאמת עברו עריכה (בהצלחה) מתאפסים בתור. טור שנכשל (למשל תקלת Gemini
  // חולפת) שומר על הפריטים שלו בתור — לא נכון למחוק תוכן שלא זכה להזדמנות להיערך.
  const handledColumnIds = new Set();

  for (const column of COLUMNS) {
    const items = queue.items.filter((item) => item.column === column.id);
    if (items.length === 0) {
      console.log(`⏭️  ${column.name} — אין פריטי עומק שנצברו השבוע לטור הזה.`);
      continue;
    }

    console.log(`\n📂 ${column.name} — ${items.length} פריטים בתור, עורך ראשי בוחר...`);

    let picked;
    try {
      picked = await selectDepthItems(items, column, GATE_LABEL);
      handledColumnIds.add(column.id);
    } catch (err) {
      console.log(`   ❌ הבחירה נכשלה: ${err.message} — הטור נשאר בתור לשבוע הבא`);
      continue;
    }

    if (picked.length === 0) {
      console.log(`   שום פריט לא נבחר.`);
      continue;
    }
    console.log(`   ✅ נבחרו ${picked.length} מתוך ${items.length}`);

    edition.columns.push({
      column: column.id,
      name: column.name,
      items: picked.map(({ item, why }) => ({
        title: item.title,
        summary: item.summary,
        image: item.image,
        link: item.link,
        source: item.source,
        pubDate: item.pubDate,
        why,
      })),
    });
  }

  await writeFile(EDITION_PATH, `${JSON.stringify(edition, null, 2)}\n`, "utf8");

  // גיליון חדש כל שבוע: פריטי הטורים שנערכו בהצלחה מוסרים מהתור (גם אם לא נבחרו —
  // EDITORIAL.md §4 מדבר על "עכשווי", מטבעו לא נשאר רלוונטי שבוע נוסף). טור שנכשל
  // (Gemini וכו') נשאר בתור בשלמותו, לניסיון חוזר בשבוע הבא.
  const remainingItems = queue.items.filter((item) => !handledColumnIds.has(item.column));
  await writeFile(
    QUEUE_PATH,
    `${JSON.stringify(
      {
        generatedAt: edition.generatedAt,
        note: "תור מצטבר לשער מוסף שישי — נצרך ומתאפס על ידי scripts/edit-weekly.js.",
        items: remainingItems,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`\nנשמר: data/weekly-edition.json (${edition.columns.length} טורים עם תוכן)`);
  console.log(
    `נשמר: data/weekly-queue.json (${remainingItems.length} פריטים נשארו — טורים שנכשלו בעריכה בלבד)`
  );
}

main().catch((err) => {
  console.error("שגיאה בעריכת המוסף השבועי:", err);
  process.exitCode = 1;
});
