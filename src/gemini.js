/**
 * עטפן דק לקריאות ל-Gemini API (README.md שלב 4). בכוונה לא נעוץ לגרסת מודל ספציפית —
 * גוגל מפסיקה גרסאות מהר (ראה זיכרון gemini-api-key-setup-gotchas) — אלא ל-alias
 * מתגלגל (gemini-flash-latest).
 */
const DEFAULT_MODEL = "gemini-flash-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function requireApiKey(apiKey) {
  const key = apiKey ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY חסר. הרץ עם --env-file=.env (למשל: node --env-file=.env scripts/edit-daily.js)"
    );
  }
  return key;
}

// ניסיונות חוזרים (19.10.2026): עד עכשיו כל תקלה חולפת של Gemini — חריגת מכסה (429),
// עומס (503), או תשובה שלקחה יותר מ-30 שניות — הפילה טור שלם בשקט. מ-6.10 טור החדשות
// לא הופיע אף יום, וטור הטק (~100 כתבות) נפל ברוב הימים. לכן: זמן המתנה ארוך יותר,
// ועד 4 ניסיונות עם המתנה הולכת וגדלה בין ניסיון לניסיון.
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [10000, 30000, 60000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** שגיאה שלא שווה לנסות שוב (למשל מפתח לא תקין, 400) — נזרקת מיד. */
class PermanentGeminiError extends Error {}

/** כמה לחכות לפי ה-retryDelay שגוגל מחזיר ב-429 (למשל "37s"), אם יש. */
function serverRetryDelayMs(data) {
  const details = data?.error?.details ?? [];
  for (const d of details) {
    const m = typeof d?.retryDelay === "string" && d.retryDelay.match(/^(\d+(?:\.\d+)?)s$/);
    if (m) return Math.ceil(Number(m[1]) * 1000) + 1000;
  }
  return null;
}

async function callGeminiOnce(prompt, { model, apiKey, timeoutMs, jsonMode }) {
  const key = requireApiKey(apiKey);
  const url = `${API_BASE}/${model ?? DEFAULT_MODEL}:generateContent?key=${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {}),
        }),
      });
    } catch (err) {
      const reason = err.name === "AbortError" ? `לא ענה תוך ${(timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000} שניות` : err.message;
      throw Object.assign(new Error(`Gemini: ${reason}`), { retryAfterMs: null });
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = `Gemini API שגיאה ${response.status}: ${data.error?.message ?? JSON.stringify(data).slice(0, 300)}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) throw new PermanentGeminiError(message);
      throw Object.assign(new Error(message), { retryAfterMs: serverRetryDelayMs(data) });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) {
      throw Object.assign(
        new Error(`Gemini החזיר תשובה בלי טקסט: ${JSON.stringify(data).slice(0, 300)}`),
        { retryAfterMs: null }
      );
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * קורא ל-Gemini עם ניסיונות חוזרים. parse (אופציונלי) רץ על הטקסט בתוך הלולאה —
 * כך שגם JSON שבור בתשובה נחשב תקלה חולפת ומקבל עוד ניסיון.
 */
async function callGemini(prompt, options, parse = (t) => t) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return parse(await callGeminiOnce(prompt, options));
    } catch (err) {
      if (err instanceof PermanentGeminiError) throw err;
      lastError = err;
      if (attempt === MAX_ATTEMPTS) break;
      const wait = Math.max(err.retryAfterMs ?? 0, BACKOFF_MS[attempt - 1]);
      console.log(`   ↻ ניסיון ${attempt} נכשל (${err.message.slice(0, 160)}) — מנסה שוב בעוד ${Math.round(wait / 1000)} שנ'`);
      await sleep(wait);
    }
  }
  throw new Error(`${lastError.message} (אחרי ${MAX_ATTEMPTS} ניסיונות)`);
}

/** קורא ל-Gemini ומחזיר טקסט חופשי (לבריף היומי, שהוא פרוזה, לא JSON). */
export async function generateText(prompt, options = {}) {
  const text = await callGemini(prompt, { ...options, jsonMode: false });
  return text.trim();
}

/** קורא ל-Gemini במצב JSON מובנה (לסיווג ולבחירה) ומפרסר את התוצאה. */
export async function generateJson(prompt, options = {}) {
  return callGemini(prompt, { ...options, jsonMode: true }, (text) => {
    try {
      return JSON.parse(text);
    } catch {
      throw Object.assign(new Error(`Gemini החזיר JSON לא תקין: ${text.slice(0, 300)}`), { retryAfterMs: null });
    }
  });
}
