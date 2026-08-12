/**
 * "קבל סיכום, וצור אם צריך" — הלב של עמוד הסיכום ה-lazy (README.md שלב 5.2, EDITORIAL.md §3.3).
 * סדר העדיפויות: מטמון KV → אם אין, מטא-דאטה מהגיליון של היום (title/image/source) +
 * טקסט מלא שנשלף מדף המקור → Gemini → שמירה ב-KV.
 */
import { extractArticle } from "./extract.js";
import { generateText } from "./gemini.js";
import { getCachedSummary, putCachedSummary } from "./articleCache.js";

const FETCH_TIMEOUT_MS = 8000;
// חלק מהאתרים חוסמים בקשות בלי User-Agent של דפדפן אמיתי.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function findMetaInEdition(edition, link) {
  if (!edition?.columns) return null;
  for (const column of edition.columns) {
    const match = column.cards?.find((c) => c.link === link);
    if (match) return match;
  }
  return null;
}

function safeHostname(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** שולף את דף הכתבה המקורי. מחזיר null בכל כשל (חסימה/טיים-אאוט/שגיאת רשת) — לא זורק. */
async function fetchArticlePage(link) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(link, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "he,en;q=0.8" },
      signal: controller.signal,
    });
    return response.ok ? response : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildSummaryPrompt({ title, teaser, articleText }) {
  const hasFullText = Boolean(articleText && articleText.length > 200);
  return `אתה עורך שכותב סיכום קצר לכתבה, בשביל קורא שלחץ על כרטיס במגזין אישי ורוצה לדעת את מלוא התמונה לפני שהוא מחליט אם להמשיך למקור המלא.

כותרת הכתבה: ${title || "לא ידועה"}
${teaser ? `תקציר קיים (מה-RSS): ${teaser}` : ""}
${hasFullText ? `טקסט הכתבה המלא (חולץ מהדף):\n${articleText}` : ""}

כתוב סיכום רציף של כ-300 מילה, בעברית תקנית וזורמת, שנותן לקורא את מלוא התמונה של הכתבה — מה קרה, למה זה חשוב, הפרטים המרכזיים.${
    hasFullText
      ? ""
      : " שים לב: אין לך גישה לטקסט המלא של הכתבה, רק לכותרת ולתקציר קצר — כתוב סיכום זהיר על בסיס מה שיש, בלי להמציא פרטים שלא מופיעים במקור."
  }

כתוב רק את הסיכום עצמו, בלי כותרת ובלי הקדמה.`;
}

/**
 * מחזיר { title, image, source, summary, link, generatedAt, fromCache }.
 * מחזיר null אם אין שום חומר לעבוד איתו (לא נמצאה מטא-דאטה בגיליון, וגם שליפת הדף נכשלה) —
 * במקרה הזה לא קוראים ל-Gemini בכלל.
 */
export async function getOrCreateSummary(link, env, todaysEdition) {
  const cached = await getCachedSummary(env.ARTICLE_CACHE, link);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const meta = findMetaInEdition(todaysEdition, link);
  const articlePage = await fetchArticlePage(link);

  let articleText = "";
  let pageTitle = "";
  if (articlePage) {
    const extracted = await extractArticle(articlePage);
    articleText = extracted.text;
    pageTitle = extracted.title;
  }

  const title = meta?.title || pageTitle || "";
  const teaser = meta?.summary || "";

  if (!articleText && !teaser) {
    return null;
  }

  const prompt = buildSummaryPrompt({ title, teaser, articleText });
  const summary = await generateText(prompt, { apiKey: env.GEMINI_API_KEY });

  const record = {
    title,
    image: meta?.image || null,
    source: meta?.source || safeHostname(link),
    summary,
    link,
    generatedAt: new Date().toISOString(),
  };

  await putCachedSummary(env.ARTICLE_CACHE, link, record);
  return { ...record, fromCache: false };
}
