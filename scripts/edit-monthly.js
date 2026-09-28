/**
 * הירחון (EDITORIAL.md §1, §4) — שער "ירחון", ב-1 לחודש, בנוסף ליומי ולמוסף.
 * זהה במבנה ל-edit-weekly.js, על data/monthly-queue.json (פריטי עומק "אברגרין"
 * שנצברו על פני החודש) → data/monthly-edition.json.
 *
 * שער בזמן: רץ רק ב-1 לחודש בישראל (src/israelTime.js). לבדיקה ידנית:
 * FORCE_MONTHLY=1 node scripts/edit-monthly.js
 *
 * הרצה: node scripts/edit-monthly.js   (חייב GEMINI_API_KEY זמין)
 */
import { readFile, writeFile } from "node:fs/promises";
import { isFirstOfMonthInIsrael } from "../src/israelTime.js";
import { selectDepthItems } from "../src/depthEdit.js";

const QUEUE_PATH = new URL("../data/monthly-queue.json", import.meta.url);
const EDITION_PATH = new URL("../data/monthly-edition.json", import.meta.url);
const GATE_LABEL = "ירחון";

// EDITORIAL.md §1
const COLUMNS = [
  { id: 1, name: "חדשות / אקטואליה" },
  { id: 2, name: "כלכלה / עסקים" },
  { id: 3, name: "שיווק / פרסום" },
  { id: 4, name: "טק / טכנולוגיה" },
  { id: 5, name: "ספורט" },
];

async function main() {
  if (!isFirstOfMonthInIsrael()) {
    console.log("⏭️  לא ה-1 לחודש בישראל — מדלג על הירחון (FORCE_MONTHLY=1 לבדיקה ידנית).");
    return;
  }

  const queue = JSON.parse(await readFile(QUEUE_PATH, "utf8"));
  const edition = { generatedAt: new Date().toISOString(), gate: GATE_LABEL, columns: [] };
  // רק טורים שבאמת עברו עריכה (בהצלחה) מתאפסים בתור — ראה ההערה המקבילה ב-edit-weekly.js.
  const handledColumnIds = new Set();

  for (const column of COLUMNS) {
    const items = queue.items.filter((item) => item.column === column.id);
    if (items.length === 0) {
      console.log(`⏭️  ${column.name} — אין פריטי עומק שנצברו החודש לטור הזה.`);
      continue;
    }

    console.log(`\n📂 ${column.name} — ${items.length} פריטים בתור, עורך ראשי בוחר...`);

    let picked;
    try {
      picked = await selectDepthItems(items, column, GATE_LABEL);
      handledColumnIds.add(column.id);
    } catch (err) {
      console.log(`   ❌ הבחירה נכשלה: ${err.message} — הטור נשאר בתור לחודש הבא`);
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

  // גיליון חדש כל חודש: פריטי הטורים שנערכו בהצלחה מוסרים מהתור, גם אם לא נבחרו.
  // טור שנכשל נשאר בתור בשלמותו, לניסיון חוזר בחודש הבא.
  const remainingItems = queue.items.filter((item) => !handledColumnIds.has(item.column));
  await writeFile(
    QUEUE_PATH,
    `${JSON.stringify(
      {
        generatedAt: edition.generatedAt,
        note: "תור מצטבר לשער ירחון — נצרך ומתאפס על ידי scripts/edit-monthly.js.",
        items: remainingItems,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`\nנשמר: data/monthly-edition.json (${edition.columns.length} טורים עם תוכן)`);
  console.log(
    `נשמר: data/monthly-queue.json (${remainingItems.length} פריטים נשארו — טורים שנכשלו בעריכה בלבד)`
  );
}

main().catch((err) => {
  console.error("שגיאה בעריכת הירחון:", err);
  process.exitCode = 1;
});
