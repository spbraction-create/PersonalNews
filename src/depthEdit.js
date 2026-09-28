/**
 * "העורך הראשי" של המוסף/הירחון (EDITORIAL.md §4) — לא סופר מדפים כמו היומי.
 * מקבל את כל פריטי ה"עומק" שנצברו לטור אחד בשער הזה, ומחזיר 5–10 מהם מדורגים
 * מהחזק לחלש, עם משפט הנמקה קצר לכל אחד. הפרומפט הוא ציטוט מדויק של §4 —
 * שינוי עריכתי = לעדכן EDITORIAL.md, לא כאן (README.md, "עקרונות שלא משתנים").
 */
import { generateJson } from "./gemini.js";

/**
 * @param {"מוסף שישי"|"ירחון"} gateLabel
 */
function buildPrompt(items, column, gateLabel) {
  const listText = items
    .map((item, i) => `${i}. ${item.title}\n${item.summary.slice(0, 300)}`)
    .join("\n\n");

  const freshnessNote =
    gateLabel === "מוסף שישי"
      ? "קשור לרוח התקופה"
      : "יישאר רלוונטי גם בעוד זמן";

  return `אתה העורך הראשי של מגזין אישי. לפניך רשימת פריטים שסוננו כ"עומק" עבור הטור ${column.name}, מועמדים לגיליון ${gateLabel}. תפקידך לבחור בטווח של 5 עד 10 — לא חובה למלא 10, אבל שאף להגיע לפחות ל-5 אם יש מספיק חומר ראוי. אם רק 6 ראויים, בחר 6. אם ממש אין מספיק פריטים איכותיים אפילו ל-5, בחר פחות. עורך טוב מעדיף גיליון קצר ומצוין על פני גיליון מלא ובינוני.

דרג כל פריט לפי הסדר הזה:
1. מהותיות — עד כמה זה משמעותי לקורא שמתעניין ב${column.name}. טרנד או שינוי גדול גובר על ידיעת שוליים.
2. עומק ואיכות — כתבה שמלמדת, מנתחת או חושפת גוברת על אזכור שטחי.
3. רעננות ורלוונטיות — ${freshnessNote}.

ואז ערוך את הבחירה כמכלול:
- מגוון (מפרק שוויון בלבד) — מהותיות תמיד גוברת. השתמש במגוון רק כדי להכריע בין פריטים ברמת חשיבות דומה, לעולם לא כדי להעדיף פריט קליל על פני מידע חשוב שחייב להגיע. אם כמה כתבות מכסות נושא זהה, בחר את הטובה וותר על השאר.
- איזון — גיליון טוב נושם. ערבב כבד וקליל אם המקורות מאפשרים, בלי לפגוע בעיקרון לעיל.

הפריטים (ממוספרים, מתחיל מ-0):
${listText}

החזר את הפריטים הנבחרים בלבד, מדורגים מהחזק לחלש, עם משפט קצר לכל אחד שמסביר למה נבחר.
החזר אך ורק מערך JSON בפורמט הזה בדיוק, בלי טקסט נוסף: [{"index": 3, "why": "..."}, {"index": 0, "why": "..."}]`;
}

/**
 * @param {object[]} items פריטי עומק של טור אחד, שנצברו במשך השבוע/החודש (עם title, summary, link, ...).
 * @param {{ id: number, name: string }} column
 * @param {"מוסף שישי"|"ירחון"} gateLabel
 * @returns {Promise<{ item: object, why: string }[]>} מדורג מהחזק לחלש, 0–10 פריטים.
 */
export async function selectDepthItems(items, column, gateLabel) {
  if (items.length === 0) return [];

  // פחות מ-5 זמינים בכלל — אין טעם להפעיל שלב בחירה, וגם לא נכון לכפות סף תחתון
  // (EDITORIAL.md §4: "אם ממש אין מספיק פריטים איכותיים... אפשר גם פחות מ-5").
  if (items.length <= 5) {
    return items.map((item) => ({ item, why: null }));
  }

  const raw = await generateJson(buildPrompt(items, column, gateLabel));
  if (!Array.isArray(raw)) {
    throw new Error("בחירת העורך הראשי מ-Gemini לא חזרה כמערך");
  }

  const seen = new Set();
  const picked = [];
  for (const entry of raw) {
    const idx = entry?.index;
    if (!Number.isInteger(idx) || idx < 0 || idx >= items.length || seen.has(idx)) continue;
    seen.add(idx);
    picked.push({ item: items[idx], why: typeof entry.why === "string" ? entry.why : null });
  }

  if (picked.length === 0) {
    // גיבוי זהיר: אם הפענוח נכשל בפועל, מוטב עשרה ראשונים לא מדורגים מאשר גיליון ריק.
    return items.slice(0, 10).map((item) => ({ item, why: null }));
  }
  return picked.slice(0, 10);
}
