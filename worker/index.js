/**
 * Cloudflare Worker — שכבת ההגשה (README.md שלב 5).
 * שני נתיבים:
 *  - "/"      עמוד הגיליון הראשי, קורא data/daily-edition.json ישירות מהריפו הציבורי.
 *  - "/read"  עמוד הסיכום ה-lazy לכתבה בודדת (EDITORIAL.md §3.3) — סיכום 300 מילה,
 *             ראשון-בלחיצה נוצר דרך Gemini ונשמר ב-KV, אח"כ מוגש מהמטמון.
 */
import { renderPage, renderReadPage, renderDepthPage, safeUrl } from "./render.js";
import { getOrCreateSummary } from "./articleSummary.js";

async function fetchJson(env, filename) {
  const dataUrl = `${env.DATA_REPO_RAW_BASE}/data/${filename}`;
  const response = await fetch(dataUrl, {
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) {
    throw new Error(`סטטוס ${response.status} בטעינת ${filename} מהריפו`);
  }
  return response.json();
}

async function fetchEdition(env) {
  return fetchJson(env, "daily-edition.json");
}

// /weekly ו-/monthly (EDITORIAL.md §1, §4): כמו handleMainPage, אבל על קובץ ה-edition
// שכותבים scripts/edit-weekly.js / scripts/edit-monthly.js. עמוד המוסף/הירחון תמיד
// מוגש — לא רק בשישי/ב-1 לחודש — מציג את הגיליון האחרון שנוצר עד שיתחלף בפעם הבאה.
const DEPTH_GATES = {
  weekly: {
    file: "weekly-edition.json",
    gateKey: "weekly",
    brandLabel: "מוסף שישי",
    emptyMessage: "אין עדיין מוסף שישי — הגיליון הראשון יופק ביום שישי הקרוב.",
  },
  monthly: {
    file: "monthly-edition.json",
    gateKey: "monthly",
    brandLabel: "ירחון",
    emptyMessage: "אין עדיין ירחון — הגיליון הראשון יופק ב-1 לחודש הקרוב.",
  },
};

async function handleDepthPage(env, gate) {
  const config = DEPTH_GATES[gate];
  let edition;
  try {
    edition = await fetchJson(env, config.file);
  } catch (err) {
    return new Response(`שגיאה בטעינת הגיליון: ${err.message}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(renderDepthPage(edition, config), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
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
    if (url.pathname === "/weekly") {
      return handleDepthPage(env, "weekly");
    }
    if (url.pathname === "/monthly") {
      return handleDepthPage(env, "monthly");
    }
    return handleMainPage(env);
  },

  // רץ אוטומטית לפי [triggers] crons ב-wrangler.toml — אין קשר לבקשות HTTP.
  // אם ההפעלה נכשלת, ה-error יופיע ב-Cron Events בלוח הבקרה וב-`wrangler tail`.
  async scheduled(event, env, ctx) {
    await triggerHarvestWorkflow(env);
  },
};
