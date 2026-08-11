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

async function callGemini(prompt, { model, apiKey, timeoutMs, jsonMode }) {
  const key = requireApiKey(apiKey);
  const url = `${API_BASE}/${model ?? DEFAULT_MODEL}:generateContent?key=${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? 30000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...(jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Gemini API שגיאה ${response.status}: ${data.error?.message ?? JSON.stringify(data)}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) {
      throw new Error(`Gemini החזיר תשובה בלי טקסט: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** קורא ל-Gemini ומחזיר טקסט חופשי (לבריף היומי, שהוא פרוזה, לא JSON). */
export async function generateText(prompt, options = {}) {
  const text = await callGemini(prompt, { ...options, jsonMode: false });
  return text.trim();
}

/** קורא ל-Gemini במצב JSON מובנה (לסיווג ולבחירה) ומפרסר את התוצאה. */
export async function generateJson(prompt, options = {}) {
  const text = await callGemini(prompt, { ...options, jsonMode: true });
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini החזיר JSON לא תקין: ${text.slice(0, 300)}`);
  }
}
