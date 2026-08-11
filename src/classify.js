/**
 * שרשרת הסיווג (EDITORIAL.md §2): ידיעה מול עומק, ואם עומק — עכשווי מול אברגרין.
 * קריאה אחת ל-Gemini לכל טור (לא לכל כתבה בנפרד) — יעיל יותר ומספיק לצורך הזה.
 */
import { generateJson } from "./gemini.js";

function buildPrompt(items, column) {
  const listText = items
    .map((item, i) => `${i}. ${item.title}\n${item.summary.slice(0, 200)}`)
    .join("\n\n");

  const globalLocalNote =
    column.id === 1
      ? "\nהערה לטור הזה: ישראל היא מרכז הכובד, אבל אירוע עולמי משמעותי גובר על ידיעה מקומית שולית — אל תעדיף מקומי רק משום שהוא מקומי."
      : "";

  return `אתה עורך שמסווג כתבות עבור טור "${column.name}" במגזין אישי.
לכל כתבה ברשימה למטה, סווג לפי השרשרת הבאה:

1. ידיעה או עומק?
   - ידיעה = דיווח על מה שקרה.
   - עומק = למה זה קרה, פרשנות, ניתוח, צבע, פרופיל, טרנד.
   - מבחן הדולר: "הדולר עלה היום" = ידיעה. "למה הדולר עולה — ניתוח הגורמים" = עומק.
2. אם עומק — עכשווי או אברגרין?
   - עכשווי = קשור לרוח התקופה, ייצרך תוך שבוע.
   - אברגרין = ניתוח שלא מתיישן, רלוונטי גם בעוד חודש.${globalLocalNote}

הכתבות (ממוספרות, מתחיל מ-0):
${listText}

החזר אך ורק מערך JSON, פריט אחד לכל כתבה, לפי אותו סדר, בפורמט הזה בדיוק:
[{"index": 0, "type": "ידיעה"}, {"index": 1, "type": "עומק", "depthBucket": "עכשווי"}]
type הוא "ידיעה" או "עומק" בלבד. depthBucket ("עכשווי" או "אברגרין") נדרש רק כש-type הוא "עומק".`;
}

/**
 * @param {object[]} items כתבות של טור אחד (עם title, summary).
 * @param {{ id: number, name: string }} column
 * @returns {Promise<{ type: string, depthBucket: string|null }[]>} תוצאה באותו סדר וגודל כמו items.
 */
export async function classifyColumnItems(items, column) {
  if (items.length === 0) return [];

  const raw = await generateJson(buildPrompt(items, column));
  if (!Array.isArray(raw)) {
    throw new Error("הסיווג מ-Gemini לא חזר כמערך");
  }

  const byIndex = new Map(raw.map((entry) => [entry.index, entry]));
  return items.map((_, i) => {
    const entry = byIndex.get(i);
    if (!entry || (entry.type !== "ידיעה" && entry.type !== "עומק")) {
      // Gemini לא סיווג כתבה זו כראוי — עדיף להחמיץ בזהירות ולא לדחוף בטעות לבריף
      return { type: "עומק", depthBucket: "עכשווי", note: "סיווג נכשל, נשלח לתור ליתר ביטחון" };
    }
    return {
      type: entry.type,
      depthBucket: entry.type === "עומק" ? (entry.depthBucket ?? "עכשווי") : null,
    };
  });
}
