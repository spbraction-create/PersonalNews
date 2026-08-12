/**
 * קריאות ל-Gemini API מתוך ה-Worker (עמוד הסיכום ה-lazy, README.md שלב 5.2).
 * מקביל ל-src/gemini.js (שמשמש את ה-scripts ב-Node), אבל בלי process.env —
 * בסביבת Worker המפתח מגיע דרך env.GEMINI_API_KEY (secret).
 * גם כאן בכוונה לא נעוץ לגרסת מודל — ראה זיכרון gemini-api-key-setup-gotchas.
 */
const DEFAULT_MODEL = "gemini-flash-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** קורא ל-Gemini ומחזיר טקסט חופשי (לסיכום 300 המילה, שהוא פרוזה). */
export async function generateText(prompt, { apiKey, model, timeoutMs } = {}) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY חסר ב-env של ה-Worker (secret)");
  }
  const url = `${API_BASE}/${model ?? DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? 20000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Gemini API שגיאה ${response.status}: ${data.error?.message ?? JSON.stringify(data)}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null) {
      throw new Error(`Gemini החזיר תשובה בלי טקסט: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}
