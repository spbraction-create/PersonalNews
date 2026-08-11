/**
 * הבריף היומי (EDITORIAL.md §3): טווח יעד 5–10 ידיעות לטור.
 * יותר מ-10 → שלב בחירה (selectTopNews). ואז סינתזה לבריף (writeDailyBrief).
 */
import { generateJson, generateText } from "./gemini.js";

/** רק כשיש יותר מ-10 ידיעות בטור — בוחר את 10 המשמעותיות ביותר. */
export async function selectTopNews(newsItems, column) {
  if (newsItems.length <= 10) return newsItems;

  const listText = newsItems
    .map((item, i) => `${i}. ${item.title} — ${item.summary.slice(0, 150)}`)
    .join("\n");

  const prompt = `אתה עורך היומי של טור "${column.name}". לפניך ${newsItems.length} ידיעות מ-24 השעות האחרונות בטור — יותר מ-10. בחר את 10 המשמעותיות ביותר לקורא שמתעניין ב${column.name}. הקריטריון היחיד הוא חשיבות החדשה עצמה — לא עומק ולא איכות כתיבה. אם כמה ידיעות מכסות את אותו אירוע, בחר את הגרסה הטובה ביותר וותר על השאר.

הידיעות (ממוספרות, מתחיל מ-0):
${listText}

החזר אך ורק מערך JSON של 10 האינדקסים שנבחרו, מסודרים מהחשוב ביותר לפחות חשוב, בפורמט: [3, 0, 7]`;

  const indices = await generateJson(prompt);
  if (!Array.isArray(indices)) {
    throw new Error("הבחירה מ-Gemini לא חזרה כמערך");
  }

  const valid = indices.filter(
    (i) => Number.isInteger(i) && i >= 0 && i < newsItems.length
  );
  const selected = valid.slice(0, 10).map((i) => newsItems[i]);
  return selected.length > 0 ? selected : newsItems.slice(0, 10);
}

/** סינתזה של ~200 מילה מהידיעות שנבחרו (EDITORIAL.md §3, הפרומפט המדויק). */
export async function writeDailyBrief(selectedItems, column) {
  if (selectedItems.length === 0) return null;

  const listText = selectedItems.map((item) => `- ${item.title}: ${item.summary}`).join("\n");
  const globalLocalNote =
    column.id === 1 ? " [חדשות: ישראל נשארת מרכז הכובד.]" : "";

  const prompt = `אתה עורך הבריף היומי של מגזין אישי, טור ${column.name}. לפניך ${selectedItems.length} הידיעות שנבחרו מ-24 השעות האחרונות בטור. תפקידך לכתוב בריף מנהלים רציף של כ-200 מילה שנותן לקורא את התמונה המלאה של מה שקרה — כך שאם יקרא רק אותך, יידע את העיקר.

עקרונות:
- סנתז, אל תרשום. חבר ידיעות קשורות לפסקה אחת קוהרנטית במקום רשימת כותרות.
- תעדף לפי חשיבות — הדבר החשוב ביותר פותח. ידיעת שוליים יכולה להיות משפט או להישמט.
- שלב מקורות ישראליים ובין-לאומיים. אירוע עולמי משמעותי גובר על ידיעה מקומית — אל תעדיף מקומי רק משום שהוא מקומי.${globalLocalNote}
- עובדתי ותמציתי. מה קרה, לא פרשנות — הפרשנות שמורה למוסף.
- כתוב עברית תקנית וזורמת.

הידיעות:
${listText}

כתוב רק את הבריף עצמו, בלי כותרת ובלי הקדמה.`;

  return generateText(prompt);
}
