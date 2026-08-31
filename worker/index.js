/**
 * Cloudflare Worker — שכבת ההגשה (README.md שלב 5).
 * שני נתיבים:
 *  - "/"      עמוד הגיליון הראשי, קורא data/daily-edition.json ישירות מהריפו הציבורי.
 *  - "/read"  עמוד הסיכום ה-lazy לכתבה בודדת (EDITORIAL.md §3.3) — סיכום 300 מילה,
 *             ראשון-בלחיצה נוצר דרך Gemini ונשמר ב-KV, אח"כ מוגש מהמטמון.
 */
import { renderPage, renderReadPage, safeUrl } from "./render.js";
import { getOrCreateSummary } from "./articleSummary.js";

async function fetchEdition(env) {
  const dataUrl = `${env.DATA_REPO_RAW_BASE}/data/daily-edition.json`;
  const response = await fetch(dataUrl, {
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) {
    throw new Error(`סטטוס ${response.status} בטעינת הנתונים מהריפו`);
  }
  return response.json();
}

async function handleMainPage(env) {
  let edition;
  try {
    edition = await fetchEdition(env);
  } catch (err) {
    return new Response(`שגיאה בטעינת הגיליון: ${err.message}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(renderPage(edition), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

async function handleReadPage(request, env) {
  const requestUrl = new URL(request.url);
  const rawLink = requestUrl.searchParams.get("link");
  const link = rawLink ? safeUrl(rawLink) : null;

  if (!link) {
    return new Response("כתובת לא תקינה.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // לא קריטי אם זה נכשל — עדיין אפשר לסכם בלי מטא-דאטה מהגיליון (למשל כתבה מגיליון ישן).
  let edition = null;
  try {
    edition = await fetchEdition(env);
  } catch {
    edition = null;
  }

  let record;
  try {
    record = await getOrCreateSummary(link, env, edition);
  } catch (err) {
    return new Response(`שגיאה ביצירת הסיכום: ${err.message}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if (!record) {
    return new Response("לא הצלחנו לשלוף מספיק מידע כדי לסכם את הכתבה הזו.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(renderReadPage(record), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // סיכום שכבר במטמון אפשר לשמור בקאש ארוך; סיכום טרי — קצר יותר (ליתר ביטחון).
      "cache-control": record.fromCache ? "public, max-age=3600" : "public, max-age=60",
    },
  });
}

/**
 * מפעיל את workflow הקציר+עריכה ב-GitHub Actions דרך REST API (workflow_dispatch).
 * נקרא מתוך ה-scheduled handler למטה, לפי [triggers] crons ב-wrangler.toml.
 * הרקע: ה-schedule של GitHub Actions לא אמין (איחר 6–12 שעות בסוף אוגוסט 2026);
 * Cloudflare Cron Triggers יורים בזמן — הם מחליטים "מתי", GitHub רק מבצע.
 */
async function triggerHarvestWorkflow(env) {
  const url =
    `https://api.github.com/repos/${env.DISPATCH_REPO}` +
    `/actions/workflows/${env.DISPATCH_WORKFLOW_FILE}/dispatches`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub API דוחה בקשות בלי User-Agent.
      "User-Agent": "daily-digest-cron",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`הפעלת ה-workflow נכשלה: ${response.status} ${detail}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/read") {
      return handleReadPage(request, env);
    }
    return handleMainPage(env);
  },

  // רץ אוטומטית לפי [triggers] crons ב-wrangler.toml — אין קשר לבקשות HTTP.
  // אם ההפעלה נכשלת, ה-error יופיע ב-Cron Events בלוח הבקרה וב-`wrangler tail`.
  async scheduled(event, env, ctx) {
    await triggerHarvestWorkflow(env);
  },
};
